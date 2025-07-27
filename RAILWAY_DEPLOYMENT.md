# 🚀 Railway Deployment Guide

## 📋 Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Your code should be on GitHub
3. **Google Cloud Project**: With Google Sheets API enabled
4. **Service Account**: With proper credentials

## 🔧 Setup Steps

### 1. **Connect to Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login
```

### 2. **Create New Project**
```bash
# Initialize Railway project
railway init

# Link to existing project (if you have one)
railway link
```

### 3. **Configure Environment Variables**

In Railway dashboard, add these environment variables:

```env
# Google Sheets Configuration
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
SPREADSHEET_ID_INVENTORY=1iQsQDnRrgP5LLhuimLny8doi6AEEgH-OibFnHRlCgPU
SPREADSHEET_ID_INVENTORY2=1Th-1fz4vKFJ6cO6t4rbTFNUhd1R0OtxJ_VlWQEhONk4
SPREADSHEET_ID_CUSTOMERS=1mn908aWMfAZrvxY16UbXoymqER1lW4G3ptiUZXFBYtA

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here

# Port (Railway will set this automatically)
PORT=3001
```

### 4. **Deploy the Application**
```bash
# Deploy to Railway
railway up

# Or deploy from GitHub
# Railway will automatically deploy when you push to main branch
```

## 📁 Required Files

- ✅ `railway.json` - Railway configuration
- ✅ `Procfile` - Process definition
- ✅ `.railwayignore` - Files to exclude
- ✅ `build.sh` - Build script
- ✅ `package.json` - Dependencies

## 🔒 Security Checklist

- [ ] **Google Sheets API**: Enabled in Google Cloud Console
- [ ] **Service Account**: Created and configured
- [ ] **Spreadsheet Permissions**: Service account has access
- [ ] **Environment Variables**: All secrets configured
- [ ] **JWT Secret**: Strong secret key set
- [ ] **CORS**: Configured for production domain

## 🌐 Post-Deployment

### 1. **Get Your URL**
```bash
# View deployment URL
railway status
```

### 2. **Test the Application**
- Visit your Railway URL
- Login with: `admin@example.com` / `admin123`
- Test inventory and customer features
- Verify Google Sheets integration

### 3. **Monitor Logs**
```bash
# View application logs
railway logs

# Follow logs in real-time
railway logs --follow
```

## 🚨 Troubleshooting

### **Common Issues:**

1. **Build Failures**
   - Check `package.json` dependencies
   - Verify Node.js version compatibility
   - Check build logs in Railway dashboard

2. **Google Sheets API Errors**
   - Verify service account credentials
   - Check spreadsheet permissions
   - Ensure API is enabled

3. **Environment Variables**
   - Verify all required variables are set
   - Check variable names match code
   - Ensure no typos in values

4. **Port Issues**
   - Railway sets `PORT` automatically
   - Application listens on `process.env.PORT`

## 📊 Monitoring

### **Railway Dashboard:**
- **Deployments**: View deployment history
- **Logs**: Real-time application logs
- **Metrics**: Performance monitoring
- **Variables**: Environment configuration

### **Application Health:**
- **Health Check**: `https://your-app.railway.app/api/health`
- **Status**: Check if all services are running
- **Data**: Verify Google Sheets integration

## 🔄 Continuous Deployment

Railway automatically deploys when you push to your main branch:

```bash
# Push changes to trigger deployment
git push origin main
```

## 📞 Support

- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Discord**: Railway community
- **GitHub Issues**: For application-specific issues

---

*Ready for deployment! 🚀* 