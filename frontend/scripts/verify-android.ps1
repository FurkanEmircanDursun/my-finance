param(
    [Parameter(Mandatory = $true)]
    [string]$Apk,
    [string]$Dist,
    [string]$ExpectedVersion,
    [string]$ExpectedCertificateSha256,
    [string]$ExpectedApplicationId = 'com.faraday.followfinance',
    [string[]]$RequiredPlugins = @('@capacitor-firebase/authentication', '@capacitor-firebase/analytics', '@capacitor/local-notifications', '@capacitor/push-notifications')
)

$ErrorActionPreference = 'Stop'
$taskApk = (Resolve-Path -LiteralPath $Apk).Path
$taskSdk = $env:ANDROID_HOME
if (-not $taskSdk) { $taskSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$taskBuildTools = Get-ChildItem -LiteralPath (Join-Path $taskSdk 'build-tools') -Directory |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $taskBuildTools) { throw 'Android build-tools bulunamadı.' }

$taskSigner = Join-Path $taskBuildTools.FullName 'apksigner.bat'
$taskSignatureOutput = & $taskSigner verify --verbose --print-certs $taskApk 2>&1
if ($LASTEXITCODE -ne 0) { throw "APK imzası doğrulanamadı: $($taskSignatureOutput -join [Environment]::NewLine)" }
$taskSignatureText = $taskSignatureOutput -join [Environment]::NewLine
$taskCertificate = [regex]::Match($taskSignatureText, '(?m)^(?:Signer #\d+|V\d(?:\.\d+)? Signer:) certificate SHA-256 digest: ([a-fA-F0-9]+)').Groups[1].Value.ToLowerInvariant()
if (-not $taskCertificate) { throw 'APK sertifikası okunamadı.' }
if ($ExpectedCertificateSha256 -and $taskCertificate -ne ($ExpectedCertificateSha256 -replace ':', '').ToLowerInvariant()) {
    throw "APK imzası beklenen anahtarla eşleşmiyor. Beklenen: $ExpectedCertificateSha256; bulunan: $taskCertificate. Mevcut uygulamayı kaldırmayın."
}

$taskBadgingOutput = & (Join-Path $taskBuildTools.FullName 'aapt.exe') dump badging $taskApk 2>&1
if ($LASTEXITCODE -ne 0) { throw 'APK paket bilgileri okunamadı.' }
$taskBadging = $taskBadgingOutput -join [Environment]::NewLine
$taskPackage = [regex]::Match($taskBadging, "package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'")
if (-not $taskPackage.Success) { throw 'APK paket kimliği okunamadı.' }
if ($taskPackage.Groups[1].Value -ne $ExpectedApplicationId) { throw 'APK paket kimliği beklenen uygulama ile eşleşmiyor.' }
if ($ExpectedVersion -and $taskPackage.Groups[3].Value -ne $ExpectedVersion) { throw 'APK sürümü beklenen sürüm ile eşleşmiyor.' }
$taskPermissions = @([regex]::Matches($taskBadging, "uses-permission: name='([^']+)'") | ForEach-Object { $_.Groups[1].Value })
foreach ($taskForbiddenPermission in @('android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.USE_EXACT_ALARM', 'com.google.android.gms.permission.AD_ID')) {
    if ($taskForbiddenPermission -in $taskPermissions) { throw "APK gereksiz özel izin içeriyor: $taskForbiddenPermission" }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchive = [System.IO.Compression.ZipFile]::OpenRead($taskApk)
$taskAssetCount = 0
$taskPlugins = @()
try {
    if ($Dist) {
        $taskDist = (Resolve-Path -LiteralPath $Dist).Path.TrimEnd('\', '/')
        foreach ($taskFile in (Get-ChildItem -LiteralPath $taskDist -Recurse -File)) {
            $taskRelative = $taskFile.FullName.Substring($taskDist.Length + 1).Replace('\', '/')
            $taskEntry = $taskArchive.GetEntry("assets/public/$taskRelative")
            if (-not $taskEntry) { throw "APK içinde web dosyası eksik: $taskRelative" }
            $taskHashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
            $taskStream = $taskEntry.Open()
            try { $taskEntryHash = [BitConverter]::ToString($taskHashAlgorithm.ComputeHash($taskStream)).Replace('-', '') }
            finally { $taskStream.Dispose(); $taskHashAlgorithm.Dispose() }
            if ($taskEntryHash -ne (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash) {
                throw "APK içindeki web dosyası güncel değil: $taskRelative"
            }
            $taskAssetCount++
        }
    }
    $taskPluginEntry = $taskArchive.GetEntry('assets/capacitor.plugins.json')
    if (-not $taskPluginEntry) { throw 'APK içinde Capacitor plugin listesi eksik.' }
    $taskReader = [System.IO.StreamReader]::new($taskPluginEntry.Open())
    try { $taskPlugins = @($taskReader.ReadToEnd() | ConvertFrom-Json | ForEach-Object { $_.pkg }) }
    finally { $taskReader.Dispose() }
    foreach ($taskRequiredPlugin in $RequiredPlugins) {
        if ($taskRequiredPlugin -notin $taskPlugins) { throw "APK içinde gerekli plugin eksik: $taskRequiredPlugin" }
    }
} finally { $taskArchive.Dispose() }

$taskHash = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLowerInvariant()
$taskReport = [ordered]@{
    apk = (Split-Path -Leaf $taskApk)
    sha256 = $taskHash
    bytes = (Get-Item -LiteralPath $taskApk).Length
    applicationId = $taskPackage.Groups[1].Value
    versionCode = [int]$taskPackage.Groups[2].Value
    versionName = $taskPackage.Groups[3].Value
    minSdk = [int][regex]::Match($taskBadging, "sdkVersion:'(\d+)'").Groups[1].Value
    targetSdk = [int][regex]::Match($taskBadging, "targetSdkVersion:'(\d+)'").Groups[1].Value
    certificateSha256 = $taskCertificate
    signatureVerified = $true
    matchingWebAssets = $taskAssetCount
    plugins = $taskPlugins
    permissions = $taskPermissions
    verifiedAtUtc = [DateTime]::UtcNow.ToString('o')
}
"$taskHash  $(Split-Path -Leaf $taskApk)" | Set-Content -LiteralPath "$taskApk.sha256" -Encoding utf8
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$taskApk.verification.json" -Encoding utf8
$taskReport | ConvertTo-Json -Depth 5
