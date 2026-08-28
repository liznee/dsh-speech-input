# dsh-speech-input-win-bridge.ps1
# On-demand Windows speech recognition bridge for the dsh-speech-input plugin.
#
# Runs a tiny HTTP server on 127.0.0.1:<port> that:
#   GET  /health         -> { ok: true }  (probe; the process exits if idle too long)
#   POST /start          -> starts continuous recognition (zh-Hans-CN), returns { started: true }
#   GET  /result         -> { text: "...", final: true|false }  (latest recognized text plus final flag)
#   POST /stop           -> stops recognition, returns final { text }, then the process exits.
#
# It is launched on demand by the DSH host plugin and exits on /stop or after an idle timeout,
# so it never lingers in the background.
#
# Requirements: Windows 10/11 with a Chinese (Simplified) speech language pack installed
# (zh-Hans-CN). The online speech recognition privacy setting must be accepted in the
# interactive user session, exactly as Win+H voice typing requires.

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

# IAsyncAction (no result) -> Task
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
  $netTask = $asTaskAction.Invoke($null, @($WinRtAction))
  $netTask.Wait(-1) | Out-Null
}

# --- Recognition session state ------------------------------------------------
$CurrentText = ''
$CurrentFinal = $true
$RecognitionStarted = $false
$Recognizer = $null
$LastError = $null

function New-Recognizer {
  $langType = [Type]::GetType('Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime')
  if ($null -eq $langType) { throw 'Language type not resolvable' }
  $lang = [Activator]::CreateInstance($langType, @('zh-Hans-CN'))

  $srType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
  if ($null -eq $srType) { throw 'SpeechRecognizer type not resolvable' }

  $rec = [Activator]::CreateInstance($srType, @($lang))

  # Attach an event handler that accumulates recognized text.
  # Use ContinuousRecognitionSession + ResultGenerated / HypothesisGenerated.
  $recType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
  $contSession = $rec.ContinuousRecognitionSession

  $resHandler = [Windows.Foundation.TypedEventHandler[Windows.Media.SpeechRecognition.SpeechContinuousRecognitionSession, Windows.Media.SpeechRecognition.SpeechContinuousRecognitionResultGeneratedEventArgs]] {
    param($sender, $args)
    try {
      $result = $args.Result
      $text = $result.Text
      if ($text) {
        $script:CurrentText = $text
        $script:CurrentFinal = ($result.Status -eq 'Success')
      }
    } catch {}
  }
  $contSession.add_ResultGenerated($resHandler)

  $hypHandler = [Windows.Foundation.TypedEventHandler[Windows.Media.SpeechRecognition.SpeechContinuousRecognitionSession, Windows.Media.SpeechRecognition.SpeechContinuousRecognitionHypothesisGeneratedEventArgs]] {
    param($sender, $args)
    try {
      $hyp = $args.Hypothesis
      if ($hyp.Text) { $script:CurrentText = $hyp.Text; $script:CurrentFinal = $false }
    } catch {}
  }
  $contSession.add_HypothesisGenerated($hypHandler)

  $script:Recognizer = $rec
  return $rec
}

function Start-Recognition {
  $script:LastError = $null
  if ($null -eq $script:Recognizer) {
    New-Recognizer | Out-Null
  }
  $langType = [Type]::GetType('Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime')
  $lang = [Activator]::CreateInstance($langType, @('zh-Hans-CN'))
  # TrySetSystemSpeechLanguageAsync is optional; guard it for SKUs that omit it.
  try {
    $null = Await-WinRT $script:Recognizer.TrySetSystemSpeechLanguageAsync($lang) ([bool])
  } catch {}
  # Prefer a local dictation constraint (offline-friendly). CompileConstraintsAsync
  # succeeds even without it, but the constraint makes the engine use the local
  # language model rather than the online transcription path.
  try {
    $cons = $script:Recognizer.Constraints
    $scenType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionScenario, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $topicType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionTopicConstraint, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $dictation = [Enum]::Parse($scenType, 'Dictation')
    $constraint = [Activator]::CreateInstance($topicType, @($dictation, 'dictation'))
    $append = $cons.GetType().GetMethod('Append')
    if ($null -eq $append) { $append = $cons.GetType().GetMethods() | Where-Object { $_.Name -eq 'Append' } | Select-Object -First 1 }
    if ($null -ne $append) { $append.Invoke($cons, @($constraint)) | Out-Null }
  } catch {}
  try {
    $compType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $compiled = Await-WinRT $script:Recognizer.CompileConstraintsAsync() ($compType)
    if ($compiled.Status -ne 'Success') {
      $script:LastError = "compile-failed:$($compiled.Status)"
      Write-Output "ERR_COMPILE: $($compiled.Status)"
      return
    }
    $session = $script:Recognizer.ContinuousRecognitionSession
    Await-Action $session.StartAsync()
    $script:RecognitionStarted = $true
    Write-Output "recognized_started"
  } catch {
    # Recognizer could not start (e.g. the speech privacy policy was not
    # accepted, or no mic/audio input device). Surface a clear, actionable error.
    $message = $_.Exception.Message
    $script:LastError = if ($message -match 'privacy policy') { 'privacy-policy-not-accepted' } else { $message }
    Write-Output "ERR_START: $($_.Exception.GetType().Name): $message"
  }
}

function Stop-Recognition {
  if ($null -ne $script:Recognizer -and $script:RecognitionStarted) {
    try {
      $session = $script:Recognizer.ContinuousRecognitionSession
      Await-Action $session.StopAsync()
    } catch {}
    $script:RecognitionStarted = $false
  }
  if ($null -ne $script:Recognizer) { $script:Recognizer.Dispose(); $script:Recognizer = $null }
}

# --- Tiny HTTP server ----------------------------------------------------------
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Output "listening_on_$Port"

# Respond helper
function Send-Json($response, $statusCode, $obj) {
  $json = $obj | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $statusCode
  $response.ContentType = 'application/json; charset=utf-8'
  $response.ContentLength64 = $bytes.Length
  # CORS so a browser plugin on another origin can call us.
  $response.AddHeader('Access-Control-Allow-Origin', '*')
  $response.AddHeader('Access-Control-Allow-Headers', 'Content-Type, X-DSH-Speech')
  $response.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

$loopEnd = [datetime]::UtcNow.AddMilliseconds($IdleTimeoutMs)
while ($listener.IsListening) {
  if (-not $listener.IsListening) { break }
  # Poll for a pending context instead of blocking forever, so we can honor idle timeout.
  $context = $null
  try {
    $task = $listener.GetContextAsync()
    $done = $task.Wait(250)
    if (-not $done) {
      if ([datetime]::UtcNow -gt $loopEnd -and -not $RecognitionStarted) { break }
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
      Send-Json $res 200 @{ ok = $true; started = $RecognitionStarted; error = $script:LastError }
    }
    elseif ($path -eq '/start') {
      Start-Recognition
      Send-Json $res 200 @{ started = $RecognitionStarted; error = $script:LastError }
    }
    elseif ($path -eq '/result') {
      Send-Json $res 200 @{ text = $CurrentText; final = $CurrentFinal; error = $script:LastError }
    }
    elseif ($path -eq '/stop') {
      Stop-Recognition
      $finalText = $CurrentText
      Send-Json $res 200 @{ text = $finalText; final = $true }
      # After /stop, exit the loop so the process goes away.
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
