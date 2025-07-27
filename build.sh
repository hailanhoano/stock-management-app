#!/bin/bash

echo "🚀 Building Stock Management App for Railway deployment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the React client
echo "🔨 Building React client..."
cd client
npm install
npm run build
cd ..

# Create production environment
echo "⚙️ Setting up production environment..."
cp env.example .env

echo "✅ Build completed successfully!"
echo "🌐 Ready for Railway deployment!" 