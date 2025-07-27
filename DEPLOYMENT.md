# Stock Management App Deployment Guide

## Quick Deploy Options

### Option 1: Railway (Recommended - Easiest)

1. **Sign up for Railway** at https://railway.app
2. **Connect your GitHub repository** to Railway
3. **Set up environment variables** in Railway dashboard:
   ```
   NODE_ENV=production
   PORT=3001
   JWT_SECRET=your-secure-jwt-secret-here
   GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
   SPREADSHEET_ID_1=your_inventory_spreadsheet_id
   SPREADSHEET_ID_2=your_sales_spreadsheet_id
   SPREADSHEET_ID_3=your_purchases_spreadsheet_id
   ```

4. **Upload your Google credentials file**:
   - Go to your Railway project
   - Navigate to Variables tab
   - Add your `credentials.json` file as a variable

5. **Deploy**: Railway will automatically build and deploy your app

### Option 2: Render

1. **Sign up for Render** at https://render.com
2. **Create a new Web Service**
3. **Connect your GitHub repository**
4. **Configure the service**:
   - Build Command: `npm run install-all && npm run build`
   - Start Command: `npm start`
   - Environment: Node

5. **Set environment variables** in Render dashboard (same as Railway)

### Option 3: Heroku

1. **Install Heroku CLI** and login
2. **Create a new Heroku app**:
   ```bash
   heroku create your-app-name
   ```

3. **Set environment variables**:
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set JWT_SECRET=your-secure-jwt-secret
   heroku config:set SPREADSHEET_ID_1=your_spreadsheet_id
   # ... add other variables
   ```

4. **Deploy**:
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

## Environment Variables Required

Create a `.env` file locally or set these in your deployment platform:

```env
# Server Configuration
NODE_ENV=production
PORT=3001
JWT_SECRET=your-secure-jwt-secret-here

# Google Sheets API Configuration
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json

# Your Google Sheets IDs
SPREADSHEET_ID_1=your_inventory_spreadsheet_id_here
SPREADSHEET_ID_2=your_sales_spreadsheet_id_here
SPREADSHEET_ID_3=your_purchases_spreadsheet_id_here
```

## Google Sheets Setup

1. **Create a Google Cloud Project**
2. **Enable Google Sheets API**
3. **Create a Service Account** and download the credentials JSON file
4. **Share your Google Sheets** with the service account email
5. **Upload the credentials file** to your deployment platform

## Security Considerations

- Use a strong JWT_SECRET
- Enable HTTPS in production
- Set up proper CORS origins
- Consider adding rate limiting for production
- Secure your Google credentials

## Troubleshooting

### Common Issues:

1. **Build fails**: Make sure all dependencies are in package.json
2. **Google Sheets access denied**: Check service account permissions
3. **WebSocket connection fails**: Verify CORS settings
4. **Static files not served**: Check the build path in server/index.js

### Local Testing:

```bash
# Test production build locally
npm run build
NODE_ENV=production npm start
```

## Custom Domain (Optional)

After deployment, you can add a custom domain:
1. **Railway**: Go to Settings > Domains
2. **Render**: Go to Settings > Custom Domains
3. **Heroku**: Use `heroku domains:add yourdomain.com`

## Monitoring

- Set up logging for production
- Monitor Google Sheets API usage
- Track WebSocket connections
- Set up alerts for errors 