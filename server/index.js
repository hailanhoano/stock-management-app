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
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Active users tracking
const activeUsers = new Map(); // userId -> { lastSeen, userInfo }
const ACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// WebSocket connection tracking
const connectedClients = new Map(); // socketId -> { userId, userInfo }

// Clean up inactive users every minute
setInterval(() => {
  const now = Date.now();
  for (const [userId, userData] of activeUsers.entries()) {
    if (now - userData.lastSeen > ACTIVE_TIMEOUT) {
      activeUsers.delete(userId);
    }
  }
}, 60000); // Check every minute

// Custom morgan format with Melbourne timezone
const morganFormat = ':remote-addr - - [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => {
      // Convert UTC to Melbourne time
      const melbourneTime = new Date().toLocaleString('en-AU', {
        timeZone: 'Australia/Melbourne',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Replace the date part with Melbourne time
      const melbourneFormatted = melbourneTime.replace(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/, '[$1/$2/$3:$4:$5:$6 +1100]');
      const updatedMessage = message.replace(/\[.*?\]/, melbourneFormatted);
      
      process.stdout.write(updatedMessage);
    }
  }
}));
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

app.get('/api/stock/inventory', authenticateToken, async (req, res) => {
  try {
    const config = await loadConfig();
    
    if (!config.spreadsheetIds.inventory && !config.spreadsheetIds.inventory2) {
      return res.status(400).json({ 
        error: 'No inventory spreadsheet IDs configured' 
      });
    }

    // Fetch data from both inventory sources
    const inventoryPromises = [];
    
    console.log('🔍 Config loaded:', {
      inventory: config.spreadsheetIds.inventory,
      inventory2: config.spreadsheetIds.inventory2
    });
    
    if (config.spreadsheetIds.inventory) {
      console.log('📊 Fetching from source 1:', config.spreadsheetIds.inventory);
      inventoryPromises.push(
        fetchSheetData(config.spreadsheetIds.inventory, 'A:Z')
          .then(data => {
            console.log('✅ Source 1 data fetched, rows:', data.length);
            return processInventoryData(data, 'source1');
          })
          .catch(error => {
            console.error('❌ Error fetching from inventory source 1:', error);
            return [];
          })
      );
    }
    
    if (config.spreadsheetIds.inventory2) {
      console.log('📊 Fetching from source 2:', config.spreadsheetIds.inventory2);
      inventoryPromises.push(
        fetchSheetData(config.spreadsheetIds.inventory2, 'A:Z', 'VKT')
          .then(data => {
            console.log('✅ Source 2 data fetched, rows:', data.length);
            return processInventoryData(data, 'source2');
          })
          .catch(error => {
            console.error('❌ Error fetching from inventory source 2:', error);
            return [];
          })
      );
    }

    // Wait for all inventory data to be fetched
    const inventoryArrays = await Promise.all(inventoryPromises);
    
    // Combine all inventory data
    const combinedInventory = inventoryArrays.flat();
    
    console.log('📊 Combined inventory results:');
    console.log('  - Source 1 items:', inventoryArrays[0]?.length || 0);
    console.log('  - Source 2 items:', inventoryArrays[1]?.length || 0);
    console.log('  - Total combined items:', combinedInventory.length);

    res.json({
      success: true,
      inventory: combinedInventory
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
async function fetchSheetData(spreadsheetId, range, tabName = null) {
  try {
    // If tabName is provided, use it in the range
    const fullRange = tabName ? `${tabName}!${range}` : range;
    
    const response = await Promise.race([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullRange,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Google Sheets API timeout')), 30000)
      )
    ]);
    return response.data.values || [];
  } catch (error) {
    console.error(`Error fetching data from spreadsheet ${spreadsheetId}:`, error);
    // Return empty array instead of throwing to prevent crashes
    return [];
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

function processInventoryData(data, source = 'source1') {
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
  
  // Special mapping for source 2
  const source2Mapping = {
    '': 'brand', // First column is brand
    'Mã HH': 'product_code',
    'Tên HH': 'product_name',
    'Đvt': 'unit',
    'Qui cách đóng gói': 'notes',
    'Số Lot/Batch': 'lot_number',
    'Tồn cuối': 'quantity',
    'Ngày hết hạn': 'expiry_date',
    'Ngày nhập kho': 'import_date',
    'Tình trạng': 'notes',
    'tên': 'product_name',
    'mã': 'product_code'
  };
  
  return rows.map((row, index) => {
    const item = {};
    
    // Use the same mapping for both sources since headers are identical
    headers.forEach((header, colIndex) => {
      const englishKey = headerMapping[header] || header.toLowerCase().replace(/\s+/g, '_');
      item[englishKey] = row[colIndex] || '';
    });
    
    // Set warehouse based on source
    if (source === 'source2') {
      item.warehouse = 'VKT'; // Set warehouse to VKT for source 2
    }
    
        // Use actual row number in sheet (index + 2 because sheets are 1-indexed and we skip header)
    item.id = (index + 2).toString();
    // Add source tracking
    item.source = source;
    item.sourceId = `${source}_${item.id}`;
    
    // Make ID unique across sources by prefixing with source
    if (source === 'source2') {
      item.id = `vkt_${item.id}`;
    } else {
      item.id = `th_${item.id}`;
    }
    
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
        inventory2: '', // Second inventory source
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
        inventory2: spreadsheetIds.inventory2 || '', // Second inventory source
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
const CHANGE_LOG_FILE = path.join(__dirname, 'data', 'change-log.json');

// Load change log from file
async function loadChangeLog() {
  try {
    const data = await fs.readFile(CHANGE_LOG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log('No existing change log found, starting fresh');
    return [];
  }
}

// Save change log to file
async function saveChangeLog(changeLog) {
  try {
    await fs.writeFile(CHANGE_LOG_FILE, JSON.stringify(changeLog, null, 2));
  } catch (error) {
    console.error('Error saving change log:', error);
  }
}

// Initialize change log
let changeLog = [];
loadChangeLog().then(log => {
  changeLog = log;
  console.log(`Loaded ${changeLog.length} change log entries`);
});

const editingSessions = new Map(); // userId -> { rowId, startTime, data }

// Update inventory item endpoint
app.put('/api/stock/inventory/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Update request received:', req.params, req.body);
    const { id } = req.params;
    const updatedItem = req.body;
    const config = await loadConfig();
    
    // Determine which source this item belongs to
    const sourceId = updatedItem.sourceId || id;
    const source = updatedItem.source || 'source1';
    const spreadsheetId = source === 'source1' ? config.spreadsheetIds.inventory : config.spreadsheetIds.inventory2;
    
    console.log('Config loaded:', spreadsheetId);
    console.log('Source:', source, 'Source ID:', sourceId);
    
    if (!spreadsheetId) {
      return res.status(400).json({ message: `${source} inventory spreadsheet ID not configured` });
    }

    // Create a new auth and sheets client with write access
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch current data to get headers and check for conflicts
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'A:L',
    });
    let currentData = response.data.values || [];
    console.log('Current data fetched, rows:', currentData ? currentData.length : 0);
    
    if (!currentData || currentData.length < 2) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    const headers = currentData[0];
    let rows = currentData.slice(1);
    
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
    // Handle new ID format: vkt_125, th_2, etc.
    let rowIndex;
    if (id.includes('_')) {
      // New format: extract the number after the underscore
      const parts = id.split('_');
      rowIndex = parseInt(parts[parts.length - 1]);
    } else {
      // Old format: direct number
      rowIndex = parseInt(id);
    }
    console.log('Row index to update:', rowIndex, 'Total rows:', rows.length);
    console.log('Row index validation - rowIndex:', rowIndex, 'rows.length:', rows.length);
    
    // For newly added rows, the row index might be beyond current data length
    // In this case, we need to fetch the latest data to get the correct row
    if (rowIndex > currentData.length) {
      console.log('Row index beyond current data, fetching latest data...');
      const latestResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'A:Z',
      });
      const latestData = latestResponse.data.values || [];
      
      if (rowIndex > latestData.length) {
        console.log('Row index still out of bounds after fetching latest data - rowIndex:', rowIndex, 'latestData.length:', latestData.length);
        return res.status(404).json({ message: 'Item not found' });
      }
      
      // Update current data with latest data
      currentData = latestData;
      rows = currentData.slice(1);
    }
    
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
        const conflictEntry = {
          timestamp: Date.now(),
          userId: req.user.id,
          userEmail: req.user.email,
          action: 'CONFLICT_DETECTED',
          rowId: id,
          originalData: originalDataMap,
          attemptedData: attemptedDataMap,
          currentData: currentDataMap,
          changedFields: changedFields
        };
        
        // Check for duplicates (same user, same row, same timestamp within 1 second)
        const isDuplicate = changeLog.some(entry => 
          entry.userId === conflictEntry.userId &&
          entry.rowId === conflictEntry.rowId &&
          entry.action === conflictEntry.action &&
          Math.abs(entry.timestamp - conflictEntry.timestamp) < 1000
        );
        
        if (!isDuplicate) {
          changeLog.push(conflictEntry);
          saveChangeLog(changeLog);
        }
        
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
    // Update the metadata creation to use Melbourne timezone
    const metadataColumns = [
      new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }), // lastModified
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
      spreadsheetId: spreadsheetId,
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
    
    headers.forEach((header, index) => {
      const englishKey = headerMapping[header] || header.toLowerCase().replace(/\s+/g, '_');
      const oldValue = currentRowData[index] || '';
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
    
    // Log the successful change
    const updateEntry = {
      timestamp: Date.now(),
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'UPDATE',
      rowId: id,
      oldValue: oldValueMap,
      newValue: newValueMap,
      changedFields: changedFields,
      metadata: metadataColumns
    };
    
    // Check for duplicates (same user, same row, same timestamp within 1 second)
    const isDuplicate = changeLog.some(entry => 
      entry.userId === updateEntry.userId &&
      entry.rowId === updateEntry.rowId &&
      entry.action === updateEntry.action &&
      Math.abs(entry.timestamp - updateEntry.timestamp) < 1000
    );
    
    if (!isDuplicate) {
      changeLog.push(updateEntry);
      saveChangeLog(changeLog);
    }

    // Clear the editing session
    editingSessions.delete(req.user.id);

    // After successful update, broadcast the change
    broadcastInventoryUpdate('UPDATE', {
      id: id,
      newData: { ...updatedItem, id: id }
    });
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5); // Last 5 changes
    broadcastRecentChanges(recentChanges);

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
    
    // Determine which source to add to (default to source1)
    const targetSource = newItem.targetSource || 'source1';
    const spreadsheetId = targetSource === 'source1' ? config.spreadsheetIds.inventory : config.spreadsheetIds.inventory2;
    
    if (!spreadsheetId) {
      return res.status(400).json({ message: `${targetSource} inventory spreadsheet ID not configured` });
    }

    // Create a new auth and sheets client with write access
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch current data to get headers
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
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
      spreadsheetId: spreadsheetId,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [newRow]
      }
    });

    // Log the add operation
    const addEntry = {
      timestamp: Date.now(),
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'ADD',
      rowId: nextRowNumber.toString(),
      newValue: newItem,
      changedFields: Object.keys(newItem).reduce((acc, key) => {
        acc[key] = {
          old: '',
          new: newItem[key],
          fieldName: key
        };
        return acc;
      }, {}),
      metadata: [
        new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }), // lastModified
        req.user.email, // modifiedBy
        '1' // version
      ]
    };
    
    // Check for duplicates
    const isDuplicate = changeLog.some(entry => 
      entry.userId === addEntry.userId &&
      entry.rowId === addEntry.rowId &&
      entry.action === addEntry.action &&
      Math.abs(entry.timestamp - addEntry.timestamp) < 1000
    );
    
    if (!isDuplicate) {
      changeLog.push(addEntry);
      saveChangeLog(changeLog);
    }

    // After successful add, broadcast the update
    broadcastInventoryUpdate('ADD', {
      id: nextRowNumber.toString(),
      item: newItem
    });
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5); // Last 5 changes
    broadcastRecentChanges(recentChanges);

    console.log('Google Sheets append successful');
    res.json({
      success: true,
      message: 'Item added successfully',
      data: newItem,
      id: nextRowNumber.toString() // Return the actual row number for deletion
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
    
    // For delete, we need to determine the source from the request body or query
    // This will be handled by the frontend sending the source information
    const source = req.query.source || 'source1';
    const spreadsheetId = source === 'source1' ? config.spreadsheetIds.inventory : config.spreadsheetIds.inventory2;
    
    if (!spreadsheetId) {
      return res.status(400).json({ message: `${source} inventory spreadsheet ID not configured` });
    }

    // Create a new auth and sheets client with write access
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch current data to validate row exists
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'A:L',
    });
    const currentData = response.data.values || [];
    
    if (!currentData || currentData.length < 2) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    const rowIndex = parseInt(id);
    
    // Validate row index - should be between 2 and the total number of rows in the sheet
    if (rowIndex < 2 || rowIndex > currentData.length) {
      console.log('❌ Row index out of bounds - rowIndex:', rowIndex, 'currentData.length:', currentData.length);
      console.log('📋 Current data rows:', currentData.slice(0, 5).map((row, i) => `Row ${i + 1}: ${row.slice(0, 3).join(', ')}`));
      
      // Add a small delay and retry once to handle race conditions
      console.log('⏳ Row index out of bounds, waiting 1 second and retrying...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch fresh data after delay
      try {
        const retryResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          range: 'A:L',
        });
        
        const retryData = retryResponse.data.values || [];
        if (retryData.length >= 2) {
          const retryHeaders = retryData[0];
          const retryRows = retryData.slice(1);
          
          // Check if the row index is now valid
          if (rowIndex >= 2 && rowIndex <= retryRows.length + 1) {
            console.log('✅ Row index valid after retry, proceeding with delete...');
            currentData = retryData;
            rows = retryRows;
          } else {
            console.log('❌ Row index still out of bounds after retry');
            return res.status(404).json({ message: 'Item not found - please try again' });
          }
        } else {
          console.log('❌ No data available after retry');
          return res.status(404).json({ message: 'Item not found - please try again' });
        }
      } catch (retryError) {
        console.log('❌ Error during retry:', retryError.message);
        return res.status(404).json({ message: 'Item not found - please try again' });
      }
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

    // Log the delete operation
    const deleteEntry = {
      timestamp: Date.now(),
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'DELETE',
      rowId: id,
      oldValue: currentData[rowIndex - 1], // Store the deleted row data
      changedFields: {},
      metadata: [
        new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }), // lastModified
        req.user.email, // modifiedBy
        '0' // version (deleted)
      ]
    };
    
    // Check for duplicates
    const isDuplicate = changeLog.some(entry => 
      entry.userId === deleteEntry.userId &&
      entry.rowId === deleteEntry.rowId &&
      entry.action === deleteEntry.action &&
      Math.abs(entry.timestamp - deleteEntry.timestamp) < 1000
    );
    
    if (!isDuplicate) {
      changeLog.push(deleteEntry);
      saveChangeLog(changeLog);
    }

    // After successful delete, broadcast the update
    broadcastInventoryUpdate('DELETE', {
      id: id,
      deletedData: currentData[rowIndex - 1]
    });
    
    // Also trigger a full refresh to update row indices
    setTimeout(async () => {
      try {
        const refreshResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheetIds.inventory,
          range: 'A:L',
        });
        
        const refreshedData = refreshResponse.data.values || [];
        if (refreshedData.length >= 2) {
          const headers = refreshedData[0];
          const rows = refreshedData.slice(1);
          
          const inventory = rows.map((row, index) => {
            const item = {};
            headers.forEach((header, colIndex) => {
              item[header.toLowerCase().replace(/\s+/g, '_')] = row[colIndex] || '';
            });
            item.id = (index + 2).toString(); // Row index starts from 2
            return item;
          });
          
          broadcastInventoryUpdate('REFRESH', {
            inventory: inventory,
            changes: [{ action: 'DELETE', rowId: id }]
          });
        }
      } catch (error) {
        console.error('Error refreshing inventory after delete:', error);
      }
    }, 1000); // Wait 1 second for Google Sheets to update
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5); // Last 5 changes
    broadcastRecentChanges(recentChanges);

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

