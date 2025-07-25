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

// Customer information endpoint
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const config = await loadConfig();
    
    if (!config.spreadsheetIds.customers) {
      return res.status(400).json({ 
        error: 'Customer spreadsheet ID not configured' 
      });
    }

    console.log('📋 Fetching customer data from:', config.spreadsheetIds.customers);
    
    // Fetch customer data from the specific sheet (gid=229828661)
    const customerData = await fetchSheetData(config.spreadsheetIds.customers, 'A:Z');
    
    console.log('📊 Customer data fetched, rows:', customerData.length);
    
    // Process customer data
    const processedCustomers = processCustomerData(customerData);
    
    res.json({
      success: true,
      customers: processedCustomers
    });

  } catch (error) {
    console.error('Error fetching customer data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customer data',
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
    } else {
      item.warehouse = 'TH'; // Set warehouse to TH for source 1
    }
    
        // Use actual row number in sheet (index + 2 because sheets are 1-indexed and we skip header)
    const rowNumber = index + 2;
    item.id = rowNumber.toString();
    // Add source tracking
    item.source = source;
    item.sourceId = `${source}_${item.id}`;
    
    // Make ID unique across sources by prefixing with source
    if (source === 'source2') {
      item.id = `vkt_${item.id}`;
    } else {
      item.id = `th_${item.id}`;
    }
    
    // Store the original row number for reliable deletion
    item.originalRowNumber = rowNumber;
    
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

function processCustomerData(data) {
  if (!data || data.length < 2) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  // console.log('📋 Google Sheets headers received:', headers);
  
  // Vietnamese to English header mapping (exact headers from your Google Sheets)
  const vietnameseHeaderMapping = {
    // Your actual Google Sheets headers
    'Mã khách hàng\n(Tên Viết tắt công ty)': 'customer_number',
    'Công ty\n(Nhập đầy đủ tên công ty)': 'company_name',
    'Liên hệ \n(Nhập Tên-SĐT-Email mua hàng)': 'contact',
    'Địa chỉ \n(Nhập tên đường, xã, phường)': 'address',
    'Khu vực\n(Nhập Quận, Tp, Tỉnh)': 'location',
    'Phường/Xã': 'ward',
    'Mã số thuế\n(Nhập đầy đủ )': 'tax_code',
    'Ghi Chú': 'notes',
    
    // Additional common Vietnamese headers (fallback)
    'Tên khách hàng': 'customer_name',
    'Địa chỉ': 'address',
    'Số điện thoại': 'phone',
    'Email': 'email',
    'Mã khách hàng': 'customer_code',
    'Ngày sinh': 'birth_date',
    'Giới tính': 'gender',
    'Nghề nghiệp': 'occupation',
    'Ghi chú': 'notes',
    'Trạng thái': 'status',
    'Ngày tạo': 'created_date',
    'Người tạo': 'created_by',
    'Loại khách hàng': 'customer_type',
    'Công ty': 'company',
    'Mã số thuế': 'tax_code',
    'Quốc gia': 'country',
    'Thành phố': 'city',
    'Quận/Huyện': 'district',
    'Ngành nghề': 'industry',
    'Website': 'website',
    'Fax': 'fax',
    'Chức vụ': 'position',
    'Phòng ban': 'department',
    'Nguồn khách hàng': 'customer_source',
    'Mức độ quan trọng': 'priority_level',
    'Doanh thu': 'revenue',
    'Ngân hàng': 'bank',
    'Số tài khoản': 'account_number',
    'Điểm tín dụng': 'credit_score',
    'Hạn mức tín dụng': 'credit_limit',
    'Sở thích': 'preferences',
    'Liên hệ chính': 'primary_contact',
    'Người giới thiệu': 'referrer',
    'Kênh bán hàng': 'sales_channel',
    'Nhóm khách hàng': 'customer_group'
  };
  
  return rows.map((row, index) => {
    const customer = {};
    
    // Map headers to customer fields
    headers.forEach((header, colIndex) => {
      if (header) {
        // Use Vietnamese mapping if available, otherwise create clean key
        const key = vietnameseHeaderMapping[header] || 
          header.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w_]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        
        // Log if header is not in mapping (only on first row)
        if (index === 0 && !vietnameseHeaderMapping[header]) {
          console.log(`📋 Unmapped header found: "${header}" -> "${key}"`);
        }
        
        // Always include the field, even if row data is shorter or undefined
        customer[key] = (colIndex < row.length && row[colIndex] !== undefined) ? row[colIndex] : '';
        
        // Store original header for display purposes
        if (!customer._headers) customer._headers = {};
        customer._headers[key] = header;
        
        // Debug for "Ghi Chú" column (first few rows)
        // if (index < 5 && header === 'Ghi Chú') {
        //   console.log(`📋 Row ${index + 1} "Ghi Chú": "${customer[key]}" (colIndex: ${colIndex}, rowLength: ${row.length})`);
        // }
      }
    });
    
    // Add unique ID
    customer.id = `customer_${index + 1}`;
    
    // Debug: Log first customer to see all fields
    // if (index === 0) {
    //   console.log('📋 First customer keys:', Object.keys(customer));
    //   console.log('📋 Notes value:', customer.notes);
    // }
    
    return customer;
      }).filter(customer => {
      // Filter out empty rows (rows where all values are empty)
      return Object.entries(customer).some(([key, value]) => 
        key !== '_headers' && key !== 'id' && value && value.toString().trim() !== '');
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
        purchases: '',
        customers: ''
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

// Global variable to track last Google Sheets sync time
let lastGoogleSheetsSync = Date.now();

// Bulk delete inventory items endpoint
app.post('/api/stock/inventory/bulk-delete', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ Bulk delete request received');
    const { items } = req.body; // Array of items with id and source
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const config = await loadConfig();
    let deletedCount = 0;
    const deleteResults = [];

    // Set manual deletion flag to prevent polling during bulk operation
    isManualDeletionInProgress = true;
    console.log('🚀 Starting bulk delete operation for', items.length, 'items');

    // Group items by source
    const itemsBySource = {};
    items.forEach(item => {
      const source = item.source || 'source1';
      if (!itemsBySource[source]) {
        itemsBySource[source] = [];
      }
      itemsBySource[source].push(item);
    });

    // Process each source separately
    for (const [source, sourceItems] of Object.entries(itemsBySource)) {
      const spreadsheetId = source === 'source1' ? config.spreadsheetIds.inventory : config.spreadsheetIds.inventory2;
      
      if (!spreadsheetId) {
        console.log(`⚠️ Skipping ${source} - spreadsheet ID not configured`);
        continue;
      }

      console.log(`🗑️ Processing ${sourceItems.length} items for ${source}`);

      // Create auth and sheets client with write access
      const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      const sheets = google.sheets({ version: 'v4', auth });

      // Get the correct sheet ID dynamically
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });
      const sheetId = spreadsheet.data.sheets[0].properties.sheetId;
      console.log(`📋 ${source} Sheet ID:`, sheetId);

      // Fetch current data to get row information
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'A:L',
      });
      const currentData = response.data.values || [];

      if (!currentData || currentData.length < 2) {
        console.log(`⚠️ Invalid spreadsheet data for ${source}`);
        continue;
      }

      const headers = currentData[0];
      const rows = currentData.slice(1);

      // Find row indices for items to delete (sort by row index descending to delete from bottom up)
      const itemsToDelete = [];
      sourceItems.forEach(item => {
        const rowIndex = parseInt(item.id.split('_')[1]);
        const dataRowIndex = rowIndex - 2; // Convert to 0-based data array index
        
        if (dataRowIndex >= 0 && dataRowIndex < rows.length) {
          itemsToDelete.push({
            item,
            rowIndex: rowIndex,
            dataRowIndex: dataRowIndex,
            rowData: rows[dataRowIndex]
          });
        }
      });

      // Sort by row index descending (delete from bottom to top)
      itemsToDelete.sort((a, b) => b.rowIndex - a.rowIndex);

      console.log(`🔄 Deleting ${itemsToDelete.length} items from bottom to top for ${source}`);

      // Delete rows from bottom to top
      for (const deleteInfo of itemsToDelete) {
        try {
          console.log(`🗑️ Deleting row ${deleteInfo.rowIndex} (${deleteInfo.item.id})`);
          
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: sheetId, // Use dynamically retrieved sheet ID
                    dimension: 'ROWS',
                    startIndex: deleteInfo.rowIndex - 1, // Convert to 0-based
                    endIndex: deleteInfo.rowIndex // Exclusive end
                  }
                }
              }]
            }
          });

          // Add to change log (but don't save yet)
          const changeEntry = {
            timestamp: new Date().toISOString(),
            action: 'DELETE',
            user: req.user.email,
            itemId: deleteInfo.item.id,
            details: {
              source: source,
              rowIndex: deleteInfo.rowIndex,
              deletedData: deleteInfo.rowData
            }
          };
          
          changeLog.unshift(changeEntry);
          deletedCount++;
          
          deleteResults.push({
            id: deleteInfo.item.id,
            success: true,
            rowIndex: deleteInfo.rowIndex
          });

        } catch (error) {
          console.error(`❌ Failed to delete ${deleteInfo.item.id}:`, error);
          deleteResults.push({
            id: deleteInfo.item.id,
            success: false,
            error: error.message
          });
        }
      }
    }

    // Save change log once at the end
    if (deletedCount > 0) {
      await saveChangeLog(changeLog);
      console.log(`📝 Saved ${deletedCount} delete entries to change log`);
    }

    // Update the last sync time
    lastGoogleSheetsSync = Date.now();
    console.log('🔄 Google Sheets sync updated after bulk deletion at:', new Date(lastGoogleSheetsSync).toLocaleTimeString());

    // Clear manual deletion flag
    isManualDeletionInProgress = false;
    console.log('✅ Manual deletion flag cleared, allowing immediate sync');

    // Trigger immediate sync after bulk deletion
    console.log('🔄 Triggering immediate Google Sheets sync after bulk deletion...');
    setTimeout(async () => {
      try {
        await checkForGoogleSheetsChanges();
      } catch (error) {
        console.error('❌ Error in post-bulk-delete sync:', error);
      }
    }, 1000);

    res.json({
      success: true,
      message: `Bulk delete completed: ${deletedCount} items deleted`,
      deletedCount,
      results: deleteResults
    });

  } catch (error) {
    console.error('❌ Bulk delete error:', error);
    isManualDeletionInProgress = false; // Clear flag on error
    res.status(500).json({ 
      message: 'Bulk delete failed', 
      error: error.message 
    });
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

    // Check if this is a bulk delete operation (skip sync delay for bulk operations)
    const isBulkDelete = req.headers['x-bulk-delete'] === 'true' || req.query.bulk === 'true';
    
    // Check if we need to wait for Google Sheets sync (skip for bulk delete)
    const timeSinceLastSync = Date.now() - lastGoogleSheetsSync;
    const syncWaitTime = 5000; // 5 seconds
    
    if (!isBulkDelete && timeSinceLastSync < syncWaitTime) {
      const remainingTime = syncWaitTime - timeSinceLastSync;
      console.log(`⏳ Waiting for Google Sheets sync... ${remainingTime}ms remaining`);
      return res.status(429).json({ 
        message: 'Please wait for Google Sheets to sync before deleting again',
        remainingTime: remainingTime,
        retryAfter: Math.ceil(remainingTime / 1000)
      });
    }
    
    if (isBulkDelete) {
      console.log('🚀 Bulk delete detected - skipping sync delay');
    }

    // Create a new auth and sheets client with write access
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Set flag to prevent polling interference during manual deletion
    isManualDeletionInProgress = true;
    
    // Parse original row index from ID (handle prefixed IDs like 'th_636' or 'vkt_125')
    let originalRowIndex;
    if (id.includes('_')) {
      const parts = id.split('_');
      originalRowIndex = parseInt(parts[parts.length - 1]);
    } else {
      originalRowIndex = parseInt(id);
    }
    
    console.log('🔍 Attempting to delete item with original row index:', originalRowIndex);
    
    // IMPROVED DELETE APPROACH - Find by content, not just row index
    console.log('🔍 Using improved delete approach with content matching...');
    
    // Fetch current data to find the correct row to delete
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'A:Z', // Extended range to get all data
    });
    const currentData = response.data.values || [];
    
    if (!currentData || currentData.length < 2) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    console.log(`📊 Current sheet has ${currentData.length} rows (including header)`);
    
    // Try to find the row by original index first, but also by content matching
    let actualRowIndex = -1;
    let rowDataToDelete = null;
    
    // Strategy 1: Try original row index if it's within bounds
    const originalRowZeroBased = originalRowIndex - 1; // Convert to 0-based
    if (originalRowZeroBased >= 0 && originalRowZeroBased < currentData.length) {
      console.log(`🎯 Trying original row index ${originalRowIndex} (0-based: ${originalRowZeroBased})`);
      actualRowIndex = originalRowZeroBased;
      rowDataToDelete = currentData[actualRowIndex];
    } else {
      console.log(`⚠️ Original row index ${originalRowIndex} is out of bounds (sheet has ${currentData.length} rows)`);
      
      // Strategy 2: For bulk deletes, try to find by matching item data
      if (isBulkDelete && req.body && req.body.itemData) {
        const itemData = req.body.itemData;
        console.log('🔍 Searching for item by content matching:', itemData);
        
                 // Search through all rows to find a matching item
        for (let i = 1; i < currentData.length; i++) { // Skip header row
          const row = currentData[i];
          if (row && row.length > 0) {
            // Debug: log what we're comparing
            console.log(`🔍 Checking row ${i + 1}: [${row.slice(0, 5).join(', ')}...]`);
            console.log(`   Looking for: brand="${itemData.brand}", product_code="${itemData.product_code}", product_name="${itemData.product_name}"`);
            console.log(`   Row has: brand="${row[0]}", product_code="${row[1]}", product_name="${row[2]}"`);
            
            // Try to match by product_code, product_name, or brand (be more flexible with matching)
            const brandMatch = itemData.brand && row[0] && row[0].toString().trim() === itemData.brand.toString().trim();
            const codeMatch = itemData.product_code && row[1] && row[1].toString().trim() === itemData.product_code.toString().trim();
            const nameMatch = itemData.product_name && row[2] && row[2].toString().trim() === itemData.product_name.toString().trim();
            
            console.log(`   Matches: brand=${brandMatch}, code=${codeMatch}, name=${nameMatch}`);
            
            const rowMatches = brandMatch || codeMatch || nameMatch;
            
            if (rowMatches) {
              console.log(`✅ Found matching item at row ${i + 1} (0-based: ${i}) - matched by: ${brandMatch ? 'brand' : codeMatch ? 'code' : 'name'}`);
              actualRowIndex = i;
              rowDataToDelete = row;
              break;
            }
          }
        }
        
        if (actualRowIndex === -1) {
          console.log('❌ No matching item found by content search');
          console.log('📋 Available rows in sheet:');
          for (let i = 1; i < Math.min(currentData.length, 6); i++) {
            console.log(`   Row ${i + 1}: [${currentData[i].slice(0, 5).join(', ')}...]`);
          }
        }
      }
    }
    
    // If we still couldn't find the row, return error
    if (actualRowIndex === -1 || !rowDataToDelete) {
      console.log('❌ Could not find item to delete - item may have already been deleted');
      return res.status(404).json({ 
        error: 'Item not found',
        message: 'Item may have already been deleted or moved',
        originalRowIndex: originalRowIndex,
        currentSheetRows: currentData.length
      });
    }
    
    console.log(`🎯 Found item to delete at row ${actualRowIndex + 1} (0-based: ${actualRowIndex}): [${rowDataToDelete.join(', ')}]`);

    // Row data is already retrieved above
    console.log('🗑️ Deleting row data:', rowDataToDelete);

    // Get the sheet ID first
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });
    
    const sheetId = spreadsheet.data.sheets[0].properties.sheetId;
    console.log('Sheet ID:', sheetId, 'Row index to delete:', actualRowIndex);
    
    // Delete the specific row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: actualRowIndex, // actualRowIndex is already 0-based
                endIndex: actualRowIndex + 1 // End index is exclusive
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
      oldValue: rowDataToDelete, // Store the deleted row data
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
      deletedData: rowDataToDelete
    });
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5); // Last 5 changes
    broadcastRecentChanges(recentChanges);

    console.log('Google Sheets delete successful');
    
    // Update the last sync time after successful deletion
    lastGoogleSheetsSync = Date.now();
    console.log('🔄 Google Sheets sync updated after deletion at:', new Date(lastGoogleSheetsSync).toLocaleTimeString());
    
    // Clear the manual deletion flag immediately to allow immediate sync
    isManualDeletionInProgress = false;
    console.log('✅ Manual deletion flag cleared, allowing immediate sync');
    
    // Trigger immediate Google Sheets sync after deletion
    console.log('🔄 Triggering immediate Google Sheets sync after deletion...');
    setTimeout(async () => {
      try {
        await checkForGoogleSheetsChanges();
        console.log('✅ Immediate sync completed after deletion');
      } catch (error) {
        console.error('❌ Error during immediate sync after deletion:', error);
      }
    }, 1000); // Wait 1 second before triggering sync
    
    res.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting inventory item:', error);
    console.error('❌ Delete request details:');
    console.error('   - Item ID:', id);
    console.error('   - Source:', req.query.source);
    console.error('   - Is bulk delete:', req.headers['x-bulk-delete'] === 'true');
    console.error('   - Request body:', req.body);
    
    // Clear the manual deletion flag on error
    isManualDeletionInProgress = false;
    
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message,
      itemId: id
    });
  }
});

