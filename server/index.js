const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Active users tracking
const activeUsers = new Map(); // userId -> { lastSeen, userInfo }
const ACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Clean up inactive users every minute
setInterval(() => {
  const now = Date.now();
  for (const [userId, userData] of activeUsers.entries()) {
    if (now - userData.lastSeen > ACTIVE_TIMEOUT) {
      activeUsers.delete(userId);
    }
  }
}, 60000); // Check every minute

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Rate limiting - temporarily disabled for development
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// });
// app.use(limiter);

// Google Sheets configuration
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// User data file path
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// User management functions
async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

async function saveUsers(users) {
  try {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
    throw error;
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const users = await loadUsers();
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const users = await loadUsers();
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update active users
    activeUsers.set(req.user.id, {
      lastSeen: Date.now(),
      userInfo: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get active users count
app.get('/api/users/active-count', authenticateToken, async (req, res) => {
  try {
    // Update current user's last seen
    activeUsers.set(req.user.id, {
      lastSeen: Date.now(),
      userInfo: req.user
    });

    const activeCount = activeUsers.size;
    res.json({ 
      activeCount,
      hasMultipleUsers: activeCount >= 2
    });
  } catch (error) {
    console.error('Error getting active users count:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Start editing session
app.post('/api/stock/inventory/:id/start-edit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const config = await loadConfig();
    
    if (!config.spreadsheetIds.inventory) {
      return res.status(400).json({ message: 'Inventory spreadsheet ID not configured' });
    }

    // Create a new auth and sheets client
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch current data to get the row being edited
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetIds.inventory,
      range: 'A:L',
    });
    const currentData = response.data.values || [];
    
    if (!currentData || currentData.length < 2) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    const rowIndex = parseInt(id);
    if (rowIndex < 2 || rowIndex > currentData.length) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const currentRowData = currentData[rowIndex - 1];
    
    // Check if another user is already editing this row
    for (const [userId, session] of editingSessions.entries()) {
      if (session.rowId === id && userId !== req.user.id) {
        const user = activeUsers.get(userId);
        return res.status(409).json({ 
          message: 'Another user is currently editing this item',
          editingUser: user ? user.userInfo.email : 'Unknown user'
        });
      }
    }

    // Start editing session
    editingSessions.set(req.user.id, {
      rowId: id,
      startTime: Date.now(),
      originalData: currentRowData,
      userEmail: req.user.email
    });

    res.json({
      success: true,
      message: 'Editing session started',
      originalData: currentRowData
    });
  } catch (error) {
    console.error('Error starting edit session:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// End editing session
app.post('/api/stock/inventory/:id/end-edit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const session = editingSessions.get(req.user.id);
    
    if (session && session.rowId === id) {
      editingSessions.delete(req.user.id);
      res.json({ success: true, message: 'Editing session ended' });
    } else {
      res.status(404).json({ message: 'No active editing session found' });
    }
  } catch (error) {
    console.error('Error ending edit session:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get editing sessions (for admin/overview)
app.get('/api/stock/editing-sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = [];
    const now = Date.now();
    
    for (const [userId, session] of editingSessions.entries()) {
      const user = activeUsers.get(userId);
      if (user) {
        sessions.push({
          userId: userId,
          userEmail: session.userEmail,
          rowId: session.rowId,
          startTime: session.startTime,
          duration: now - session.startTime
        });
      }
    }
    
    res.json({ sessions });
  } catch (error) {
    console.error('Error getting editing sessions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get change log
app.get('/api/stock/change-log', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, since } = req.query;
    let filteredLog = [...changeLog];
    
    if (since) {
      const sinceTime = parseInt(since);
      filteredLog = filteredLog.filter(entry => entry.timestamp >= sinceTime);
    }
    
    // Sort by timestamp descending and limit
    filteredLog.sort((a, b) => b.timestamp - a.timestamp);
    filteredLog = filteredLog.slice(0, parseInt(limit));
    
    res.json({ 
      changes: filteredLog,
      total: changeLog.length
    });
  } catch (error) {
    console.error('Error getting change log:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User management routes (admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const users = await loadUsers();
    const usersWithoutPasswords = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }));

    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { email, name, password, role } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ message: 'Email, name, and password are required' });
    }

    const users = await loadUsers();
    
    // Check if email already exists
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      email,
      name,
      password: hashedPassword,
      role: role || 'user'
    };

    users.push(newUser);
    await saveUsers(users);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { id } = req.params;
    const { name, email, role } = req.body;
    const users = await loadUsers();
    
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is already taken by another user
    const emailExists = users.find(u => u.email === email && u.id !== id);
    if (emailExists) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Update user
    users[userIndex] = {
      ...users[userIndex],
      name,
      email,
      role
    };

    await saveUsers(users);

    const updatedUser = {
      id: users[userIndex].id,
      email: users[userIndex].email,
      name: users[userIndex].name,
      role: users[userIndex].role
    };

    res.json({
      message: 'User updated successfully',
      user: updatedUser,
      isSelfUpdate: id === req.user.id
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/users/:id/password', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { id } = req.params;
    const { password } = req.body;
    const users = await loadUsers();
    
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);
    users[userIndex].password = hashedPassword;

    await saveUsers(users);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { id } = req.params;
    const users = await loadUsers();
    
    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'User not found' });
    }

    users.splice(userIndex, 1);
    await saveUsers(users);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Stock management routes
app.get('/api/stock/overview', async (req, res) => {
  try {
    const { spreadsheetId1, spreadsheetId2, spreadsheetId3 } = req.query;
    
    if (!spreadsheetId1 || !spreadsheetId2 || !spreadsheetId3) {
      return res.status(400).json({ 
        error: 'All three spreadsheet IDs are required' 
      });
    }

    // Fetch data from all three spreadsheets
    const [sheet1Data, sheet2Data, sheet3Data] = await Promise.all([
      fetchSheetData(spreadsheetId1, 'A:Z'),
      fetchSheetData(spreadsheetId2, 'A:Z'),
      fetchSheetData(spreadsheetId3, 'A:Z')
    ]);

    // Process and combine data
    const combinedData = processStockData(sheet1Data, sheet2Data, sheet3Data);

    res.json({
      success: true,
      data: combinedData,
      summary: generateSummary(combinedData)
    });

  } catch (error) {
    console.error('Error fetching stock data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stock data',
      details: error.message 
    });
  }
});

app.get('/api/stock/inventory', async (req, res) => {
  try {
    const { spreadsheetId } = req.query;
    
    if (!spreadsheetId) {
      return res.status(400).json({ 
        error: 'Spreadsheet ID is required' 
      });
    }

    const data = await fetchSheetData(spreadsheetId, 'A:Z');
    const inventory = processInventoryData(data);

    res.json({
      success: true,
      data: inventory
    });

  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ 
      error: 'Failed to fetch inventory data',
      details: error.message 
    });
  }
});

app.get('/api/stock/analytics', async (req, res) => {
  try {
    const { spreadsheetId1, spreadsheetId2, spreadsheetId3 } = req.query;
    
    if (!spreadsheetId1 || !spreadsheetId2 || !spreadsheetId3) {
      return res.status(400).json({ 
        error: 'All three spreadsheet IDs are required' 
      });
    }

    const [sheet1Data, sheet2Data, sheet3Data] = await Promise.all([
      fetchSheetData(spreadsheetId1, 'A:Z'),
      fetchSheetData(spreadsheetId2, 'A:Z'),
      fetchSheetData(spreadsheetId3, 'A:Z')
    ]);

    const analytics = generateAnalytics(sheet1Data, sheet2Data, sheet3Data);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Error generating analytics:', error);
    res.status(500).json({ 
      error: 'Failed to generate analytics',
      details: error.message 
    });
  }
});

// Helper functions
async function fetchSheetData(spreadsheetId, range) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return response.data.values || [];
  } catch (error) {
    console.error(`Error fetching data from spreadsheet ${spreadsheetId}:`, error);
    throw error;
  }
}

