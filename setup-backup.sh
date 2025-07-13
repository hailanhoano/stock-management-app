#!/bin/bash

# Stock Management App - Backup Setup Script
# This script helps you set up automated daily backups

# Set colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up automated backup system for Stock Management App${NC}"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git is not installed. Please install Git first.${NC}"
    exit 1
fi

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}📁 Initializing Git repository...${NC}"
    git init
    echo -e "${GREEN}✅ Git repository initialized${NC}"
else
    echo -e "${GREEN}✅ Git repository already exists${NC}"
fi

# Make backup script executable
chmod +x backup.sh

echo ""
echo -e "${BLUE}📋 Next steps to complete backup setup:${NC}"
echo ""
echo -e "${YELLOW}1. Create a GitHub repository:${NC}"
echo "   - Go to https://github.com/new"
echo "   - Name it: stock-management-app"
echo "   - Make it private (recommended for data security)"
echo "   - Don't initialize with README (we already have one)"
echo ""
echo -e "${YELLOW}2. Update the backup script:${NC}"
echo "   - Edit backup.sh"
echo "   - Replace 'YOUR_USERNAME' with your actual GitHub username"
echo ""
echo -e "${YELLOW}3. Connect to GitHub:${NC}"
echo "   - Run: git remote add origin https://github.com/hailanhoano/stock-management-app.git"
echo "   - Or if you already have a remote: git remote set-url origin https://github.com/hailanhoano/stock-management-app.git"
echo ""
echo -e "${YELLOW}4. Push your code to GitHub:${NC}"
echo "   - Run: git add ."
echo "   - Run: git commit -m 'Initial commit'"
echo "   - Run: git push -u origin main"
echo ""
echo -e "${YELLOW}5. Set up GitHub Actions:${NC}"
echo "   - The .github/workflows/daily-backup.yml file is ready"
echo "   - GitHub Actions will automatically run daily at 2:00 AM UTC"
echo "   - You can also trigger backups manually from the Actions tab"
echo ""
echo -e "${YELLOW}6. Test the backup:${NC}"
echo "   - Run: ./backup.sh"
echo "   - Or trigger a manual backup from GitHub Actions"
echo ""
echo -e "${GREEN}🎉 Your backup system is ready!${NC}"
echo ""
echo -e "${BLUE}📊 Backup includes:${NC}"
echo "   ✅ Application code"
echo "   ✅ Data files (users.json, config.json)"
echo "   ✅ Configuration files"
echo "   ✅ Daily automated backups via GitHub Actions"
echo "   ✅ Manual backup capability"
echo ""
echo -e "${BLUE}🔒 Security features:${NC}"
echo "   ✅ .gitignore excludes sensitive files"
echo "   ✅ Private repository recommended"
echo "   ✅ No environment variables backed up" 