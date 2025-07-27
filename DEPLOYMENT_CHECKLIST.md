# 🚀 Railway Deployment Checklist

## ✅ **Pre-Deployment Checklist**

### **1. Railway Account Setup**
- [ ] Sign up at [railway.app](https://railway.app)
- [ ] Install Railway CLI: `npm install -g @railway/cli`
- [ ] Login: `railway login`

### **2. Google Cloud Configuration**
- [ ] Google Sheets API enabled
- [ ] Service account created
- [ ] Service account has access to spreadsheets:
  - `1iQsQDnRrgP5LLhuimLny8doi6AEEgH-OibFnHRlCgPU` (TH inventory)
  - `1Th-1fz4vKFJ6cO6t4rbTFNUhd1R0OtxJ_VlWQEhONk4` (VKT inventory)
  - `1mn908aWMfAZrvxY16UbXoymqER1lW4G3ptiUZXFBYtA` (customers)

### **3. Environment Variables**
Set these in Railway dashboard:

```env
# Google Sheets Credentials (JSON string)
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account","project_id":"stock-management-app-465709",...}

# Spreadsheet IDs
SPREADSHEET_ID_INVENTORY=1iQsQDnRrgP5LLhuimLny8doi6AEEgH-OibFnHRlCgPU
SPREADSHEET_ID_INVENTORY2=1Th-1fz4vKFJ6cO6t4rbTFNUhd1R0OtxJ_VlWQEhONk4
SPREADSHEET_ID_CUSTOMERS=1mn908aWMfAZrvxY16UbXoymqER1lW4G3ptiUZXFBYtA

# JWT Secret (generate a strong secret)
JWT_SECRET=your-super-secret-jwt-key-here

# Port (Railway sets this automatically)
PORT=3001
```

## 🚀 **Deployment Steps**

### **Step 1: Create Railway Project**
```bash
# Initialize new Railway project
railway init

# Or link to existing project
railway link
```

### **Step 2: Configure Environment**
- Go to Railway dashboard
- Add all environment variables listed above
- Copy your Google service account JSON to `GOOGLE_SHEETS_CREDENTIALS`

### **Step 3: Deploy**
```bash
# Deploy to Railway
railway up

# Or push to GitHub for automatic deployment
git push origin main
```

### **Step 4: Get Your URL**
```bash
# View deployment URL
railway status
```

## ✅ **Post-Deployment Verification**

### **1. Application Health**
- [ ] Visit your Railway URL
- [ ] Check health endpoint: `https://your-app.railway.app/api/health`
- [ ] Verify server is running

### **2. Authentication Test**
- [ ] Login with: `admin@example.com` / `admin123`
- [ ] Verify authentication works

### **3. Data Integration Test**
- [ ] Check inventory page loads data
- [ ] Verify customer information loads
- [ ] Test real-time updates

### **4. Google Sheets Integration**
- [ ] Verify 740 inventory items load
- [ ] Verify 446 customer records load
- [ ] Test data synchronization

### **5. Feature Testing**
- [ ] Test inventory editing
- [ ] Test customer management
- [ ] Test real-time WebSocket updates
- [ ] Test data relocation between warehouses

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **Build Failures**
   ```bash
   # Check build logs
   railway logs
   
   # Verify dependencies
   npm install
   ```

2. **Environment Variables**
   - Verify all variables are set in Railway dashboard
   - Check variable names match exactly
   - Ensure no extra spaces or quotes

3. **Google Sheets API Errors**
   - Verify service account credentials
   - Check spreadsheet permissions
   - Ensure API is enabled in Google Cloud

4. **Port Issues**
   - Railway sets `PORT` automatically
   - Application uses `process.env.PORT`

## 📊 **Monitoring**

### **Railway Dashboard:**
- [ ] Monitor deployment status
- [ ] Check application logs
- [ ] View performance metrics
- [ ] Monitor environment variables

### **Application Monitoring:**
- [ ] Health check endpoint responding
- [ ] Google Sheets data loading
- [ ] Real-time updates working
- [ ] User authentication functioning

## 🔄 **Continuous Deployment**

Once deployed, Railway will automatically redeploy when you push to main:
```bash
git push origin main
```

## 📞 **Support Resources**

- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Railway Discord**: Community support
- **Application Logs**: `railway logs --follow`

---

## 🎯 **Success Criteria**

- ✅ **Application deployed and accessible**
- ✅ **All environment variables configured**
- ✅ **Google Sheets integration working**
- ✅ **Authentication system functional**
- ✅ **Real-time updates operational**
- ✅ **Data loading correctly (740 inventory, 446 customers)**

---

*Ready to deploy! 🚀* 