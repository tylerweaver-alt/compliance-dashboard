// Test the cron endpoint manually
const https = require('https');

const CRON_SECRET = '5a3141dc-a308-4cb1-9129-ebdacb52fa33';
const PRODUCTION_URL = 'https://acadian.cadalytix.com/api/cron/fetch-weather';

console.log('Testing cron endpoint...\n');
console.log(`URL: ${PRODUCTION_URL}`);
console.log(`Using CRON_SECRET: ${CRON_SECRET.substring(0, 8)}...`);
console.log('\nSending request...\n');

const url = new URL(PRODUCTION_URL);

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${CRON_SECRET}`
  }
};

const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log(`Headers:`, JSON.stringify(res.headers, null, 2));
  console.log('\nResponse Body:');
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();

