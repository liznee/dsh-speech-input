# dsh-speech-input-win-bridge.ps1
# On-demand Windows speech recognition bridge for the dsh-speech-input plugin.
#
# HTTP server on 127.0.0.1:<port>:
#   GET  /health         -> { ok, error }
#   POST /start          -> runs ONE Windows recognition pass (listens, returns text), { text, error }
#   GET  /result         -> { text, error }
#   POST /stop           -> returns final { text } (process exits)
#
# Recognition uses single-shot Windows.Media.SpeechRecognition.RecognizeAsync,
# which works in PowerShell without any TypedEventHandler event wiring. The
# /start handler blocks until the engine returns one transcript, then hands it
# back. The client calls /start once per dictation; /stop shuts the process down.
# The process also exits on an idle timeout so it never lingers in the background.
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

# --- WinRT await helper -------------------------------------------------------
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRT($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

# --- Recognition state --------------------------------------------------------
$LastText = ''
$LastError = $null

function New-Recognizer {
  $langType = [Type]::GetType('Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime')
  $lang = [Activator]::CreateInstance($langType, @('zh-Hans-CN'))
  $srType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
  $rec = [Activator]::CreateInstance($srType, @($lang))

  # Best-effort local dictation constraint (offline-friendly).
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

# Run one recognition pass. Returns { text, error }. RecognizeAsync blocks until
# one transcript is available (or speech ends), then returns it directly.
function Recognize-Once {
  $recognizer = $null
  try {
    $recognizer = New-Recognizer
    $langType = [Type]::GetType('Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime')
    $lang = [Activator]::CreateInstance($langType, @('zh-Hans-CN'))
    try { $null = Await-WinRT $recognizer.TrySetSystemSpeechLanguageAsync($lang) ([bool]) } catch {}

    $compType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $compiled = Await-WinRT $recognizer.CompileConstraintsAsync() ($compType)
    if ($compiled.Status -ne 'Success') { $LastError = "compile:$($compiled.Status)"; return @{ text = ''; error = $LastError } }

    $resultType = [Type]::GetType('Windows.Media.SpeechRecognition.SpeechRecognitionResult, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime')
    $result = Await-WinRT $recognizer.RecognizeAsync() ($resultType)
    return @{ text = [string]$result.Text; error = $null }
  } catch {
    $msg = $_.Exception.Message
    $LastError = if ($msg -match 'privacy policy') { 'privacy-policy-not-accepted' } else { $msg }
    return @{ text = ''; error = $LastError }
  } finally {
    if ($null -ne $recognizer) { try { $recognizer.Dispose() } catch {} }
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
      if ([datetime]::UtcNow -gt $loopEnd) { break }
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
      Send-Json $res 200 @{ ok = $true; error = $LastError }
    }
    elseif ($path -eq '/start') {
      $out = Recognize-Once
      $LastText = [string]$out.text
      $LastError = $out.error
      Send-Json $res 200 @{ text = $out.text; error = $out.error }
    }
    elseif ($path -eq '/result') {
      Send-Json $res 200 @{ text = $LastText; error = $LastError }
    }
    elseif ($path -eq '/stop') {
      Send-Json $res 200 @{ text = $LastText; final = $true }
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
exit 0
