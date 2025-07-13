# Stock Management App

A comprehensive stock management application with real-time inventory tracking, user management, and analytics.

## Features

- 📊 Real-time inventory management
- 👥 User management and authentication
- 📈 Analytics and reporting
- 🔄 Live data synchronization
- 🎨 Modern, responsive UI
- 🔒 Secure authentication system

## Backup System

This application includes an automated backup system that saves your data to GitHub daily.

### Backup Features

- ✅ **Daily automated backups** via GitHub Actions
- ✅ **Manual backup capability** with `./backup.sh`
- ✅ **Data versioning** - track changes over time
- ✅ **Secure storage** - private GitHub repository
- ✅ **Easy restoration** - download any previous version

### What Gets Backed Up

- 📁 Application code and configuration
- 📊 Data files (`server/data/users.json`, `server/data/config.json`)
- ⚙️ Package configurations
- 📝 Documentation

### What's Excluded (for security)

- 🔒 Environment variables (`.env` files)
- 🚫 Node modules (`node_modules/`)
- 🚫 Build outputs and logs
- 🚫 OS-generated files

### Setup Instructions

1. **Run the setup script:**
   ```bash
   chmod +x setup-backup.sh
   ./setup-backup.sh
   ```

2. **Create a GitHub repository:**
   - Go to https://github.com/new
   - Name it: `stock-management-app`
   - Make it private (recommended)
   - Don't initialize with README

3. **Update the backup script:**
   - Edit `backup.sh`
   - Replace `YOUR_USERNAME` with your GitHub username

4. **Connect to GitHub:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/stock-management-app.git
   git add .
   git commit -m "Initial commit"
   git push -u origin main
   ```

5. **Test the backup:**
   ```bash
   ./backup.sh
   ```

### Manual Backup

Run the backup script anytime:
```bash
./backup.sh
```

### GitHub Actions

The backup system uses GitHub Actions to run daily at 2:00 AM UTC. You can:
- View backup history in the Actions tab
- Trigger manual backups from the Actions tab
- Download backup artifacts

### Restore from Backup

To restore from a previous backup:
1. Go to your GitHub repository
2. Browse commit history
3. Download the files you need
4. Replace your local files

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd client && npm install
   ```
3. Set up environment variables (see `env.example`)
4. Start the server:
   ```bash
   npm start
   ```

## Development

- Frontend: React with TypeScript
- Backend: Node.js with Express
- Database: JSON files (with backup system)
- Styling: Tailwind CSS

## Security

- Environment variables are excluded from backups
- Private repository recommended
- No sensitive data in version control
- Regular automated backups

---

**Backup Status**: ✅ Automated daily backups enabled
**Last Backup**: Check GitHub Actions for latest status 