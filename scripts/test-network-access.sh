#!/bin/bash
# Script to test network access to OCR Engine from multiple endpoints

set -e

echo "=== OCR Engine Network Access Test ==="
echo ""

# Get network information
HOST_IP=$(hostname -I | awk '{print $1}')
echo "Host IP: $HOST_IP"
echo ""

# Test functions
test_endpoint() {
    local url=$1
    local description=$2
    
    echo -n "Testing $description: $url ... "
    
    if curl -s --connect-timeout 5 --max-time 10 "$url" >/dev/null 2>&1; then
        echo "✅ SUCCESS"
        return 0
    else
        echo "❌ FAILED"
        return 1
    fi
}

test_endpoint_with_response() {
    local url=$1
    local description=$2
    
    echo "Testing $description: $url"
    
    response=$(curl -s --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "ERROR")
    
    if [ "$response" = "ERROR" ]; then
        echo "❌ FAILED - No response"
        echo ""
        return 1
    else
        echo "✅ SUCCESS - Response: $response"
        echo ""
        return 0
    fi
}

# Basic connectivity tests
echo "=== Basic Connectivity Tests ==="
test_endpoint "http://localhost:8100/health" "Local health check"
test_endpoint "http://$HOST_IP:8100/health" "Network health check"
test_endpoint "http://127.0.0.1:8100/health" "Loopback health check"
echo ""

# Detailed API tests
echo "=== API Endpoint Tests ==="
test_endpoint_with_response "http://localhost:8100/health" "Health endpoint"
test_endpoint_with_response "http://localhost:8100/api/formats" "Formats endpoint"
test_endpoint_with_response "http://localhost:8100/api/sessions" "Sessions endpoint"

# Container status check
echo "=== Container Status ==="
if docker ps | grep -q "marker-ocr-web"; then
    container_name=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep marker-ocr | awk '{print $1}')
    container_status=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep marker-ocr | awk '{print $2" "$3" "$4}')
    echo "✅ Container running: $container_name ($container_status)"
    
    # Get container IP
    container_ip=$(docker inspect $container_name --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "unknown")
    echo "Container IP: $container_ip"
else
    echo "❌ No OCR Engine container found running"
fi
echo ""

# Network interface information
echo "=== Network Interface Information ==="
echo "Available network interfaces:"
ip addr show | grep -E "inet.*scope global" | awk '{print "  " $2 " on " $NF}'
echo ""

# Port listening check
echo "=== Port Listening Check ==="
if netstat -tlnp 2>/dev/null | grep -q ":8100 "; then
    echo "✅ Port 8100 is being listened on"
    netstat -tlnp 2>/dev/null | grep ":8100 " | head -1
else
    echo "❌ Port 8100 is not being listened on"
fi
echo ""

# Docker network information
echo "=== Docker Network Information ==="
if command -v docker >/dev/null 2>&1; then
    echo "Docker networks:"
    docker network ls | grep -E "ocr|marker" || echo "  No OCR-related networks found"
    echo ""
    
    if docker ps | grep -q "marker-ocr-web"; then
        echo "Container network details:"
        container_name=$(docker ps --format "{{.Names}}" | grep marker-ocr | head -1)
        docker inspect $container_name --format='{{range $k, $v := .NetworkSettings.Networks}}Network: {{$k}}, IP: {{$v.IPAddress}}, Gateway: {{$v.Gateway}}{{end}}' 2>/dev/null || echo "  Could not get network details"
    fi
else
    echo "Docker not available"
fi
echo ""

# Summary and recommendations
echo "=== Summary and Recommendations ==="
echo "OCR Engine Network Access Information:"
echo "  Local URL: http://localhost:8100"
echo "  Network URL: http://$HOST_IP:8100"
echo "  API Base: http://$HOST_IP:8100/api"
echo ""
echo "For n8n OCR Engine node configuration:"
echo "  API Base URL: http://$HOST_IP:8100"
echo ""
echo "If network access fails from other servers:"
echo "1. Check Windows Firewall (run scripts/windows-firewall-setup.ps1)"
echo "2. Verify WSL2 port forwarding is configured"
echo "3. Check your router/network firewall settings"
echo "4. Ensure the OCR Engine container is running with network binding"
echo ""
echo "Test complete! 🔍"