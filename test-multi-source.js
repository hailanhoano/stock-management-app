const fetch = require('node-fetch');

async function testMultiSourceInventory() {
  try {
    console.log('🧪 Testing multi-source inventory system...');
    
    // Test fetching combined inventory
    const response = await fetch('http://localhost:3001/api/stock/inventory', {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Successfully fetched combined inventory');
      console.log(`📊 Total items: ${data.inventory.length}`);
      
      // Count items by source
      const source1Count = data.inventory.filter(item => item.source === 'source1').length;
      const source2Count = data.inventory.filter(item => item.source === 'source2').length;
      
      console.log(`📦 Source 1 (Main): ${source1Count} items`);
      console.log(`📦 Source 2 (Secondary): ${source2Count} items`);
      
      // Show first few items from each source
      const source1Items = data.inventory.filter(item => item.source === 'source1').slice(0, 3);
      const source2Items = data.inventory.filter(item => item.source === 'source2').slice(0, 3);
      
      console.log('\n📋 Sample items from Source 1:');
      source1Items.forEach(item => {
        console.log(`  - ${item.product_name} (${item.product_code}) - Source: ${item.source}`);
      });
      
      console.log('\n📋 Sample items from Source 2:');
      source2Items.forEach(item => {
        console.log(`  - ${item.product_name} (${item.product_code}) - Source: ${item.source}`);
      });
      
    } else {
      console.error('❌ Failed to fetch inventory:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('❌ Error testing multi-source inventory:', error.message);
  }
}

testMultiSourceInventory(); 