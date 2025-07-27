# Railway Deployment Checklist

## ✅ Pre-Deployment
- [ ] Google Cloud Project created
- [ ] Google Sheets API enabled
- [ ] Service Account created
- [ ] credentials.json file ready
- [ ] Google Sheets shared with service account email
- [ ] GitHub repository ready

## 🚀 Deployment Steps
- [ ] Sign up at railway.app with GitHub
- [ ] Create new project
- [ ] Connect GitHub repository
- [ ] Deploy automatically
- [ ] Wait for build to complete

## ⚙️ Configuration
- [ ] Add NODE_ENV=production
- [ ] Add JWT_SECRET=your-secure-secret
- [ ] Add SPREADSHEET_ID_1=your_inventory_id
- [ ] Add SPREADSHEET_ID_2=your_sales_id
- [ ] Add SPREADSHEET_ID_3=your_purchases_id
- [ ] Upload credentials.json file

## 🧪 Testing
- [ ] App loads without errors
- [ ] Login page appears
- [ ] Can register new user
- [ ] Can log in successfully
- [ ] Inventory page loads
- [ ] Real-time updates work
- [ ] Google Sheets integration works

## 👥 Team Setup
- [ ] Create admin user account
- [ ] Create user accounts for team members
- [ ] Share app URL with team
- [ ] Train team on features

## 🔗 Your App URL
Your app will be available at:
`https://your-app-name.railway.app`

## 💰 Cost Tracking
- [ ] Monitor usage in Railway dashboard
- [ ] Stay under 500 hours/month for free tier
- [ ] Upgrade to $5/month if needed

## 🆘 Troubleshooting
If something doesn't work:
1. Check Railway logs in dashboard
2. Verify environment variables
3. Check Google Sheets permissions
4. Test locally first 