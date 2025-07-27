# Environment Variables for Railway Deployment

## Required Variables

Add these in Railway dashboard → Variables tab:

### 1. Server Configuration
```
NODE_ENV=production
```

### 2. Security
```
JWT_SECRET=your-super-secure-secret-key-here
```
**Generate a secure secret:**
- Use a random string of 32+ characters
- Example: `my-stock-app-secret-key-2024-very-secure`

### 3. Google Sheets IDs
```
SPREADSHEET_ID_1=your_inventory_spreadsheet_id
SPREADSHEET_ID_2=your_sales_spreadsheet_id
SPREADSHEET_ID_3=your_purchases_spreadsheet_id
```

**How to find spreadsheet IDs:**
- Open your Google Sheet
- Look at the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
- Copy the ID part (long string of letters/numbers)

### 4. Google Credentials
**Variable name:** `GOOGLE_APPLICATION_CREDENTIALS`
**Value:** Upload your `credentials.json` file

## Example Configuration

Your Railway variables should look like this:

```
NODE_ENV=production
JWT_SECRET=my-stock-app-secret-key-2024-very-secure-32-chars
SPREADSHEET_ID_1=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
SPREADSHEET_ID_2=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
SPREADSHEET_ID_3=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
GOOGLE_APPLICATION_CREDENTIALS=[upload credentials.json file]
```

## Security Notes

- ✅ Never share your JWT_SECRET
- ✅ Keep your credentials.json secure
- ✅ Use different secrets for development/production
- ✅ Railway encrypts all environment variables 