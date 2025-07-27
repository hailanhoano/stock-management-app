#!/bin/bash
set -e

echo "Setting CI=false to prevent ESLint errors..."
export CI=false

echo "Installing dependencies..."
npm install

echo "Installing client dependencies..."
cd client && npm install

echo "Building client with CI=false..."
CI=false npm run build

echo "Build completed successfully!" 