function processStockData(sheet1Data, sheet2Data, sheet3Data) {
  // Process and combine data from all three sheets
  // This is a basic implementation - you can customize based on your sheet structure
  const processed = {
    inventory: processInventoryData(sheet1Data),
    sales: processSalesData(sheet2Data),
    purchases: processPurchaseData(sheet3Data)
  };

  return processed;
}

function processInventoryData(data) {
  if (!data || data.length < 2) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  // Map Vietnamese headers to English keys
  const headerMapping = {
    'Tên hãng': 'brand',
    'Mã hàng': 'product_code',
    'Tên hàng': 'product_name',
    'Số Lot': 'lot_number',
    'Date': 'date',
    'Số lượng': 'quantity',
    'Đơn vị': 'unit',
    'Ngày hết hạn': 'expiry_date',
    'Ngày nhập kho': 'import_date',
    'Vị trí đặt hàng': 'location',
    'Tên Kho': 'warehouse',
    'Ghi chú': 'notes'
  };
  
  return rows.map((row, index) => {
    const item = {};
    headers.forEach((header, colIndex) => {
      const englishKey = headerMapping[header] || header.toLowerCase().replace(/\s+/g, '_');
      item[englishKey] = row[colIndex] || '';
    });
    // Use actual row number in sheet (index + 2 because sheets are 1-indexed and we skip header)
    item.id = (index + 2).toString();
    return item;
  });
}

