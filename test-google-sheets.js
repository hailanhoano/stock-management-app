const { google } = require('googleapis');

// Test Google Sheets access
async function testGoogleSheets() {
  try {
    console.log('🧪 Testing Google Sheets access...');
    
    // Create auth
    let auth;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('/')) {
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
    } else {
      auth = new google.auth.GoogleAuth({
        keyFile: './credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
    }
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Test with your spreadsheet ID
    const spreadsheetId = '1iQsQDnRrgP5LLhuimLny8doi6AEEgH-OibFnHRlCgPU';
    
    console.log('📊 Testing access to spreadsheet:', spreadsheetId);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'A:Z',
    });
    
    console.log('✅ Success! Found', response.data.values?.length || 0, 'rows');
    console.log('📋 Headers:', response.data.values?.[0] || []);
    
  } catch (error) {
    console.error('❌ Error testing Google Sheets:', error.message);
    console.error('🔍 Full error:', error);
  }
}

testGoogleSheets(); 