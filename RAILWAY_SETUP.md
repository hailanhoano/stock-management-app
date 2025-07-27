# Quick Railway Deployment for Small Business (5-10 Users)

## 🚀 Step-by-Step Deployment

### 1. Prepare Your Google Sheets
- [ ] Create Google Cloud Project
- [ ] Enable Google Sheets API
- [ ] Create Service Account
- [ ] Download credentials.json
- [ ] Share your Google Sheets with service account email

### 2. Deploy to Railway
1. **Go to [railway.app](https://railway.app)**
2. **Sign up with GitHub**
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose your stock-management-app repository**
6. **Railway will automatically detect it's a Node.js app**

### 3. Configure Environment Variables
In Railway dashboard, go to Variables tab and add:

```env
NODE_ENV=production
JWT_SECRET=your-very-secure-secret-key-here
SPREADSHEET_ID_1=your_inventory_spreadsheet_id
SPREADSHEET_ID_2=your_sales_spreadsheet_id
SPREADSHEET_ID_3=your_purchases_spreadsheet_id
```

### 4. Upload Google Credentials
1. In Railway Variables tab
2. Click "New Variable"
3. Name: `GOOGLE_APPLICATION_CREDENTIALS`
4. Value: Upload your `credentials.json` file

### 5. Deploy!
- Railway will automatically build and deploy
- Your app will be live at: `https://your-app-name.railway.app`

## 🔧 Post-Deployment Setup

### 1. Test Your App
- [ ] Login functionality works
- [ ] Inventory management works
- [ ] Real-time updates work
- [ ] Google Sheets integration works

### 2. Set Up Custom Domain (Optional)
1. Go to Railway Settings
2. Click "Domains"
3. Add your custom domain
4. Update DNS records

### 3. Invite Your Team
- Share the app URL with your 5-10 users
- Create user accounts for each team member
- Train them on the features

## 💰 Cost Breakdown

**Free Tier (Perfect for 5-10 users):**
- ✅ 500 hours/month
- ✅ 1GB RAM
- ✅ Shared CPU
- ✅ Automatic HTTPS
- ✅ Custom domains

**If you exceed free tier:**
- $5/month for 1GB RAM
- $10/month for 2GB RAM
- Still very affordable for small business

## 🔒 Security for Small Business

**Railway provides:**
- ✅ Automatic HTTPS
- ✅ Environment variable encryption
- ✅ Secure deployments
- ✅ No credit card required to start

## 📈 Scaling Path

**When you grow beyond 10 users:**
1. **10-20 users**: Upgrade to $5/month plan
2. **20+ users**: Consider migrating to Heroku
3. **Enterprise needs**: Heroku or AWS

## 🎯 Perfect for Your Use Case

**Why Railway is ideal for 5-10 users:**
- ✅ **Simple setup** - no DevOps knowledge needed
- ✅ **Cost-effective** - start free, scale as needed
- ✅ **Reliable** - handles your user load easily
- ✅ **Professional** - looks great for clients/customers
- ✅ **Fast** - real-time updates work perfectly
- ✅ **Secure** - proper authentication and HTTPS

## 🚨 Troubleshooting

**Common issues:**
1. **Build fails**: Check that all dependencies are in package.json
2. **Google Sheets access denied**: Verify service account permissions
3. **WebSocket not working**: Check CORS settings (already configured)
4. **Login issues**: Verify JWT_SECRET is set

**Support:**
- Railway has excellent documentation
- Community Discord available
- Email support for paid plans 