// Manual sync endpoint
app.post('/api/sync/manual', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Manual sync requested by user:', req.user.email);
    
    // Trigger immediate Google Sheets sync
    await checkForGoogleSheetsChanges();
    
    // Fetch fresh inventory data
    const config = await loadConfig();
    
    if (!config.spreadsheetIds.inventory && !config.spreadsheetIds.inventory2) {
      return res.status(400).json({ 
        error: 'No inventory spreadsheet IDs configured' 
      });
    }

    // Fetch data from both inventory sources
    const inventoryPromises = [];
    
    if (config.spreadsheetIds.inventory) {
      inventoryPromises.push(
        fetchSheetData(config.spreadsheetIds.inventory, 'A:Z')
          .then(data => processInventoryData(data, 'source1'))
          .catch(error => {
            console.error('❌ Error fetching from inventory source 1:', error);
            return [];
          })
      );
    }
    
    if (config.spreadsheetIds.inventory2) {
      inventoryPromises.push(
        fetchSheetData(config.spreadsheetIds.inventory2, 'A:Z', 'VKT')
          .then(data => processInventoryData(data, 'source2'))
          .catch(error => {
            console.error('❌ Error fetching from inventory source 2:', error);
            return [];
          })
      );
    }

    // Wait for all inventory data to be fetched
    const inventoryArrays = await Promise.all(inventoryPromises);
    const combinedInventory = inventoryArrays.flat();
    
    console.log('✅ Manual sync completed:', combinedInventory.length, 'items');
    
    res.json({
      success: true,
      inventory: combinedInventory,
      syncTime: new Date().toISOString(),
      message: 'Manual sync completed successfully'
    });
    
  } catch (error) {
    console.error('❌ Manual sync failed:', error);
    res.status(500).json({ 
      error: 'Manual sync failed',
      message: error.message 
    });
  }
});

