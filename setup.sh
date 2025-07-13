#!/bin/bash

echo "🚀 Setting up Stock Management Web App..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js is installed (version: $(node --version))"

# Install server dependencies
echo ""
echo "📦 Installing server dependencies..."
npm install

# Install client dependencies
echo ""
echo "📦 Installing client dependencies..."
cd client
npm install
cd ..

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp env.example .env
    echo "✅ .env file created. Please update it with your Google Sheets IDs."
fi

# Check if credentials.json exists
if [ ! -f credentials.json ]; then
    echo ""
    echo "⚠️  Warning: credentials.json not found in server directory."
    echo "   Please download your Google Service Account credentials and place them as 'credentials.json' in the server directory."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Set up Google Cloud Project and enable Google Sheets API"
echo "2. Create a Service Account and download credentials.json"
echo "3. Create 3 Google Sheets (Inventory, Sales, Purchases)"
echo "4. Share the sheets with your Service Account email"
echo "5. Update .env file with your spreadsheet IDs"
echo "6. Run 'npm run dev' to start the application"
echo ""
echo "📖 See README.md for detailed instructions" 