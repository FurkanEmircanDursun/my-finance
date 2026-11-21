param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [string]$JavaHome,
    [string]$ExpectedCertificateSha256 = 'cd8aa14a4ef80b19f8568640adf41ccc0e7bdf43473381b363f41f942e6e8015',
    [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'
$taskFrontend = Split-Path -Parent $PSScriptRoot
$taskWorkspace = Split-Path -Parent $taskFrontend
$taskAndroid = Join-Path $taskFrontend 'android'

if (-not $JavaHome) {
    $taskCandidates = @($env:JAVA_HOME, 'C:\Program Files\Java\jdk-21', 'C:\Program Files\Android\Android Studio\jbr')
    foreach ($taskCandidate in $taskCandidates) {
        if (-not $taskCandidate -or -not (Test-Path -LiteralPath (Join-Path $taskCandidate 'bin\java.exe'))) { continue }
        $taskJavaVersion = & (Join-Path $taskCandidate 'bin\java.exe') -version 2>&1 | Out-String
        if ($taskJavaVersion -match 'version "21[\.]') { $JavaHome = $taskCandidate; break }
    }
}
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) {
    throw 'JDK 21 bulunamadı. -JavaHome ile JDK 21 klasörünü belirtin.'
}

$taskSdk = $env:ANDROID_HOME
if (-not $taskSdk) { $taskSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath $taskSdk)) { throw 'Android SDK bulunamadı. ANDROID_HOME ayarlayın.' }
if ($Configuration -eq 'Release' -and -not (Test-Path -LiteralPath (Join-Path $taskAndroid 'keystore.properties'))) {
    throw 'Release imzası yapılandırılmamış. Test APK için -Configuration Debug kullanın.'
}

$taskOldJava = $env:JAVA_HOME
$taskOldSdk = $env:ANDROID_HOME
$taskOldSdkRoot = $env:ANDROID_SDK_ROOT
$taskOldJavaOptions = $env:JAVA_TOOL_OPTIONS
$taskOldPath = $env:PATH
$taskSocketTemp = Join-Path $taskAndroid '.gradle\socket-tmp'
New-Item -ItemType Directory -Path $taskSocketTemp -Force | Out-Null

function Invoke-Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Komut başarısız oldu (çıkış kodu $LASTEXITCODE)." }
}

try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $taskSdk
    $env:ANDROID_SDK_ROOT = $taskSdk
    $env:PATH = (Join-Path $JavaHome 'bin') + ';' + $taskOldPath
    # A short socket directory avoids the Windows JVM loopback failure in desktop runners.
    $env:JAVA_TOOL_OPTIONS = "$taskOldJavaOptions -Djava.net.preferIPv4Stack=true -Djdk.net.unixdomain.tmpdir=`"$taskSocketTemp`""
    Push-Location $taskFrontend
    try {
        if (-not $SkipWebBuild) { Invoke-Checked { npm.cmd run build } }
        Invoke-Checked { npx.cmd cap sync android }
    } finally { Pop-Location }

    Push-Location $taskAndroid
    try { Invoke-Checked { & .\gradlew.bat ":app:assemble$Configuration" --no-daemon --console=plain } }
    finally { Pop-Location }

    $taskVariant = $Configuration.ToLowerInvariant()
    $taskApk = Join-Path $taskAndroid "app\build\outputs\apk\$taskVariant\app-$taskVariant.apk"
    if (-not (Test-Path -LiteralPath $taskApk)) { throw 'APK çıktısı bulunamadı.' }
    $taskVersion = (Get-Content -LiteralPath (Join-Path $taskFrontend 'package.json') -Raw | ConvertFrom-Json).version
    $taskAndroidVersion = [regex]::Match((Get-Content -LiteralPath (Join-Path $taskAndroid 'app\build.gradle') -Raw), 'versionName\s+"([^"]+)"').Groups[1].Value
    if ($taskAndroidVersion -ne $taskVersion) { throw "Android ($taskAndroidVersion) ve web ($taskVersion) sürümleri farklı." }
    $taskArtifacts = Join-Path $taskWorkspace 'artifacts'
    New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
    $taskOutput = Join-Path $taskArtifacts "my-finance-$taskVersion-android-$taskVariant.apk"
    Copy-Item -LiteralPath $taskApk -Destination $taskOutput -Force

    $taskVerification = @{ Apk = $taskOutput; Dist = (Join-Path $taskFrontend 'dist'); ExpectedVersion = $taskVersion }
    if ($Configuration -eq 'Release') { $taskVerification.ExpectedCertificateSha256 = $ExpectedCertificateSha256 }
    & (Join-Path $PSScriptRoot 'verify-android.ps1') @taskVerification
    Write-Output "APK: $taskOutput"
} finally {
    $env:JAVA_HOME = $taskOldJava
    $env:ANDROID_HOME = $taskOldSdk
    $env:ANDROID_SDK_ROOT = $taskOldSdkRoot
    $env:JAVA_TOOL_OPTIONS = $taskOldJavaOptions
    $env:PATH = $taskOldPath
}
