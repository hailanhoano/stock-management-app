# Stock Management Web App

A modern web application for managing stock/inventory using Google Sheets as the backend database. This app integrates with 3 different Google Sheets spreadsheets for comprehensive stock management.

## Features

- 🔐 **User Authentication**: Secure login system with JWT tokens
- 👥 **User Management**: Admin can add, edit, and manage users
- 📊 **Dashboard Overview**: Real-time statistics and summary of your inventory
- 📦 **Inventory Management**: View and track all inventory items
- 📈 **Analytics**: Detailed financial analysis and insights
- ⚙️ **Settings**: Configure Google Sheets integration and manage users
- 🔄 **Real-time Sync**: Automatic data synchronization with Google Sheets
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

### Backend
- **Node.js** with Express.js
- **Google Sheets API** for data integration
- **TypeScript** for type safety
- **CORS** and security middleware

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Heroicons** for icons
- **Modern Fetch API** for HTTP requests

## Prerequisites

Before running this application, you need:

1. **Node.js** (version 16 or higher)
2. **Google Cloud Project** with Google Sheets API enabled
3. **Google Service Account** credentials
4. **3 Google Sheets spreadsheets** (Inventory, Sales, Purchases)

## Setup Instructions

### 1. Install Dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API
4. Create a Service Account:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Download the JSON credentials file
   - Rename it to `credentials.json` and place it in the `server/` directory

### 3. Google Sheets Setup

Create 3 Google Sheets with the following structure:

#### Inventory Spreadsheet
| Name | Quantity | Price | Category | Min_Quantity | Supplier | Last_Updated |
|------|----------|-------|----------|--------------|----------|--------------|
| Laptop | 10 | 999.99 | Electronics | 5 | TechCorp | 2024-01-15 |

#### Sales Spreadsheet
| Item_Name | Quantity | Amount | Date | Customer |
|-----------|----------|--------|------|----------|
| Laptop | 2 | 1999.98 | 2024-01-15 | John Doe |

#### Purchases Spreadsheet
| Item_Name | Quantity | Amount | Date | Supplier |
|-----------|----------|--------|------|----------|
| Laptop | 5 | 4500.00 | 2024-01-10 | TechCorp |

### 4. Configure Spreadsheet Access

1. Share each Google Sheet with your Service Account email (found in credentials.json)
2. Give the Service Account "Viewer" access to all spreadsheets

### 5. Environment Configuration

1. Copy `env.example` to `.env`:
```bash
cp env.example .env
```

2. Update the `.env` file with your spreadsheet IDs:
```env
PORT=5000
NODE_ENV=development
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
SPREADSHEET_ID_1=your_inventory_spreadsheet_id
SPREADSHEET_ID_2=your_sales_spreadsheet_id
SPREADSHEET_ID_3=your_purchases_spreadsheet_id
```

### 6. Get Spreadsheet IDs

The spreadsheet ID is in the URL of your Google Sheet:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

## Running the Application

### Development Mode

```bash
# Start both server and client in development mode
npm run dev

# Or run them separately:
npm run server    # Backend on port 5000
npm run client    # Frontend on port 3000
```

### Production Mode

```bash
# Build the client
npm run build

# Start the server
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

### User Management (Admin Only)
- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `PUT /api/users/:id/password` - Reset user password

### Stock Management
- `GET /api/stock/overview` - Get combined data from all spreadsheets
- `GET /api/stock/inventory` - Get inventory data
- `GET /api/stock/analytics` - Get analytics and financial data
- `POST /api/stock/inventory/relocate` - Relocate items between warehouses (TH ↔ VKT)

### Inventory Relocation

The system supports relocating inventory items between two warehouse locations:
- **TH** (Thành Hồ) - Primary warehouse
- **VKT** (Vụ Kiều Trung) - Secondary warehouse

#### How Relocation Works

1. **Multi-location Support**: Each location has its own Google Sheet
   - TH items are stored in the primary inventory spreadsheet
   - VKT items are stored in the secondary inventory spreadsheet

2. **Cross-sheet Data Movement**: When relocating items:
   - Items are removed from the source location's Google Sheet
   - Items are added to the destination location's Google Sheet
   - Warehouse field is updated automatically
   - Relocation notes are added to track the movement

3. **Real-time Updates**: All connected clients receive immediate updates via WebSocket

#### Using the Relocation Feature

**Frontend (Web Interface):**
1. Go to the Inventory page
2. Enable "Bulk Actions" mode
3. Select items you want to relocate (all must be from the same location)
4. Click "Relocate" button
5. Choose destination location and add optional notes
6. Confirm the relocation

**API Endpoint:**
```javascript
POST /api/stock/inventory/relocate
Content-Type: application/json
Authorization: Bearer <token>

