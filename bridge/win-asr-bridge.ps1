# dsh-speech-input-win-bridge.ps1
# On-demand Windows speech recognition bridge for the dsh-speech-input plugin.
#
# HTTP server on 127.0.0.1:<port>:
#   GET  /health         -> { ok, running, error, text }
#   POST /start          -> begin CONTINUOUS recognition (zh-Hans-CN), { started }
#   GET  /result         -> { text, error, running }
#   POST /stop           -> stop recognition, { text }  (process exits)
#
# Recognition uses Windows.Media.SpeechRecognition ContinuousRecognitionSession so
# text accumulates as the user keeps speaking (like Win+H). The /start handler is
# non-blocking: it starts the session and returns immediately; the HTTP loop keeps
# serving /result while recognition runs, and the process exits on /stop or idle.
#
# Requirements: Windows 10/11 with a Chinese (Simplified) speech language pack
# installed (zh-Hans-CN), and the speech privacy policy accepted in the
# interactive user session (as Win+H voice typing requires).

param(
  [int]$Port = 8765,
  [int]$IdleTimeoutMs = 120000
)

$ErrorActionPreference = 'Stop'
try { Add-Type -AssemblyName 'System.Runtime.WindowsRuntime' -ErrorAction Stop } catch {
  Write-Output "ERR_RUNTIME: $($_.Exception.Message)"
  exit 1
}

# --- WinRT await helpers ------------------------------------------------------
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
})[0]

function Await-WinRT($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

function Await-Action($WinRtAction) {
  if ($null -eq $asTaskAction) { return }
  $netTask = $asTaskAction.Invoke($null, @($WinRtAction))
  $netTask.Wait(-1) | Out-Null
}

# --- Recognition state --------------------------------------------------------
$Recognizer = $null
$CurrentText = ''
$LastError = $null
$Running = $false

function New-Recognizer {
  $langType = [Type]::GetType('Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime')
  $lang = [Activator]::CreateInstance($langType, @('zh-Hans-CN'))
  $srType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
  $rec = [Activator]::CreateInstance($srType, @($lang))

  # Best-effort local dictation constraint.
  try {
    $cons = $rec.Constraints
    $scenType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionScenario, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $topicType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionTopicConstraint, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $dictation = [Enum]::Parse($scenType, 'Dictation')
    $constraint = [Activator]::CreateInstance($topicType, @($dictation, 'dictation'))
    $append = $cons.GetType().GetMethod('Append')
    if ($null -eq $append) { $append = $cons.GetType().GetMethods() | Where-Object { $_.Name -eq 'Append' } | Select-Object -First 1 }
    if ($null -ne $append) { $append.Invoke($cons, @($constraint)) | Out-Null }
  } catch {}

  return $rec
}

function Start-Recognition {
  $script:LastError = $null
  $script:CurrentText = ''
  if ($null -eq $script:Recognizer) {
    $script:Recognizer = New-Recognizer
  }
  $langType = [Type]::GetType('Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime')
  $lang = [Activator]::CreateInstance($langType, @('zh-Hans-CN'))
  try { $null = Await-WinRT $script:Recognizer.TrySetSystemSpeechLanguageAsync($lang) ([bool]) } catch {}
  try {
    $compType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $compiled = Await-WinRT $script:Recognizer.CompileConstraintsAsync() ($compType)
    if ($compiled.Status -ne 'Success') { $script:LastError = "compile:$($compiled.Status)"; $script:Running = $false; return }
    $session = $script:Recognizer.ContinuousRecognitionSession
    # Accumulate recognized text.
    $resHandler = [Windows.Foundation.TypedEventHandler[Windows.Media.SpeechRecognition.SpeechContinuousRecognitionSession, Windows.Media.SpeechRecognition.SpeechContinuousRecognitionResultGeneratedEventArgs]] {
      param($sender, $args)
      try {
        $r = $args.Result
        if ($r.Text) { $script:CurrentText = $r.Text }
      } catch {}
    }
    $session.add_ResultGenerated($resHandler)
    $hypHandler = [Windows.Foundation.TypedEventHandler[Windows.Media.SpeechRecognition.SpeechContinuousRecognitionSession, Windows.Media.SpeechRecognition.SpeechContinuousRecognitionHypothesisGeneratedEventArgs]] {
      param($sender, $args)
      try {
        if ($args.Hypothesis.Text) { $script:CurrentText = $args.Hypothesis.Text }
      } catch {}
    }
    $session.add_HypothesisGenerated($hypHandler)
    Await-Action $session.StartAsync()
    $script:Running = $true
  } catch {
    $msg = $_.Exception.Message
    $script:LastError = if ($msg -match 'privacy policy') { 'privacy-policy-not-accepted' } else { $msg }
    $script:Running = $false
  }
}

function Stop-Recognition {
  $script:Running = $false
  if ($null -ne $script:Recognizer) {
    try {
      $session = $script:Recognizer.ContinuousRecognitionSession
      Await-Action $session.StopAsync()
    } catch {}
    try { $script:Recognizer.Dispose() } catch {}
    $script:Recognizer = $null
  }
}

# --- Tiny HTTP server ----------------------------------------------------------
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Output "listening_on_$Port"

function Send-Json($response, $statusCode, $obj) {
  $json = $obj | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $statusCode
  $response.ContentType = 'application/json; charset=utf-8'
  $response.ContentLength64 = $bytes.Length
  $response.AddHeader('Access-Control-Allow-Origin', '*')
  $response.AddHeader('Access-Control-Allow-Headers', 'Content-Type, X-DSH-Speech')
  $response.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

$loopEnd = [datetime]::UtcNow.AddMilliseconds($IdleTimeoutMs)
while ($listener.IsListening) {
  $context = $null
  try {
    $task = $listener.GetContextAsync()
    $done = $task.Wait(250)
    if (-not $done) {
      if ([datetime]::UtcNow -gt $loopEnd -and -not $Running) { break }
      continue
    }
    $context = $task.Result
  } catch {
    break
  }
  $req = $context.Request
  $res = $context.Response
  $path = $req.Url.AbsolutePath

  try {
    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.AddHeader('Access-Control-Allow-Origin', '*')
      $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, X-DSH-Speech')
      $res.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      $res.Close()
      continue
    }

    if ($path -eq '/health') {
      Send-Json $res 200 @{ ok = $true; running = $Running; error = $LastError; text = $CurrentText }
    }
    elseif ($path -eq '/start') {
      Start-Recognition
      Send-Json $res 200 @{ started = $Running; error = $LastError }
    }
    elseif ($path -eq '/result') {
      Send-Json $res 200 @{ text = $CurrentText; error = $LastError; running = $Running }
    }
    elseif ($path -eq '/stop') {
      $finalText = $CurrentText
      Stop-Recognition
      Send-Json $res 200 @{ text = $finalText; final = $true }
      break
    }
    else {
      Send-Json $res 404 @{ error = 'not_found' }
    }
  } catch {
    try { Send-Json $res 500 @{ error = $_.Exception.Message } } catch {}
  }
}

if ($listener.IsListening) { $listener.Stop() }
if ($null -ne $script:Recognizer) { try { $script:Recognizer.Dispose() } catch {} }
exit 0
