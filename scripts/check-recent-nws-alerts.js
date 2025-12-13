// Check NWS API for alerts since Dec 10, 2025
const https = require('https');

const TARGET_STATES = ['LA', 'TX', 'TN', 'MS'];
const USER_AGENT = process.env.NWS_USER_AGENT || 'compliance-dashboard (test@example.com)';
const CUTOFF_DATE = new Date('2025-12-10T00:00:00Z');

async function fetchAlerts(state) {
  return new Promise((resolve, reject) => {
    const url = `https://api.weather.gov/alerts?status=actual&area=${state}`;
    
    https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/geo+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse JSON for ${state}: ${e.message}`));
        }
      });
    }).on('error', (e) => {
      reject(new Error(`Failed to fetch ${state}: ${e.message}`));
    });
  });
}

async function checkRecentAlerts() {
  console.log('Checking NWS API for alerts since Dec 10, 2025...\n');
  
  let totalAlerts = 0;
  let totalRecent = 0;
  let totalWithGeometry = 0;
  
  for (const state of TARGET_STATES) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`STATE: ${state}`);
      console.log('='.repeat(60));
      
      const data = await fetchAlerts(state);
      const alerts = data.features || [];
      
      const recentAlerts = alerts.filter(f => {
        const onset = f.properties?.onset || f.properties?.effective || f.properties?.sent;
        if (!onset) return false;
        const onsetDate = new Date(onset);
        return onsetDate >= CUTOFF_DATE;
      });
      
      const recentWithGeometry = recentAlerts.filter(f => f.geometry);
      
      totalAlerts += alerts.length;
      totalRecent += recentAlerts.length;
      totalWithGeometry += recentWithGeometry.length;
      
      console.log(`Total alerts: ${alerts.length}`);
      console.log(`Alerts since Dec 10: ${recentAlerts.length}`);
      console.log(`Recent alerts with geometry: ${recentWithGeometry.length}`);
      
      if (recentAlerts.length > 0) {
        console.log('\nRecent alerts (showing first 10):');
        recentAlerts.slice(0, 10).forEach((f, idx) => {
          const p = f.properties;
          const onset = p.onset || p.effective || p.sent;
          const ends = p.ends || p.expires;
          
          console.log(`\n  ${idx + 1}. ${p.event} (${p.severity || 'N/A'})`);
          console.log(`     ID: ${p.id || f.id}`);
          console.log(`     Onset: ${onset}`);
          console.log(`     Ends: ${ends}`);
          console.log(`     Area: ${p.areaDesc?.substring(0, 80) || 'N/A'}`);
          console.log(`     Has geometry: ${f.geometry ? 'YES' : 'NO'}`);
        });
      }
      
      // Wait 1 second between states to be nice to the API
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (error) {
      console.error(`Error processing ${state}:`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total alerts across all states: ${totalAlerts}`);
  console.log(`Total alerts since Dec 10, 2025: ${totalRecent}`);
  console.log(`Recent alerts with geometry: ${totalWithGeometry}`);
  console.log(`Recent alerts WITHOUT geometry: ${totalRecent - totalWithGeometry}`);
}

checkRecentAlerts().catch(console.error);