{
  "itemIds": ["th_2", "th_5"],           // Array of item IDs
  "sourceLocation": "TH",                // Source warehouse: "TH" or "VKT"
  "destinationLocation": "VKT",          // Destination warehouse: "TH" or "VKT"
  "notes": "Reorganization transfer"     // Optional notes
}
```

**Response:**
```javascript
{
  "success": true,
  "message": "Successfully relocated 2 item(s) from TH to VKT",
  "relocatedItems": 2,
  "sourceLocation": "TH",
  "destinationLocation": "VKT"
}
```

#### Features

- ✅ **Bulk Relocation**: Move multiple items at once
- ✅ **Data Integrity**: Automatic validation and error handling
- ✅ **Audit Trail**: All relocations are logged with timestamps and user info
- ✅ **Real-time Updates**: WebSocket notifications to all connected clients
- ✅ **Google Sheets Sync**: Automatic cross-sheet data movement
- ✅ **Validation**: Prevents invalid operations (same source/destination, missing items, etc.)
- ✅ **Notes Support**: Add context about why items were relocated

#### Error Handling

The system validates:
- All selected items exist and are from the same source location
- Source and destination locations are different
- Both source and destination spreadsheets are configured
- User has proper authentication and permissions

#### Testing

Use the provided test script to verify relocation functionality:

```bash
node test-relocation.js
```

Make sure to update the `TEST_TOKEN` in the script with a valid authentication token.

### Health Check
- `GET /api/health` - Server health status

## Project Structure

```
stock-management-app/
├── server/
│   ├── index.js              # Express server with authentication & Google Sheets API
│   └── data/
│       └── users.json        # User data storage
├── client/
│   ├── src/
│   │   ├── components/       # React components (Sidebar, UserManagement, etc.)
│   │   ├── pages/           # Page components (Dashboard, Inventory, etc.)
│   │   ├── context/         # React context for state management
│   │   └── ...
│   └── ...
├── credentials.json          # Google Service Account credentials
├── .env                     # Environment variables
└── README.md
```

## Features in Detail

### Dashboard
- Overview statistics (total items, low stock, sales, purchases)
- Low stock alerts
- Recent sales activity
- Financial summary

### Inventory
- Complete inventory list
- Stock levels and pricing
- Low stock indicators
- Category and supplier information

### Analytics
- Financial summary (inventory value, sales, purchases, profit)
- Top selling items
- Low stock analysis
- Recent activity timeline

### Settings
- Google Sheets configuration
- Spreadsheet ID management
- User management (add, edit, delete users)
- Password reset functionality
- Setup instructions

## Troubleshooting

### Common Issues

1. **"Failed to fetch stock data"**
   - Check if credentials.json is in the server directory
   - Verify spreadsheet IDs are correct
   - Ensure Service Account has access to spreadsheets

2. **"Please configure spreadsheet IDs"**
   - Go to Settings page and enter your spreadsheet IDs
   - Make sure all three IDs are provided

3. **CORS errors**
   - Ensure the server is running on port 5000
   - Check that the client is configured to proxy to the server

### Google Sheets API Quotas

- Free tier: 100 requests per 100 seconds per user
- Consider implementing caching for production use

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Google Sheets API documentation
3. Open an issue on GitHub

---

**Note**: This application requires proper Google Cloud setup and Google Sheets API access. Make sure to follow the setup instructions carefully. 