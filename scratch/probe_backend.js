// Probe production backend
const https = require('https');

async function testEndpoint(options, postData) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', (err) => {
      resolve({ error: err.message });
    });
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  console.log('1. Probing GET /health...');
  const health = await testEndpoint({
    hostname: 'billmate-backend.onrender.com',
    path: '/health',
    method: 'GET'
  });
  console.log('Health status:', health.statusCode, health.body);

  console.log('\n2. Probing OPTIONS /api/auth/login with Origin: https://localhost...');
  const options = await testEndpoint({
    hostname: 'billmate-backend.onrender.com',
    path: '/api/auth/login',
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,Authorization'
    }
  });
  console.log('OPTIONS status:', options.statusCode);
  console.log('OPTIONS allow-origin:', options.headers['access-control-allow-origin']);
  console.log('OPTIONS allow-methods:', options.headers['access-control-allow-methods']);

  console.log('\n3. Probing POST /api/auth/login with Origin: https://localhost...');
  const postBody = JSON.stringify({ email: 'probe_test_check@example.com', password: 'probe_password_123' });
  const post = await testEndpoint({
    hostname: 'billmate-backend.onrender.com',
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Origin': 'https://localhost',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postBody)
    }
  }, postBody);
  console.log('POST status:', post.statusCode);
  console.log('POST allow-origin:', post.headers['access-control-allow-origin']);
  console.log('POST body:', post.body);

  console.log('\n4. Probing OPTIONS /api/auth/login with Origin: capacitor://localhost...');
  const capOptions = await testEndpoint({
    hostname: 'billmate-backend.onrender.com',
    path: '/api/auth/login',
    method: 'OPTIONS',
    headers: {
      'Origin': 'capacitor://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,Authorization'
    }
  });
  console.log('Capacitor OPTIONS status:', capOptions.statusCode);
  console.log('Capacitor allow-origin:', capOptions.headers['access-control-allow-origin']);
}

run();
