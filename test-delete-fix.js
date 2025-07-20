const jwt = require('jsonwebtoken');

// Test the improved delete functionality
async function testDeleteFix() {
  // Generate a token for admin user
  const payload = {
    userId: '1',
    email: 'admin@example.com',
    role: 'admin'
  };
  
  const token = jwt.sign(payload, 'your-secret-key', { expiresIn: '24h' });
  console.log('Generated token:', token);
  
  // Test deleting an item with item data
  console.log('\n--- Testing DELETE with item data ---');
  const deleteResponse = await fetch('http://localhost:3001/api/stock/inventory/2?source=source1', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      itemData: {
        product_code: 'TEST001',
        product_name: 'Test Product',
        brand: 'Test Brand',
        quantity: '10',
        unit: 'pcs'
      }
    })
  });
  
  console.log('Delete response status:', deleteResponse.status);
  const deleteResult = await deleteResponse.json();
  console.log('Delete result:', deleteResult);
  
  if (deleteResult.success) {
    console.log('✅ Delete operation successful');
  } else {
    console.log('❌ Delete operation failed:', deleteResult.message);
  }
}

// Run the test
testDeleteFix().catch(console.error); 