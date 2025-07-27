#!/bin/bash

echo "🚀 Building Stock Management App..."

# Install server dependencies
echo "📦 Installing server dependencies..."
npm install

# Install and build client
echo "🔨 Building React client..."
cd client
npm install
npm run build
cd ..

echo "✅ Build completed successfully!" 