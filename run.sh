#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Path to the HTML file
HTML_FILE="$SCRIPT_DIR/index.html"

# Check if the HTML file exists
if [ ! -f "$HTML_FILE" ]; then
    echo "Error: index.html not found in $SCRIPT_DIR"
    exit 1
fi

# Function to find available port
find_available_port() {
    local port=8000
    while netstat -ln 2>/dev/null | grep -q ":$port "; do
        port=$((port + 1))
    done
    echo $port
}

# Get local IP address
LOCAL_IP=$(ip addr show | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}' | cut -d'/' -f1)

# Start local web server
PORT=$(find_available_port)
echo "Starting Schedule app server on port $PORT..."
echo "Access URLs:"
echo "  Local: http://localhost:$PORT"
if [ ! -z "$LOCAL_IP" ]; then
    echo "  Network: http://$LOCAL_IP:$PORT"
fi

# Start Claude API server in background
cd "$SCRIPT_DIR"
python3 api-server.py &
API_PID=$!

# Start server in background
python3 -m http.server $PORT --bind 0.0.0.0 &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Open browser
if command -v xdg-open > /dev/null; then
    # Linux
    xdg-open "http://localhost:$PORT"
elif command -v open > /dev/null; then
    # macOS
    open "http://localhost:$PORT"
elif command -v start > /dev/null; then
    # Windows (WSL or Git Bash)
    start "http://localhost:$PORT"
else
    echo "Cannot determine how to open browser on this system."
    echo "Please open the following URL manually in your browser:"
    echo "http://localhost:$PORT"
fi

echo "Schedule app is running with Claude integration!"
echo "Web Server PID: $SERVER_PID (port $PORT)"
echo "Claude API PID: $API_PID (port 8001)"
if [ ! -z "$LOCAL_IP" ]; then
    echo ""
    echo "📱 Phone access: http://$LOCAL_IP:$PORT"
fi
echo "Press Ctrl+C to stop all servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping web server and Claude API..."
    kill $SERVER_PID 2>/dev/null
    kill $API_PID 2>/dev/null
    exit 0
}

# Set trap to cleanup on Ctrl+C
trap cleanup SIGINT SIGTERM

# Keep script running
wait $SERVER_PID