// Data verification endpoint
app.post('/api/stock/verify-data', authenticateToken, async (req, res) => {
  try {
    const { inventory } = req.body;
    
    if (!inventory || !Array.isArray(inventory)) {
      return res.status(400).json({ message: 'Invalid inventory data' });
    }

    console.log('🔍 Verifying inventory data:', inventory.length, 'items');
    
    // For large datasets, just verify that we have the same number of items
    // and that the data structure is consistent
    const config = await loadConfig();
    const currentData = await fetchSheetData(config.spreadsheetIds.inventory, 'A:Z');
    
    if (!currentData || currentData.length < 2) {
      return res.status(400).json({ message: 'Invalid spreadsheet data' });
    }

    const rows = currentData.slice(1);
    const expectedItemCount = rows.length;
    const actualItemCount = inventory.length;
    
    console.log(`📊 Data verification: Expected ${expectedItemCount} items, got ${actualItemCount} items`);
    
    // Simple verification - check if the counts are close
    const countDifference = Math.abs(expectedItemCount - actualItemCount);
    const countDifferencePercentage = (countDifference / expectedItemCount) * 100;
    
    if (countDifferencePercentage <= 10) { // Allow 10% difference
      console.log('✅ Data verification successful');
      res.json({
        success: true,
        message: 'Data verified successfully',
        expectedItemCount,
        actualItemCount,
        countDifference,
        countDifferencePercentage
      });
    } else {
      console.log('❌ Data verification failed - count mismatch');
      res.status(400).json({
        success: false,
        message: 'Data verification failed - please refresh and try again',
        expectedItemCount,
        actualItemCount,
        countDifference,
        countDifferencePercentage
      });
    }
    
  } catch (error) {
    console.error('Error verifying data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Note: Bulk delete is now handled client-side using individual delete endpoints

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
    const { itemIds, quantities, notes } = req.body;
    const config = await loadConfig();
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Item IDs are required' });
    }

    console.log('🚀 Processing bulk send out for items:', itemIds);
    console.log('📝 Send out notes:', notes);
    
    // Create auth and sheets client
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    
    const changeLog = await loadChangeLog();
    const sendOutEntries = [];
    
    // Process each item ID
    for (const itemId of itemIds) {
      let actualRowNumber;
      let spreadsheetId;
      let sourceLocation;
      
      // Determine source and row number from item ID
      if (itemId.startsWith('th_')) {
        actualRowNumber = parseInt(itemId.replace('th_', ''));
        spreadsheetId = config.spreadsheetIds.inventory;
        sourceLocation = 'TH';
      } else if (itemId.startsWith('vkt_')) {
        actualRowNumber = parseInt(itemId.replace('vkt_', ''));
        spreadsheetId = config.spreadsheetIds.inventory2;
        sourceLocation = 'VKT';
      } else {
        // Default to TH for backward compatibility
        actualRowNumber = parseInt(itemId);
        spreadsheetId = config.spreadsheetIds.inventory;
        sourceLocation = 'TH';
      }
      
      // Fetch current data from the appropriate sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'A:Z',
      });
      const currentData = response.data.values || [];
      
      if (!currentData || currentData.length < 2) {
        continue; // Skip if no data
      }
      
      const headers = currentData[0];
      const rows = currentData.slice(1);
      const rowIndex = actualRowNumber - 2; // -2 because sheet row 1 is header, sheet row 2 is index 0
      
      if (rowIndex >= 0 && rowIndex < rows.length) {
        const row = [...rows[rowIndex]]; // Copy the row
        const quantityColIndex = headers.findIndex(h => h.toLowerCase().includes('quantity') || h === 'Số lượng');
        // Column O is index 14 (0-based)
        const sentOutColIndex = 14;
        
        const currentQuantity = parseInt(row[quantityColIndex] || '0');
        const sendOutQty = quantities && typeof quantities[itemId] === 'number' ? parseInt(quantities[itemId]) : currentQuantity;
        const newQuantity = Math.max(0, currentQuantity - sendOutQty);
        row[quantityColIndex] = newQuantity.toString();
        
        // Write sent out quantity and timestamp to column O
        const now = new Date();
        const melbourneTime = now.toLocaleString('en-AU', {
          timeZone: 'Australia/Melbourne',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        // Format: 'qty @ YYYY-MM-DD HH:mm - userEmail - notes' if notes provided
        const [datePart, timePart] = melbourneTime.split(', ');
        const [day, month, year] = datePart.split('/');
        // Use only the username part before @
        const userName = req.user.email.split('@')[0];
        let sendOutString = `${sendOutQty} @ ${year}-${month}-${day} ${timePart} - ${userName}`;
        if (notes && notes.trim()) {
          sendOutString += ` - ${notes.trim()}`;
        }
        // Append to previous data in the cell, separated by newline
        let prevSendOuts = row[sentOutColIndex] || '';
        if (prevSendOuts && prevSendOuts.trim()) {
          row[sentOutColIndex] = prevSendOuts.trim() + '\n' + sendOutString;
        } else {
          row[sentOutColIndex] = sendOutString;
        }
        // Update the Google Sheet
        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          range: `A${actualRowNumber}:Z${actualRowNumber}`,
          valueInputOption: 'RAW',
          resource: {
            values: [row]
          }
        });
        
        // Create change log entry with proper user tracking and notes
        const changeEntry = {
          timestamp: Date.now(),
          userId: req.user.id,
          userEmail: req.user.email,
          action: 'SEND_OUT',
          rowId: itemId,
          oldValue: { 
            quantity: currentQuantity,
            location: sourceLocation,
            data: rows[rowIndex]
          },
          newValue: { 
            quantity: newQuantity,
            location: sourceLocation,
            sentOut: true
          },
          changedFields: {
            quantity: {
              old: currentQuantity,
              new: newQuantity,
              fieldName: 'Quantity'
            },
            sentOut: {
              old: '',
              new: sendOutString,
              fieldName: 'Sent Out'
            }
          },
          metadata: ['SEND_OUT', sourceLocation, notes || '', sendOutQty.toString()]
        };
        
        sendOutEntries.push(changeEntry);
      }
    }
    
    // Add all send out entries to change log
    changeLog.push(...sendOutEntries);
    await saveChangeLog(changeLog);
    
    // Broadcast inventory update
    broadcastInventoryUpdate('BULK_SEND_OUT', {
      itemIds,
      quantities,
      notes,
      itemCount: sendOutEntries.length,
      changes: sendOutEntries
    });
    
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5);
    broadcastRecentChanges(recentChanges);
    
    console.log(`✅ Successfully sent out ${sendOutEntries.length} items`);
    
    res.json({
      success: true,
      message: `Successfully sent out ${sendOutEntries.length} items`,
      updatedItems: itemIds,
      processedItems: sendOutEntries.length
    });
    
  } catch (error) {
    console.error('❌ Error processing bulk send out:', error);
    res.status(500).json({ message: 'Internal server error: ' + error.message });
  }
});

