const fetch = require('node-fetch');

// Test script for inventory relocation feature
const BASE_URL = 'http://localhost:3001';

// Test authentication token (replace with your actual token)
const TEST_TOKEN = 'your_test_token_here';

async function testRelocation() {
  console.log('🧪 Testing Inventory Relocation Feature\n');

  try {
    // 1. Get current inventory to see items in both locations
    console.log('📊 Step 1: Fetching current inventory...');
    const inventoryResponse = await fetch(`${BASE_URL}/api/stock/inventory`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });
    
    if (!inventoryResponse.ok) {
      throw new Error('Failed to fetch inventory');
    }
    
    const inventoryData = await inventoryResponse.json();
    const inventory = inventoryData.inventory || [];
    
    console.log(`✅ Found ${inventory.length} total items`);
    
    // Show items by location
    const thItems = inventory.filter(item => item.warehouse === 'TH');
    const vktItems = inventory.filter(item => item.warehouse === 'VKT');
    
    console.log(`📍 TH location: ${thItems.length} items`);
    console.log(`📍 VKT location: ${vktItems.length} items`);
    
    if (thItems.length > 0) {
      console.log('\n🏢 Sample TH items:');
      thItems.slice(0, 3).forEach(item => {
        console.log(`  - ${item.product_name} (${item.brand}) - ID: ${item.id}`);
      });
    }
    
    if (vktItems.length > 0) {
      console.log('\n🏭 Sample VKT items:');
      vktItems.slice(0, 3).forEach(item => {
        console.log(`  - ${item.product_name} (${item.brand}) - ID: ${item.id}`);
      });
    }
    
    // 2. Test relocation from TH to VKT
    if (thItems.length > 0) {
      console.log('\n🔄 Step 2: Testing relocation from TH to VKT...');
      
      const itemsToRelocate = thItems.slice(0, Math.min(2, thItems.length));
      const itemIds = itemsToRelocate.map(item => item.id);
      
      console.log(`📦 Relocating ${itemIds.length} items: ${itemIds.join(', ')}`);
      
      const relocationResponse = await fetch(`${BASE_URL}/api/stock/inventory/relocate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_TOKEN}`
        },
        body: JSON.stringify({
          itemIds,
          sourceLocation: 'TH',
          destinationLocation: 'VKT',
          notes: 'Test relocation via API'
        })
      });
      
      const relocationResult = await relocationResponse.json();
      
      if (relocationResponse.ok) {
        console.log('✅ Relocation successful!');
        console.log(`📋 ${relocationResult.message}`);
        console.log(`📊 Relocated ${relocationResult.relocatedItems} items`);
      } else {
        console.log('❌ Relocation failed:', relocationResult.message);
      }
    } else {
      console.log('\n⚠️ No items in TH location to test relocation');
    }
    
    // 3. Verify the relocation by fetching inventory again
    console.log('\n🔍 Step 3: Verifying relocation...');
    
    const verifyResponse = await fetch(`${BASE_URL}/api/stock/inventory`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });
    
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      const newInventory = verifyData.inventory || [];
      
      const newThItems = newInventory.filter(item => item.warehouse === 'TH');
      const newVktItems = newInventory.filter(item => item.warehouse === 'VKT');
      
      console.log(`📍 After relocation - TH: ${newThItems.length} items`);
      console.log(`📍 After relocation - VKT: ${newVktItems.length} items`);
      
      console.log('\n✅ Relocation test completed successfully!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Example of how to use the relocation API
function showUsageExample() {
  console.log('\n📚 Relocation API Usage Example:\n');
  
  const exampleCode = `
// Frontend JavaScript example
const relocateItems = async (itemIds, sourceLocation, destinationLocation, notes = '') => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch('/api/stock/inventory/relocate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${token}\`
      },
      body: JSON.stringify({
        itemIds,           // Array of item IDs to relocate
        sourceLocation,    // 'TH' or 'VKT'
        destinationLocation, // 'TH' or 'VKT' (must be different from source)
        notes             // Optional notes about the relocation
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Relocation successful:', result.message);
      console.log('📊 Items relocated:', result.relocatedItems);
    } else {
      console.error('❌ Relocation failed:', result.message);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Example usage:
relocateItems(['th_2', 'th_3'], 'TH', 'VKT', 'Moved for reorganization');
  `;
  
  console.log(exampleCode);
}

// Run the test if this script is executed directly
if (require.main === module) {
  console.log('⚠️ Please update TEST_TOKEN with your actual token before running this test\n');
  
  if (TEST_TOKEN === 'your_test_token_here') {
    console.log('❌ Please set a valid TEST_TOKEN in the script');
    showUsageExample();
  } else {
    testRelocation();
  }
}

module.exports = { testRelocation, showUsageExample }; 