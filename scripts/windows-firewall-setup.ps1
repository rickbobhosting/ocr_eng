# PowerShell script to configure Windows Firewall for OCR Engine
# Run as Administrator

Write-Host "=== OCR Engine Windows Firewall Setup ===" -ForegroundColor Green
Write-Host "Configuring Windows Firewall to allow OCR Engine access..." -ForegroundColor Yellow

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Remove existing rules if they exist
Write-Host "Removing existing OCR Engine firewall rules..." -ForegroundColor Yellow
Remove-NetFirewallRule -DisplayName "OCR Engine Inbound" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "OCR Engine Outbound" -ErrorAction SilentlyContinue

# Create inbound rule for port 8100
Write-Host "Creating inbound firewall rule for port 8100..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "OCR Engine Inbound" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 8100 `
    -Action Allow `
    -Profile Domain,Private,Public `
    -Description "Allow inbound connections to OCR Engine on port 8100"

# Create outbound rule for port 8100
Write-Host "Creating outbound firewall rule for port 8100..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "OCR Engine Outbound" `
    -Direction Outbound `
    -Protocol TCP `
    -LocalPort 8100 `
    -Action Allow `
    -Profile Domain,Private,Public `
    -Description "Allow outbound connections from OCR Engine on port 8100"

# Configure WSL2 port forwarding (if needed)
Write-Host "Checking WSL2 configuration..." -ForegroundColor Yellow

# Get WSL2 IP address
$wslIp = (wsl hostname -I).Trim()
Write-Host "WSL2 IP Address: $wslIp" -ForegroundColor Cyan

# Get Windows host IP
$hostIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like "*Ethernet*" -or $_.InterfaceAlias -like "*WiFi*"} | Select-Object -First 1).IPAddress
Write-Host "Windows Host IP: $hostIp" -ForegroundColor Cyan

# Configure port forwarding from Windows to WSL2
Write-Host "Setting up port forwarding from Windows to WSL2..." -ForegroundColor Yellow

# Remove existing port proxy if it exists
try {
    netsh interface portproxy delete v4tov4 listenport=8100 listenaddress=0.0.0.0
} catch {
    # Ignore errors if rule doesn't exist
}

# Add new port proxy rule
netsh interface portproxy add v4tov4 listenport=8100 listenaddress=0.0.0.0 connectport=8100 connectaddress=$wslIp

# Show current port proxy configuration
Write-Host "Current port proxy configuration:" -ForegroundColor Yellow
netsh interface portproxy show v4tov4

# Test connectivity
Write-Host "=== Testing Connectivity ===" -ForegroundColor Green
Write-Host "Local access test:" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8100/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Local access: SUCCESS" -ForegroundColor Green
} catch {
    Write-Host "❌ Local access: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Network access test:" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://$hostIp:8100/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Network access: SUCCESS" -ForegroundColor Green
} catch {
    Write-Host "❌ Network access: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "" 
Write-Host "=== Configuration Summary ===" -ForegroundColor Green
Write-Host "Windows Host IP: $hostIp" -ForegroundColor Cyan
Write-Host "WSL2 IP: $wslIp" -ForegroundColor Cyan
Write-Host "OCR Engine URL (local): http://localhost:8100" -ForegroundColor Cyan
Write-Host "OCR Engine URL (network): http://$hostIp:8100" -ForegroundColor Cyan
Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Green
Write-Host "1. Test from another computer: curl http://$hostIp:8100/health" -ForegroundColor Yellow
Write-Host "2. Update your n8n OCR Engine API URL to: http://$hostIp:8100" -ForegroundColor Yellow
Write-Host "3. If still having issues, check your router/network firewall" -ForegroundColor Yellow
Write-Host ""
Write-Host "Setup complete! 🚀" -ForegroundColor Green