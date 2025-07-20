#!/bin/bash

# Auto-accept port changes for React client
cd client

# Check if port 3000 is in use
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "Port 3000 is in use. Starting on alternative port..."
    echo "Y" | npm start
else
    echo "Port 3000 is available. Starting normally..."
    npm start
fi 