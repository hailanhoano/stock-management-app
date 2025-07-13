const jwt = require('jsonwebtoken');

// Test the delete functionality
async function testDelete() {
  // Generate a token for admin user
  const payload = {
    userId: '1',
    email: 'admin@example.com',
    role: 'admin'
  };
  
  const token = jwt.sign(payload, 'your-secret-key', { expiresIn: '24h' });
  console.log('Generated token:', token);
  
  // Test deleting an item (row 2)
  console.log('\n--- Testing DELETE ---');
  const deleteResponse = await fetch('http://localhost:3001/api/stock/inventory/2', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
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

testDelete().catch(console.error); 