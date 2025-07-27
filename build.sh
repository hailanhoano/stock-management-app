#!/bin/bash
echo "Installing dependencies..."
npm install

echo "Installing client dependencies..."
cd client && npm install

echo "Building client..."
CI=false npm run build

echo "Build completed successfully!" 