// Bulk action endpoints
app.post('/api/stock/bulk-checkout', authenticateToken, async (req, res) => {
  try {
    const { itemIds, quantities } = req.body;
    const config = await loadConfig();
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Item IDs are required' });
    }

    console.log('Processing bulk checkout for items:', itemIds);
    
    // Fetch current inventory data
    const currentData = await fetchSheetData(config.spreadsheetIds.inventory, 'A:Z');
    const headers = currentData[0];
    const rows = currentData.slice(1);
    
    const changeLog = await loadChangeLog();
    const updates = [];
    
    for (const itemId of itemIds) {
      const rowIndex = parseInt(itemId) - 1; // Convert to 0-based index
      if (rowIndex >= 0 && rowIndex < rows.length) {
        const row = rows[rowIndex];
        const currentQuantity = parseInt(row[headers.findIndex(h => h.toLowerCase().includes('quantity'))] || 0);
        const requestedQuantity = quantities[itemId] || 1;
        
        if (currentQuantity < requestedQuantity) {
          return res.status(400).json({ 
            message: `Insufficient quantity for item ${itemId}. Available: ${currentQuantity}, Requested: ${requestedQuantity}` 
          });
        }
        
        // Update quantity
        const newQuantity = currentQuantity - requestedQuantity;
        row[headers.findIndex(h => h.toLowerCase().includes('quantity'))] = newQuantity.toString();
        
        // Add to change log
        const changeEntry = {
          timestamp: Date.now(),
          userId: req.user.id,
          userEmail: req.user.email,
          action: 'BULK_CHECKOUT',
          rowId: itemId,
          oldValue: { quantity: currentQuantity },
          newValue: { quantity: newQuantity },
          changedFields: {
            quantity: {
              old: currentQuantity,
              new: newQuantity,
              fieldName: 'Quantity'
            }
          },
          metadata: ['BULK_ACTION', 'CHECKOUT', requestedQuantity.toString()]
        };
        
        changeLog.push(changeEntry);
        updates.push({ rowIndex: rowIndex + 2, row }); // +2 for Google Sheets row offset
      }
    }
    
    // Update Google Sheets
    for (const update of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetIds.inventory,
        range: `A${update.rowIndex}:Z${update.rowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [update.row]
        }
      });
    }
    
    // Save change log
    await saveChangeLog(changeLog);
    
    // Broadcast updates
    broadcastInventoryUpdate('BULK_CHECKOUT', {
      itemIds,
      quantities,
      changes: changeLog.slice(-itemIds.length)
    });
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5);
    broadcastRecentChanges(recentChanges);
    
    res.json({
      success: true,
      message: `Successfully checked out ${itemIds.length} items`,
      updatedItems: itemIds
    });
    
  } catch (error) {
    console.error('Error processing bulk checkout:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/stock/bulk-send-out', authenticateToken, async (req, res) => {
  try {
    const { itemIds, quantities } = req.body;
    const config = await loadConfig();
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Item IDs are required' });
    }

    console.log('Processing bulk send out for items:', itemIds);
    
    // Fetch current inventory data
    const currentData = await fetchSheetData(config.spreadsheetIds.inventory, 'A:Z');
    const headers = currentData[0];
    const rows = currentData.slice(1);
    
    const changeLog = await loadChangeLog();
    const updates = [];
    
    for (const itemId of itemIds) {
      const rowIndex = parseInt(itemId) - 1; // Convert to 0-based index
      if (rowIndex >= 0 && rowIndex < rows.length) {
        const row = rows[rowIndex];
        const currentQuantity = parseInt(row[headers.findIndex(h => h.toLowerCase().includes('quantity'))] || 0);
        const requestedQuantity = quantities[itemId] || 1;
        
        if (currentQuantity < requestedQuantity) {
          return res.status(400).json({ 
            message: `Insufficient quantity for item ${itemId}. Available: ${currentQuantity}, Requested: ${requestedQuantity}` 
          });
        }
        
        // Update quantity
        const newQuantity = currentQuantity - requestedQuantity;
        row[headers.findIndex(h => h.toLowerCase().includes('quantity'))] = newQuantity.toString();
        
        // Update status to "Sent Out" if status column exists
        const statusIndex = headers.findIndex(h => h.toLowerCase().includes('status'));
        if (statusIndex !== -1) {
          row[statusIndex] = 'Sent Out';
        }
        
        // Add to change log
        const changeEntry = {
          timestamp: Date.now(),
          userId: req.user.id,
          userEmail: req.user.email,
          action: 'BULK_SEND_OUT',
          rowId: itemId,
          oldValue: { quantity: currentQuantity },
          newValue: { quantity: newQuantity, status: 'Sent Out' },
          changedFields: {
            quantity: {
              old: currentQuantity,
              new: newQuantity,
              fieldName: 'Quantity'
            },
            status: {
              old: row[statusIndex] || '',
              new: 'Sent Out',
              fieldName: 'Status'
            }
          },
          metadata: ['BULK_ACTION', 'SEND_OUT', requestedQuantity.toString()]
        };
        
        changeLog.push(changeEntry);
        updates.push({ rowIndex: rowIndex + 2, row }); // +2 for Google Sheets row offset
      }
    }
    
    // Update Google Sheets
    for (const update of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetIds.inventory,
        range: `A${update.rowIndex}:Z${update.rowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [update.row]
        }
      });
    }
    
    // Save change log
    await saveChangeLog(changeLog);
    
    // Broadcast updates
    broadcastInventoryUpdate('BULK_SEND_OUT', {
      itemIds,
      quantities,
      changes: changeLog.slice(-itemIds.length)
    });
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5);
    broadcastRecentChanges(recentChanges);
    
    res.json({
      success: true,
      message: `Successfully sent out ${itemIds.length} items`,
      updatedItems: itemIds
    });
    
  } catch (error) {
    console.error('Error processing bulk send out:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Customer management endpoints
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    // For now, return empty array - you can implement customer storage later
    res.json({ customers: [] });
  } catch (error) {
    console.error('Error loading customers:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Checkout endpoint
app.post('/api/stock/checkout', authenticateToken, async (req, res) => {
  try {
    const { customer, items, notes } = req.body;
    const config = await loadConfig();
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items are required' });
    }

    if (!customer || !customer.name || !customer.address) {
      return res.status(400).json({ message: 'Customer information is required' });
    }

    console.log('Processing checkout for customer:', customer.name);
    
    // Fetch current inventory data
    const currentData = await fetchSheetData(config.spreadsheetIds.inventory, 'A:Z');
    const headers = currentData[0];
    const rows = currentData.slice(1);
    
    const changeLog = await loadChangeLog();
    const updates = [];
    
    for (const item of items) {
      const rowIndex = parseInt(item.id) - 1; // Convert to 0-based index
      if (rowIndex >= 0 && rowIndex < rows.length) {
        const row = rows[rowIndex];
        const currentQuantity = parseInt(row[headers.findIndex(h => h.toLowerCase().includes('quantity'))] || 0);
        const requestedQuantity = item.quantity || 1;
        
        if (currentQuantity < requestedQuantity) {
          return res.status(400).json({ 
            message: `Insufficient quantity for item ${item.id}. Available: ${currentQuantity}, Requested: ${requestedQuantity}` 
          });
        }
        
        // Update quantity
        const newQuantity = currentQuantity - requestedQuantity;
        row[headers.findIndex(h => h.toLowerCase().includes('quantity'))] = newQuantity.toString();
        
        // Add to change log
        const changeEntry = {
          timestamp: Date.now(),
          userId: req.user.id,
          userEmail: req.user.email,
          action: 'CHECKOUT',
          rowId: item.id,
          oldValue: { quantity: currentQuantity },
          newValue: { quantity: newQuantity },
          changedFields: {
            quantity: {
              old: currentQuantity,
              new: newQuantity,
              fieldName: 'Quantity'
            }
          },
          metadata: ['CHECKOUT', customer.name, requestedQuantity.toString(), notes || '']
        };
        
        changeLog.push(changeEntry);
        updates.push({ rowIndex: rowIndex + 2, row }); // +2 for Google Sheets row offset
      }
    }
    
    // Update Google Sheets
    for (const update of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetIds.inventory,
        range: `A${update.rowIndex}:Z${update.rowIndex}`,
        valueInputOption: 'RAW',
        resource: {
          values: [update.row]
        }
      });
    }
    
    // Save change log
    await saveChangeLog(changeLog);
    
    // Broadcast updates
    broadcastInventoryUpdate('CHECKOUT', {
      items,
      customer,
      changes: changeLog.slice(-items.length)
    });
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5);
    broadcastRecentChanges(recentChanges);
    
    res.json({
      success: true,
      message: `Successfully checked out ${items.length} items for ${customer.name}`,
      updatedItems: items.map(item => item.id)
    });
    
  } catch (error) {
    console.error('Error processing checkout:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// WebSocket event handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle user authentication
  socket.on('authenticate', (data) => {
    try {
      const token = data.token;
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          socket.emit('auth_error', { message: 'Invalid token' });
          return;
        }
        
        // Store client connection
        connectedClients.set(socket.id, {
          userId: user.id,
          userInfo: user
        });
        
        // Update active users
        activeUsers.set(user.id, {
          lastSeen: Date.now(),
          userInfo: user
        });
        
        socket.emit('authenticated', { user });
        console.log('User authenticated via WebSocket:', user.email);
      });
    } catch (error) {
      socket.emit('auth_error', { message: 'Authentication failed' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const clientData = connectedClients.get(socket.id);
    if (clientData) {
      console.log('Client disconnected:', clientData.userInfo.email);
      connectedClients.delete(socket.id);
    }
  });
});

// Real-time data broadcasting functions
function broadcastInventoryUpdate(action, data) {
  io.emit('inventory_update', {
    action,
    data,
    timestamp: Date.now()
  });
}

function broadcastRecentChanges(changes) {
  io.emit('recent_changes', {
    changes,
    timestamp: Date.now()
  });
}

function broadcastUserActivity(userId, action) {
  const clientData = connectedClients.get(userId);
  if (clientData) {
    io.emit('user_activity', {
      userId,
      userEmail: clientData.userInfo.email,
      action,
      timestamp: Date.now()
    });
  }
}

// Google Sheets polling system
let lastInventoryData = null;
let pollingInterval = null;

async function startGoogleSheetsPolling() {
  try {
    const config = await loadConfig();
    if (!config.spreadsheetIds.inventory && !config.spreadsheetIds.inventory2) {
      console.log('⚠️ No inventory spreadsheets configured, skipping polling');
      return;
    }

    console.log('🔄 Starting Google Sheets polling every 30 seconds...');
    
    // Initial fetch
    await checkForGoogleSheetsChanges();
    
    // Set up polling interval with error handling
    pollingInterval = setInterval(async () => {
      try {
        await checkForGoogleSheetsChanges();
      } catch (error) {
        console.error('❌ Error in polling cycle:', error);
        // Don't let polling errors crash the server
      }
    }, 30000); // 30 seconds
    
  } catch (error) {
    console.error('❌ Error starting Google Sheets polling:', error);
  }
}

async function checkForGoogleSheetsChanges() {
  try {
    const config = await loadConfig();
    if (!config.spreadsheetIds.inventory && !config.spreadsheetIds.inventory2) {
      return;
    }

    console.log('📊 Checking Google Sheets for changes...');
    
    // Broadcast sync start
    io.emit('sheets_sync_start', {
      timestamp: Date.now()
    });
    
    // Fetch current data from both inventory sources
    const inventoryPromises = [];
    
    if (config.spreadsheetIds.inventory) {
      inventoryPromises.push(
        fetchSheetData(config.spreadsheetIds.inventory, 'A:Z')
          .then(data => processInventoryData(data, 'source1'))
          .catch(error => {
            console.error('Error fetching from inventory source 1:', error);
            return [];
          })
      );
    }
    
    if (config.spreadsheetIds.inventory2) {
      inventoryPromises.push(
        fetchSheetData(config.spreadsheetIds.inventory2, 'A:Z', 'VKT')
          .then(data => processInventoryData(data, 'source2'))
          .catch(error => {
            console.error('Error fetching from inventory source 2:', error);
            return [];
          })
      );
    }

    // Wait for all inventory data to be fetched
    const inventoryArrays = await Promise.all(inventoryPromises);
    const currentInventory = inventoryArrays.flat();
    
    // Convert to comparable format (stringify for deep comparison)
    const currentDataString = JSON.stringify(currentInventory);
    
    if (lastInventoryData === null) {
      // First time loading, just store the data
      lastInventoryData = currentDataString;
      console.log('📋 Initial inventory data loaded');
      
      // Broadcast sync success
      io.emit('sheets_sync_success', {
        timestamp: Date.now(),
        message: 'Initial data loaded'
      });
      return;
    }
    
    // Check if data has changed
    if (currentDataString !== lastInventoryData) {
      console.log('🔄 Changes detected in Google Sheets! Broadcasting update...');
      
      // Parse the data back to objects for comparison
      const oldInventory = JSON.parse(lastInventoryData);
      const newInventory = currentInventory;
      
      // Find what changed
      const changes = detectInventoryChanges(oldInventory, newInventory);
      
      // Broadcast the full inventory update
      broadcastInventoryUpdate('REFRESH', {
        inventory: newInventory,
        changes: changes,
        source: 'google_sheets'
      });
      
      // Update stored data
      lastInventoryData = currentDataString;
      
      // Log changes for debugging
      if (changes.length > 0) {
        console.log('📝 Detected changes:', changes.map(c => `${c.action} item ${c.id}`));
      }
      
      // Broadcast sync success with changes
      io.emit('sheets_sync_success', {
        timestamp: Date.now(),
        changes: changes.length,
        message: `Found ${changes.length} changes`
      });
      
    } else {
      console.log('✅ No changes detected in Google Sheets');
      
      // Broadcast sync success with no changes
      io.emit('sheets_sync_success', {
        timestamp: Date.now(),
        changes: 0,
        message: 'No changes detected'
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking Google Sheets changes:', error);
    
    // Broadcast sync error
    io.emit('sheets_sync_error', {
      timestamp: Date.now(),
      error: error.message
    });
  }
}

function detectInventoryChanges(oldInventory, newInventory) {
  const changes = [];
  
  // Create maps for easy lookup
  const oldMap = new Map(oldInventory.map(item => [item.id, item]));
  const newMap = new Map(newInventory.map(item => [item.id, item]));
  
  // Check for deleted items
  for (const [id, oldItem] of oldMap) {
    if (!newMap.has(id)) {
      changes.push({
        action: 'DELETE',
        id: id,
        oldData: oldItem,
        newData: null
      });
    }
  }
  
  // Check for added and updated items
  for (const [id, newItem] of newMap) {
    if (!oldMap.has(id)) {
      changes.push({
        action: 'ADD',
        id: id,
        oldData: null,
        newData: newItem
      });
    } else {
      const oldItem = oldMap.get(id);
      // Check if any field has changed
      const hasChanges = Object.keys(newItem).some(key => 
        newItem[key] !== oldItem[key]
      );
      
      if (hasChanges) {
        changes.push({
          action: 'UPDATE',
          id: id,
          oldData: oldItem,
          newData: newItem
        });
      }
    }
  }
  
  return changes;
}

// Start polling when server starts
startGoogleSheetsPolling();

// Clean up polling on server shutdown
const cleanup = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    console.log('🛑 Google Sheets polling stopped');
  }
  if (server) {
    server.close();
    console.log('🛑 Server closed');
  }
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
// Remove the 'exit' event listener as it can cause premature shutdown

server.listen(PORT, () => {
  console.log(`Stock Management Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`WebSocket server ready for real-time updates`);
}); 