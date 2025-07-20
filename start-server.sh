#!/bin/bash

# Start server with port management
echo "Starting stock management server..."

# Kill any existing processes on port 3001
if lsof -ti:3001 > /dev/null 2>&1; then
    echo "Killing existing processes on port 3001..."
    kill -9 $(lsof -ti:3001)
    sleep 2
fi

# Start the server
npm start 