// Customer management endpoints (moved to Google Sheets integration above)

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
        
        // Send current sync status to newly connected client
        socket.emit('sheets_sync_status', {
          lastSync: lastGoogleSheetsSync,
          status: 'synced'
        });
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
let lastUpdateTime = 0;
const UPDATE_DEBOUNCE_MS = 5000; // 5 seconds debounce
let isManualDeletionInProgress = false;

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

    // Skip polling if manual deletion is in progress
    if (isManualDeletionInProgress) {
      console.log('⏸️ Skipping polling - manual deletion in progress');
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
      const now = Date.now();
      
      // Debounce rapid successive updates
      if (now - lastUpdateTime < UPDATE_DEBOUNCE_MS) {
        console.log('⏳ Debouncing rapid update, skipping...');
        return;
      }
      
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
      
      // Update stored data and timestamp
      lastInventoryData = currentDataString;
      lastUpdateTime = now;
      
      // Update the last sync time when changes are detected
      lastGoogleSheetsSync = Date.now();
      console.log('🔄 Google Sheets sync completed at:', new Date(lastGoogleSheetsSync).toLocaleTimeString());
      
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
      
      // Update the last sync time even when no changes are detected
      lastGoogleSheetsSync = Date.now();
      console.log('🔄 Google Sheets sync completed at:', new Date(lastGoogleSheetsSync).toLocaleTimeString());
      
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

// Relocate inventory items between warehouses/locations
app.post('/api/stock/inventory/relocate', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Relocation request received:', req.body);
    const { itemIds, sourceLocation, destinationLocation, notes, quantities } = req.body;
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Item IDs are required' });
    }
    
    if (!sourceLocation || !destinationLocation) {
      return res.status(400).json({ message: 'Source and destination locations are required' });
    }
    
    if (sourceLocation === destinationLocation) {
      return res.status(400).json({ message: 'Source and destination locations cannot be the same' });
    }
    
    const config = await loadConfig();
    
    // Determine source and destination spreadsheet IDs
    const sourceSpreadsheetId = sourceLocation === 'TH' ? config.spreadsheetIds.inventory : config.spreadsheetIds.inventory2;
    const destinationSpreadsheetId = destinationLocation === 'TH' ? config.spreadsheetIds.inventory : config.spreadsheetIds.inventory2;
    
    if (!sourceSpreadsheetId || !destinationSpreadsheetId) {
      return res.status(400).json({ message: 'Source or destination spreadsheet not configured' });
    }
    
    console.log(`📊 Relocating ${itemIds.length} items from ${sourceLocation} to ${destinationLocation}`);
    console.log(`📋 Source sheet: ${sourceSpreadsheetId}`);
    console.log(`📋 Destination sheet: ${destinationSpreadsheetId}`);
    
    // Create auth and sheets client
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Fetch current data from source sheet
    const sourceResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sourceSpreadsheetId,
      range: 'A:Z',
    });
    const sourceData = sourceResponse.data.values || [];
    
    if (!sourceData || sourceData.length < 2) {
      return res.status(400).json({ message: 'Invalid source spreadsheet data' });
    }
    
    // Fetch current data from destination sheet
    const destinationResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: destinationSpreadsheetId,
      range: 'A:Z',
    });
    const destinationData = destinationResponse.data.values || [];
    
    if (!destinationData || destinationData.length < 1) {
      return res.status(400).json({ message: 'Invalid destination spreadsheet data' });
    }
    
    const sourceHeaders = sourceData[0];
    const sourceRows = sourceData.slice(1);
    const destinationHeaders = destinationData[0];
    
    // Find items to relocate
    const itemsToRelocate = [];
    const rowsToDelete = [];
    const rowsToUpdate = [];
    const newRowsForDestination = [];
    const relocationEntries = [];

    for (const itemId of itemIds) {
      // Extract the actual row number from the item ID
      let actualRowNumber;
      if (itemId.startsWith('th_')) {
        actualRowNumber = parseInt(itemId.replace('th_', ''));
      } else if (itemId.startsWith('vkt_')) {
        actualRowNumber = parseInt(itemId.replace('vkt_', ''));
      } else {
        actualRowNumber = parseInt(itemId);
      }
      // Find the row in source data (row number is 1-indexed, array is 0-indexed)
      const rowIndex = actualRowNumber - 2; // -2 because sheet row 1 is header, sheet row 2 is index 0
      if (rowIndex >= 0 && rowIndex < sourceRows.length) {
        const rowData = [...sourceRows[rowIndex]];
        const quantityColIndex = sourceHeaders.findIndex(h => h.toLowerCase().includes('quantity') || h === 'Số lượng');
        const notesColIndex = sourceHeaders.findIndex(h => h === 'Ghi chú' || h.toLowerCase().includes('notes'));
        const warehouseHeaderIndex = sourceHeaders.findIndex(h => h === 'Tên Kho' || h.toLowerCase().includes('warehouse'));
        const availableQty = parseInt(rowData[quantityColIndex] || '0');
        const relocateQty = quantities && typeof quantities[itemId] === 'number' ? parseInt(quantities[itemId]) : availableQty;
        if (relocateQty > availableQty) continue; // skip invalid
        // Prepare new row for destination
        const newRow = [...rowData];
        newRow[quantityColIndex] = relocateQty.toString();
        if (warehouseHeaderIndex !== -1) newRow[warehouseHeaderIndex] = destinationLocation;
        if (notesColIndex !== -1 && notes) {
          const existingNotes = newRow[notesColIndex] || '';
          newRow[notesColIndex] = existingNotes ? `${existingNotes}; ${notes}` : notes;
        }
        newRowsForDestination.push(newRow);
        // Prepare change log entry
        relocationEntries.push({
          timestamp: Date.now(),
          userId: req.user.id,
          userEmail: req.user.email,
          action: 'RELOCATE',
          rowId: `${sourceLocation}_${actualRowNumber}`,
          oldValue: {
            warehouse: sourceLocation,
            location: sourceLocation,
            data: rowData,
            quantity: availableQty
          },
          newValue: {
            warehouse: destinationLocation,
            location: destinationLocation,
            quantity: relocateQty
          },
          changedFields: {
            warehouse: {
              old: sourceLocation,
              new: destinationLocation,
              fieldName: 'Warehouse'
            },
            quantity: {
              old: availableQty,
              new: availableQty - relocateQty,
              fieldName: 'Quantity'
            }
          },
          metadata: ['RELOCATION', sourceLocation, destinationLocation, notes || '', relocateQty.toString()]
        });
        if (relocateQty === availableQty) {
          // Full move: delete the row from source
          rowsToDelete.push(actualRowNumber);
        } else {
          // Partial move: update the source row's quantity
          const updatedRow = [...rowData];
          updatedRow[quantityColIndex] = (availableQty - relocateQty).toString();
          rowsToUpdate.push({ rowIndex, updatedRow });
        }
      }
    }
    if (newRowsForDestination.length === 0) {
      return res.status(404).json({ message: 'No items found to relocate' });
    }
    // Add new rows to destination sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: destinationSpreadsheetId,
      range: 'A:Z',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: newRowsForDestination
      }
    });
    // Update source rows for partial moves
    for (const { rowIndex, updatedRow } of rowsToUpdate) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sourceSpreadsheetId,
        range: `A${rowIndex + 2}:Z${rowIndex + 2}`,
        valueInputOption: 'RAW',
        resource: {
          values: [updatedRow]
        }
      });
    }
    // Delete rows from source sheet (delete from bottom to top to maintain row indices)
    rowsToDelete.sort((a, b) => b - a);
    if (rowsToDelete.length > 0) {
      const sourceSpreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: sourceSpreadsheetId
      });
      const sourceSheetId = sourceSpreadsheet.data.sheets[0].properties.sheetId;
      const deleteRequests = rowsToDelete.map(rowNumber => ({
        deleteDimension: {
          range: {
            sheetId: sourceSheetId,
            dimension: 'ROWS',
            startIndex: rowNumber - 1,
            endIndex: rowNumber
          }
        }
      }));
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sourceSpreadsheetId,
        resource: {
          requests: deleteRequests
        }
      });
    }
    // Log the relocation in change log
    const changeLog = await loadChangeLog();
    changeLog.push(...relocationEntries);
    await saveChangeLog(changeLog);
    // Broadcast inventory update
    broadcastInventoryUpdate('RELOCATE', {
      itemIds,
      sourceLocation,
      destinationLocation,
      itemCount: newRowsForDestination.length,
      changes: relocationEntries
    });
    // Broadcast recent changes
    const recentChanges = changeLog.slice(-5);
    broadcastRecentChanges(recentChanges);
    res.json({
      success: true,
      message: `Successfully relocated ${newRowsForDestination.length} item(s) from ${sourceLocation} to ${destinationLocation}`,
      relocatedItems: newRowsForDestination.length,
      sourceLocation,
      destinationLocation
    });
  } catch (error) {
    console.error('❌ Error relocating inventory items:', error);
    res.status(500).json({ 
      message: 'Failed to relocate items',
      error: error.message 
    });
  }
}); 