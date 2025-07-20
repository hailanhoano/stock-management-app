const jwt = require('jsonwebtoken');

// Test consecutive deletions to verify the bug is fixed
async function testConsecutiveDeletions() {
  // Generate a token for admin user
  const payload = {
    userId: '1',
    email: 'admin@example.com',
    role: 'admin'
  };
  
  const token = jwt.sign(payload, 'your-secret-key', { expiresIn: '24h' });
  console.log('Generated token:', token);
  
  console.log('\n=== Testing Consecutive Deletions ===');
  
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
  
  if (inventory.length < 2) {
    console.log('⚠️ Need at least 2 items to test consecutive deletions');
    return;
  }
  
  // Get the first two items for testing
  const item1 = inventory[0];
  const item2 = inventory[1];
  
  console.log(`\n2. Testing deletion of item 1: ${item1.id} - ${item1.product_name}`);
  console.log(`3. Will then test deletion of item 2: ${item2.id} - ${item2.product_name}`);
  
  // Test first deletion
  console.log('\n--- First Deletion ---');
  const delete1Response = await fetch(`http://localhost:3001/api/stock/inventory/${item1.id}?source=${item1.source || 'source1'}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      itemData: {
        product_code: item1.product_code,
        product_name: item1.product_name,
        brand: item1.brand,
        lot_number: item1.lot_number,
        quantity: item1.quantity,
        unit: item1.unit,
        expiry_date: item1.expiry_date,
        location: item1.location,
        warehouse: item1.warehouse,
        notes: item1.notes
      }
    })
  });
  
  console.log('Delete 1 response status:', delete1Response.status);
  const delete1Result = await delete1Response.json();
  console.log('Delete 1 result:', delete1Result);
  
  if (delete1Result.success) {
    console.log('✅ First deletion successful');
  } else {
    console.log('❌ First deletion failed:', delete1Result.message);
    return;
  }
  
  // Wait a moment for the deletion to process
  console.log('\n⏳ Waiting 3 seconds for deletion to process...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test second deletion (this is where the bug was occurring)
  console.log('\n--- Second Deletion ---');
  const delete2Response = await fetch(`http://localhost:3001/api/stock/inventory/${item2.id}?source=${item2.source || 'source1'}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      itemData: {
        product_code: item2.product_code,
        product_name: item2.product_name,
        brand: item2.brand,
        lot_number: item2.lot_number,
        quantity: item2.quantity,
        unit: item2.unit,
        expiry_date: item2.expiry_date,
        location: item2.location,
        warehouse: item2.warehouse,
        notes: item2.notes
      }
    })
  });
  
  console.log('Delete 2 response status:', delete2Response.status);
  const delete2Result = await delete2Response.json();
  console.log('Delete 2 result:', delete2Result);
  
  if (delete2Result.success) {
    console.log('✅ Second deletion successful - BUG IS FIXED!');
  } else {
    console.log('❌ Second deletion failed:', delete2Result.message);
    console.log('⚠️ This might indicate the bug still exists');
  }
  
  // Verify the deletions by fetching inventory again
  console.log('\n4. Verifying deletions...');
  const verifyResponse = await fetch('http://localhost:3001/api/stock/inventory', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (verifyResponse.ok) {
    const verifyData = await verifyResponse.json();
    const remainingInventory = verifyData.inventory || [];
    
    console.log(`📊 Remaining items: ${remainingInventory.length}`);
    
    // Check if our test items are gone
    const item1StillExists = remainingInventory.some(item => 
      item.product_code === item1.product_code && item.product_name === item1.product_name
    );
    const item2StillExists = remainingInventory.some(item => 
      item.product_code === item2.product_code && item.product_name === item2.product_name
    );
    
    if (!item1StillExists && !item2StillExists) {
      console.log('✅ Both test items successfully deleted from inventory');
    } else {
      console.log('⚠️ Some test items may still exist in inventory');
      if (item1StillExists) console.log('   - Item 1 still exists');
      if (item2StillExists) console.log('   - Item 2 still exists');
    }
  }
  
  console.log('\n=== Test Complete ===');
}

// Run the test
testConsecutiveDeletions().catch(console.error); 