function processSalesData(data) {
  if (!data || data.length < 2) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const sale = {};
    headers.forEach((header, index) => {
      sale[header.toLowerCase().replace(/\s+/g, '_')] = row[index] || '';
    });
    return sale;
  });
}

function processPurchaseData(data) {
  if (!data || data.length < 2) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const purchase = {};
    headers.forEach((header, index) => {
      purchase[header.toLowerCase().replace(/\s+/g, '_')] = row[index] || '';
    });
    return purchase;
  });
}

function generateSummary(data) {
  const { inventory, sales, purchases } = data;
  
  return {
    totalItems: inventory.length,
    totalSales: sales.length,
    totalPurchases: purchases.length,
    lowStockItems: inventory.filter(item => 
      parseInt(item.quantity || 0) < parseInt(item.min_quantity || 10)
    ).length,
    outOfStockItems: inventory.filter(item => 
      parseInt(item.quantity || 0) === 0
    ).length
  };
}

function generateAnalytics(sheet1Data, sheet2Data, sheet3Data) {
  const inventory = processInventoryData(sheet1Data);
  const sales = processSalesData(sheet2Data);
  const purchases = processPurchaseData(sheet3Data);

  // Calculate analytics
  const totalInventoryValue = inventory.reduce((sum, item) => {
    const quantity = parseInt(item.quantity || 0);
    const price = parseFloat(item.price || 0);
    return sum + (quantity * price);
  }, 0);

  const totalSalesValue = sales.reduce((sum, sale) => {
    const amount = parseFloat(sale.amount || 0);
    return sum + amount;
  }, 0);

  const totalPurchaseValue = purchases.reduce((sum, purchase) => {
    const amount = parseFloat(purchase.amount || 0);
    return sum + amount;
  }, 0);

  return {
    inventoryValue: totalInventoryValue,
    salesValue: totalSalesValue,
    purchaseValue: totalPurchaseValue,
    profit: totalSalesValue - totalPurchaseValue,
    lowStockItems: inventory.filter(item => 
      parseInt(item.quantity || 0) < parseInt(item.min_quantity || 10)
    ),
    topSellingItems: getTopSellingItems(sales),
    recentActivity: getRecentActivity(sales, purchases)
  };
}

function getTopSellingItems(sales) {
  const itemCounts = {};
  sales.forEach(sale => {
    const item = sale.item_name || sale.product || 'Unknown';
    itemCounts[item] = (itemCounts[item] || 0) + 1;
  });
  
  return Object.entries(itemCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([item, count]) => ({ item, count }));
}

function getRecentActivity(sales, purchases) {
  const allActivity = [
    ...sales.map(sale => ({ ...sale, type: 'sale', date: sale.date || sale.sale_date })),
    ...purchases.map(purchase => ({ ...purchase, type: 'purchase', date: purchase.date || purchase.purchase_date }))
  ];
  
  return allActivity
    .filter(activity => activity.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20);
}

// Configuration file path
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// Configuration management functions
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading config:', error);
    return {
      spreadsheetIds: {
        inventory: '',
        sales: '',
        purchases: ''
      }
    };
  }
}

async function saveConfig(config) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(CONFIG_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
}

