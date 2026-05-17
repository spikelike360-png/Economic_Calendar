$projectDir = "e:\Economic_Calendar"

# If already running, just open browser
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", 3000)
    $tcp.Close()
    Start-Process "msedge" "--app=http://localhost:3000 --window-size=1400,900"
    exit
} catch {}

# Check production build exists
if (-not (Test-Path "$projectDir\.next\BUILD_ID")) {
    $result = [System.Windows.Forms.MessageBox]::Show(
        "No production build found. Run rebuild.bat first.",
        "Macro Dashboard", 0, 48)
    exit
}

# Start production server hidden (no CMD window)
Start-Process -FilePath "cmd" `
    -ArgumentList "/c cd /d `"$projectDir`" && npm start" `
    -WindowStyle Hidden

# Poll TCP until port 3000 is open (max 15s)
$attempts = 0
while ($attempts -lt 15) {
    Start-Sleep 1
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", 3000)
        $tcp.Close()
        break
    } catch {}
    $attempts++
}

Start-Process "msedge" "--app=http://localhost:3000 --window-size=1400,900"
