#!/bin/bash
# Simple startup script for OCR Engine
# Supports both local and network access modes

set -e

echo "🚀 Starting OCR Engine"
echo "==================="

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker is not installed or not in PATH"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check for network access mode
if [ "$1" = "--network" ] || [ "$1" = "-n" ]; then
    echo "🌐 Starting in NETWORK ACCESS mode..."
    export HOST_BIND=0.0.0.0
    export HOST=0.0.0.0
    export CORS_ORIGINS=*
    echo "   Container will be accessible from other servers"
else
    echo "🏠 Starting in LOCAL mode..."
    echo "   Container will only be accessible locally"
    echo "   Use: $0 --network for network access"
fi

# Start the container
echo "📦 Starting Docker container..."
docker-compose up -d

# Wait for container to be ready
echo "⏳ Waiting for OCR Engine to start..."
sleep 5

# Check if container is running
if docker ps | grep -q "marker-ocr-web"; then
    echo "✅ OCR Engine started successfully!"
    
    # Get host IP for network mode
    if [ "$1" = "--network" ] || [ "$1" = "-n" ]; then
        HOST_IP=$(hostname -I | awk '{print $1}')
        echo ""
        echo "🌐 Network Access URLs:"
        echo "   Local:   http://localhost:8100"
        echo "   Network: http://$HOST_IP:8100"
        echo "   API:     http://$HOST_IP:8100/api"
        echo ""
        echo "💡 Next steps for network access:"
        echo "   1. Configure firewall: ./scripts/windows-firewall-setup.ps1"
        echo "   2. Test access: curl http://$HOST_IP:8100/health"
    else
        echo ""
        echo "🏠 Local Access URL:"
        echo "   http://localhost:8100"
    fi
    
    echo ""
    echo "📊 Container Status:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep marker-ocr
else
    echo "❌ Failed to start OCR Engine"
    echo "📋 Container logs:"
    docker-compose logs --tail=10
    exit 1
fi