// Configuration routes
app.get('/api/config', authenticateToken, async (req, res) => {
  try {
    const config = await loadConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/config', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetIds } = req.body;

    if (!spreadsheetIds) {
      return res.status(400).json({ message: 'Spreadsheet IDs are required' });
    }

    const config = {
      spreadsheetIds: {
        inventory: spreadsheetIds.inventory || '',
        sales: spreadsheetIds.sales || '',
        purchases: spreadsheetIds.purchases || ''
      }
    };

    await saveConfig(config);

    res.json({
      success: true,
      message: 'Configuration saved successfully',
      data: config
    });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Change logging and conflict tracking
const changeLog = [];
const editingSessions = new Map(); // userId -> { rowId, startTime, data }

// Update inventory item endpoint
app.put('/api/stock/inventory/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Update request received:', req.params, req.body);
    const { id } = req.params;
    const updatedItem = req.body;
    const config = await loadConfig();
    
    console.log('Config loaded:', config.spreadsheetIds.inventory);
    
    if (!config.spreadsheetIds.inventory) {
      return res.status(400).json({ message: 'Inventory spreadsheet ID not configured' });
    }

    // Create a new auth and sheets client with write access
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch current data to get headers and check for conflicts
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetIds.inventory,
      range: 'A:L',
    });
    const currentData = response.data.values || [];
    console.log('Current data fetched, rows:', currentData ? currentData.length : 0);
    
    if (!currentData || currentData.length < 2) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    const headers = currentData[0];
    const rows = currentData.slice(1);
    
    // Map Vietnamese headers to English keys
    const headerMapping = {
      'Tên hãng': 'brand',
      'Mã hàng': 'product_code',
      'Tên hàng': 'product_name',
      'Số Lot': 'lot_number',
      'Date': 'date',
      'Số lượng': 'quantity',
      'Đơn vị': 'unit',
      'Ngày hết hạn': 'expiry_date',
      'Ngày nhập kho': 'import_date',
      'Vị trí đặt hàng': 'location',
      'Tên Kho': 'warehouse',
      'Ghi chú': 'notes'
    };
    
    // Find the row to update (id corresponds to the actual row number in the sheet)
    const rowIndex = parseInt(id);
    console.log('Row index to update:', rowIndex, 'Total rows:', rows.length);
    console.log('Row index validation - rowIndex:', rowIndex, 'rows.length:', rows.length);
    
    // Validate row index - should be between 2 and the total number of rows in the sheet
    if (rowIndex < 2 || rowIndex > currentData.length) {
      console.log('Row index out of bounds - rowIndex:', rowIndex, 'currentData.length:', currentData.length);
      return res.status(404).json({ message: 'Item not found' });
    }

    // Conflict detection: Check if data was modified since user started editing
    const currentRowData = currentData[rowIndex - 1]; // Convert to 0-based index
    const userSession = editingSessions.get(req.user.id);
    const forceUpdate = req.headers['x-force-update'] === 'true';
    
    if (userSession && userSession.rowId === id && !forceUpdate) {
      // Check if the data has changed since user started editing
      const originalData = userSession.originalData;
      const hasConflict = JSON.stringify(originalData) !== JSON.stringify(currentRowData);
      
      if (hasConflict) {
        // Create proper conflict log entry with only changed fields
        const originalDataMap = {};
        const attemptedDataMap = {};
        const currentDataMap = {};
        const changedFields = {};
        
        headers.forEach((header, index) => {
          const englishKey = headerMapping[header] || header.toLowerCase().replace(/\s+/g, '_');
          const originalValue = originalData[index] || '';
          const attemptedValue = updatedItem[englishKey] || '';
          const currentValue = currentRowData[index] || '';
          
          originalDataMap[englishKey] = originalValue;
          attemptedDataMap[englishKey] = attemptedValue;
          currentDataMap[englishKey] = currentValue;
          
          // Track fields that changed between original and current
          if (originalValue !== currentValue) {
            changedFields[englishKey] = {
              original: originalValue,
              current: currentValue,
              fieldName: header
            };
          }
        });
        
        // Log the conflict
        changeLog.push({
          timestamp: Date.now(),
          userId: req.user.id,
          action: 'CONFLICT_DETECTED',
          rowId: id,
          originalData: originalDataMap,
          attemptedData: attemptedDataMap,
          currentData: currentDataMap,
          changedFields: changedFields
        });
        
        return res.status(409).json({ 
          message: 'Data was modified by another user while you were editing',
          conflict: true,
          serverData: currentRowData,
          originalData: originalData,
          attemptedData: updatedItem
        });
      }
    }

    // Create updated row data with metadata
    const updatedRow = headers.map(header => {
      const englishKey = headerMapping[header] || header.toLowerCase().replace(/\s+/g, '_');
      return updatedItem[englishKey] || '';
    });

    // Add metadata columns if they don't exist
    const metadataColumns = [
      new Date().toISOString(), // lastModified
      req.user.email, // modifiedBy
      (parseInt(currentRowData[headers.length] || '0') + 1).toString() // version
    ];

    console.log('Updated row data:', updatedRow);
    console.log('Metadata:', metadataColumns);

    // Update the specific row in Google Sheets with metadata
    const range = `A${rowIndex}:O${rowIndex}`; // Extended range for metadata
    const fullRowData = [...updatedRow, ...metadataColumns];
    
    console.log('Updating range:', range);
    console.log('Full row data:', fullRowData);
    
    // Use update to ensure we're updating the exact row
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetIds.inventory,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [fullRowData]
      }
    });

    // Create a proper change log entry with only changed fields
    const oldValueMap = {};
    const newValueMap = {};
    const changedFields = {};
    
    // Get the original data from when user started editing
    const originalData = userSession ? userSession.originalData : currentRowData;
    
    headers.forEach((header, index) => {
      const englishKey = headerMapping[header] || header.toLowerCase().replace(/\s+/g, '_');
      const oldValue = originalData[index] || '';
      const newValue = updatedRow[index] || '';
      
      // Only include fields that actually changed
      if (oldValue !== newValue) {
        oldValueMap[englishKey] = oldValue;
        newValueMap[englishKey] = newValue;
        changedFields[englishKey] = {
          old: oldValue,
          new: newValue,
          fieldName: header // Keep Vietnamese field name for display
        };
      }
    });
    
    // Only log if there are actual changes
    if (Object.keys(changedFields).length > 0) {
      // Check for duplicate recent entries (within 5 seconds)
      const recentEntry = changeLog.find(entry => 
        entry.rowId === id && 
        entry.action === 'UPDATE' && 
        Date.now() - entry.timestamp < 5000
      );
      
      if (!recentEntry) {
        // Log the successful change
        changeLog.push({
          timestamp: Date.now(),
          userId: req.user.id,
          userEmail: req.user.email,
          action: 'UPDATE',
          rowId: id,
          oldValue: oldValueMap,
          newValue: newValueMap,
          changedFields: changedFields,
          metadata: metadataColumns
        });
      }
    }

    // Clear the editing session
    editingSessions.delete(req.user.id);

    console.log('Google Sheets update successful');
    res.json({
      success: true,
      message: 'Item updated successfully',
      data: updatedItem,
      metadata: {
        lastModified: metadataColumns[0],
        modifiedBy: metadataColumns[1],
        version: metadataColumns[2]
      }
    });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add new inventory item endpoint
