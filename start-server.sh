#!/bin/bash
echo "Starting Schedule app server..."
echo "Open your browser to:"
echo "  Local: http://localhost:8000"
echo "  Network: http://10.0.0.43:8000"
echo "Press Ctrl+C to stop the server"
python3 -m http.server 8000 --bind 0.0.0.0