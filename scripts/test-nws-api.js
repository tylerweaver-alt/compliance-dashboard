/**
 * Test the NWS API directly to see what data is available
 */

require('dotenv').config({ path: '.env.local' });

const USER_AGENT = process.env.NWS_USER_AGENT || "compliance-dashboard (contact@example.com)";

async function testNWSAPI() {
  console.log('=== Testing NWS API ===\n');
  console.log(`User-Agent: ${USER_AGENT}\n`);
  
  // Test 1: Get active alerts for Louisiana
  console.log('1. Testing active alerts for Louisiana:');
  try {
    const url = 'https://api.weather.gov/alerts?status=actual&area=LA&limit=10';
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/geo+json'
      }
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   Features returned: ${data.features?.length || 0}`);
      
      if (data.features && data.features.length > 0) {
        console.log('\n   Sample alerts:');
        data.features.slice(0, 3).forEach((feature, i) => {
          const p = feature.properties;
          console.log(`   ${i + 1}. ${p.event} (${p.severity})`);
          console.log(`      Area: ${p.areaDesc?.substring(0, 60)}`);
          console.log(`      Onset: ${p.onset || p.effective}`);
          console.log(`      Ends: ${p.ends || p.expires}`);
          console.log(`      Has geometry: ${!!feature.geometry}`);
        });
      } else {
        console.log('   No active alerts found for Louisiana');
      }
    } else {
      const text = await response.text();
      console.log(`   Error: ${text.substring(0, 200)}`);
    }
  } catch (error) {
    console.error(`   Error: ${error.message}`);
  }
  
  console.log('\n2. Testing historical alerts (last 7 days):');
  try {
    const url = 'https://api.weather.gov/alerts?area=LA&limit=10';
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/geo+json'
      }
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   Features returned: ${data.features?.length || 0}`);
      
      if (data.features && data.features.length > 0) {
        console.log('\n   Sample historical alerts:');
        data.features.slice(0, 3).forEach((feature, i) => {
          const p = feature.properties;
          console.log(`   ${i + 1}. ${p.event} (${p.severity})`);
          console.log(`      Area: ${p.areaDesc?.substring(0, 60)}`);
          console.log(`      Onset: ${p.onset || p.effective}`);
          console.log(`      Has geometry: ${!!feature.geometry}`);
        });
      }
    }
  } catch (error) {
    console.error(`   Error: ${error.message}`);
  }
  
  console.log('\n3. Testing with specific date range (Oct 1-7, 2024):');
  try {
    const start = '2024-10-01T00:00:00Z';
    const end = '2024-10-07T23:59:59Z';
    const url = `https://api.weather.gov/alerts?start=${start}&end=${end}&area=LA&limit=10`;
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/geo+json'
      }
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   Features returned: ${data.features?.length || 0}`);
      
      if (data.features && data.features.length > 0) {
        console.log('\n   Alerts from Oct 1-7, 2024:');
        data.features.forEach((feature, i) => {
          const p = feature.properties;
          console.log(`   ${i + 1}. ${p.event} (${p.severity})`);
          console.log(`      Area: ${p.areaDesc?.substring(0, 60)}`);
          console.log(`      Has geometry: ${!!feature.geometry}`);
        });
      } else {
        console.log('   No alerts found for Oct 1-7, 2024 in Louisiana');
      }
    } else {
      const text = await response.text();
      console.log(`   Error: ${text.substring(0, 200)}`);
    }
  } catch (error) {
    console.error(`   Error: ${error.message}`);
  }
  
  console.log('\n=== Test Complete ===');
}

testNWSAPI().catch(console.error);

