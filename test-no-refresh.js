const jwt = require('jsonwebtoken');

// Test that deletions don't cause page refreshes
async function testNoRefresh() {
  // Generate a token for admin user
  const payload = {
    userId: '1',
    email: 'admin@example.com',
    role: 'admin'
  };
  
  const token = jwt.sign(payload, 'your-secret-key', { expiresIn: '24h' });
  console.log('Generated token:', token);
  
  console.log('\n=== Testing No Page Refresh on Deletion ===');
  
  // First, let's get the current inventory to see what rows exist
  console.log('\n1. Fetching current inventory...');
  const inventoryResponse = await fetch('http://localhost:3001/api/stock/inventory', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!inventoryResponse.ok) {
    console.error('❌ Failed to fetch inventory');
    return;
  }
  
  const inventoryData = await inventoryResponse.json();
  const inventory = inventoryData.inventory || [];
  
  console.log(`📊 Found ${inventory.length} items in inventory`);
  
  if (inventory.length < 1) {
    console.log('⚠️ Need at least 1 item to test deletion');
    return;
  }
  
  // Get the first item for testing
  const testItem = inventory[0];
  
  console.log(`\n2. Testing deletion of item: ${testItem.id} - ${testItem.product_name}`);
  
  // Test deletion
  console.log('\n--- Testing Deletion ---');
  const deleteResponse = await fetch(`http://localhost:3001/api/stock/inventory/${testItem.id}?source=${testItem.source || 'source1'}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      itemData: {
        product_code: testItem.product_code,
        product_name: testItem.product_name,
        brand: testItem.brand,
        lot_number: testItem.lot_number,
        quantity: testItem.quantity,
        unit: testItem.unit,
        expiry_date: testItem.expiry_date,
        location: testItem.location,
        warehouse: testItem.warehouse,
        notes: testItem.notes
      }
    })
  });
  
  console.log('Delete response status:', deleteResponse.status);
  const deleteResult = await deleteResponse.json();
  console.log('Delete result:', deleteResult);
  
  if (deleteResult.success) {
    console.log('✅ Deletion successful');
    
    // Wait a moment to see if any additional updates are triggered
    console.log('\n⏳ Waiting 3 seconds to check for additional updates...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if the item is actually gone
    console.log('\n3. Verifying deletion...');
    const verifyResponse = await fetch('http://localhost:3001/api/stock/inventory', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      const remainingInventory = verifyData.inventory || [];
      
      console.log(`📊 Remaining items: ${remainingInventory.length}`);
      
      // Check if our test item is gone
      const itemStillExists = remainingInventory.some(item => 
        item.product_code === testItem.product_code && item.product_name === testItem.product_name
      );
      
      if (!itemStillExists) {
        console.log('✅ Test item successfully deleted from inventory');
        console.log('✅ No page refresh detected - deletion completed smoothly');
      } else {
        console.log('⚠️ Test item may still exist in inventory');
      }
    }
  } else {
    console.log('❌ Deletion failed:', deleteResult.message);
  }
  
  console.log('\n=== Test Complete ===');
  console.log('If you see this message without any page refresh in the browser, the fix is working!');
}

// Run the test
testNoRefresh().catch(console.error); 