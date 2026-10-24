$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location $projectDirectory
$previousEmail = [Environment]::GetEnvironmentVariable('SETUP_OWNER_EMAIL', 'Process')
$previousPassword = [Environment]::GetEnvironmentVariable('SETUP_OWNER_PASSWORD', 'Process')
function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Install Docker Desktop for Windows, restart if requested, and open Docker Desktop before running this file again.'
    }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Open Docker Desktop and wait until it says the engine is running. Then run Start-CRM again.' }
    if (-not (Test-Path '.windows.env')) {
        $configuration = "POSTGRES_PASSWORD=$(New-RandomSecret)`nSESSION_SECRET=$(New-RandomSecret)`n"
        [System.IO.File]::WriteAllText((Join-Path $projectDirectory '.windows.env'), $configuration, (New-Object System.Text.UTF8Encoding($false)))
    }
    Write-Host 'Starting ARCED CRM. The first start downloads software and can take several minutes.'
    & docker compose --env-file .windows.env up --build -d
    if ($LASTEXITCODE -ne 0) { throw 'Startup did not finish. Keep this window open and share the error text, without passwords.' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 3
            if ($health.ok) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'The app has not become ready. Run docker compose --env-file .windows.env logs app to inspect the startup error.' }
    & docker compose --env-file .windows.env exec -T app node scripts/create-owner.js --check
    $accountStatus = $LASTEXITCODE
    if ($accountStatus -eq 2) {
        Write-Host ''
        Write-Host 'Create your private owner login. Nothing you type here is sent to this chat.'
        $env:SETUP_OWNER_EMAIL = (Read-Host 'Your email address').Trim()
        $password = Read-Host 'Choose a password (12 to 200 characters)' -AsSecureString
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
        try { $env:SETUP_OWNER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer); $password.Dispose() }
        & docker compose --env-file .windows.env exec -T -e SETUP_OWNER_EMAIL -e SETUP_OWNER_PASSWORD app node scripts/create-owner.js
        if ($LASTEXITCODE -ne 0) { throw 'The login was not created. Run Start-CRM again and choose a valid email and a password of at least 12 characters.' }
    } elseif ($accountStatus -ne 0) {
        throw 'Could not check the owner account. Check the database connection before trying again.'
    }
    Write-Host ''
    Write-Host 'Your CRM is ready on this computer. Sign in with the account you created.'
    Start-Process 'http://127.0.0.1:3000'
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('SETUP_OWNER_EMAIL', $previousEmail, 'Process')
    [Environment]::SetEnvironmentVariable('SETUP_OWNER_PASSWORD', $previousPassword, 'Process')
    Pop-Location
}