app.post('/api/stock/inventory', authenticateToken, async (req, res) => {
  try {
    console.log('Add request received:', req.body);
    const newItem = req.body;
    const config = await loadConfig();
    
    if (!config.spreadsheetIds.inventory) {
      return res.status(400).json({ message: 'Inventory spreadsheet ID not configured' });
    }

    // Create a new auth and sheets client with write access
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch current data to get headers
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetIds.inventory,
      range: 'A:L',
    });
    const currentData = response.data.values || [];
    
    if (!currentData || currentData.length < 1) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    const headers = currentData[0];
    
    // Map Vietnamese headers to English keys
    const headerMapping = {
      'Tên hãng': 'brand',
      'Mã hàng': 'product_code',
      'Tên hàng': 'product_name',
      'Số Lot': 'lot_number',
      'Date': 'date',
      'Số lượng': 'quantity',
      'Đơn vị': 'unit',
      'Ngày hết hạn': 'expiry_date',
      'Ngày nhập kho': 'import_date',
      'Vị trí đặt hàng': 'location',
      'Tên Kho': 'warehouse',
      'Ghi chú': 'notes'
    };

    // Create new row data
    const newRow = headers.map(header => {
      const englishKey = headerMapping[header] || header.toLowerCase().replace(/\s+/g, '_');
      return newItem[englishKey] || '';
    });

    console.log('New row data:', newRow);

    // Get the next row number to append to
    const nextRowNumber = currentData.length + 1;
    const range = `A${nextRowNumber}:L${nextRowNumber}`;
    
    // Update the specific row position
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetIds.inventory,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [newRow]
      }
    });

    console.log('Google Sheets append successful');
    res.json({
      success: true,
      message: 'Item added successfully',
      data: newItem
    });
  } catch (error) {
    console.error('Error adding inventory item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete inventory item endpoint
app.delete('/api/stock/inventory/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Delete request received:', req.params);
    const { id } = req.params;
    const config = await loadConfig();
    
    if (!config.spreadsheetIds.inventory) {
      return res.status(400).json({ message: 'Inventory spreadsheet ID not configured' });
    }

    // Create a new auth and sheets client with write access
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch current data to validate row exists
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetIds.inventory,
      range: 'A:L',
    });
    const currentData = response.data.values || [];
    
    if (!currentData || currentData.length < 2) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    const rowIndex = parseInt(id);
    
    // Validate row index - should be between 2 and the total number of rows in the sheet
    if (rowIndex < 2 || rowIndex > currentData.length) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Get the sheet ID first
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetIds.inventory
    });
    
    const sheetId = spreadsheet.data.sheets[0].properties.sheetId;
    console.log('Sheet ID:', sheetId, 'Row index to delete:', rowIndex);
    
    // Delete the specific row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.spreadsheetIds.inventory,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // Convert to 0-based index
                endIndex: rowIndex // End index is exclusive
              }
            }
          }
        ]
      }
    });

    console.log('Google Sheets delete successful');
    res.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Stock Management Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
}); 