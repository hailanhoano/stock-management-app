#!/bin/bash

# Stock Management App - Daily Backup Script
# This script automatically backs up your data to GitHub

# Set colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting daily backup...${NC}"

# Navigate to project directory
cd "$(dirname "$0")"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Git repository not initialized. Initializing...${NC}"
    git init
    git remote add origin https://github.com/YOUR_USERNAME/stock-management-app.git
fi

# Add all files except those in .gitignore
git add .

# Check if there are changes to commit
if git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}No changes to backup today.${NC}"
    exit 0
fi

# Create commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Daily backup: $TIMESTAMP

- Automated backup of stock management data
- Backup time: $TIMESTAMP
- Data files: users.json, config.json
- Application code and configuration"

# Push to GitHub
echo -e "${GREEN}Pushing backup to GitHub...${NC}"
if git push origin main; then
    echo -e "${GREEN}✅ Backup completed successfully!${NC}"
    echo -e "${GREEN}📅 Backup time: $TIMESTAMP${NC}"
    echo -e "${GREEN}🌐 View your backup at: https://github.com/YOUR_USERNAME/stock-management-app${NC}"
else
    echo -e "${RED}❌ Failed to push backup to GitHub${NC}"
    echo -e "${YELLOW}Please check your GitHub credentials and repository settings${NC}"
    exit 1
fi 