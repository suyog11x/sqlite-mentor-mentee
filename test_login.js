const http = require('http');

function testLogin(email, password) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ email, password });
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`\n[${email}] Status: ${res.statusCode}`);
                console.log('Response:', data);
                resolve();
            });
        });
        req.on('error', e => { console.error('Error:', e.message); resolve(); });
        req.write(body);
        req.end();
    });
}

(async () => {
    await testLogin('admin@college.edu', 'admin123');
    await testLogin('mentor@college.edu', 'mentor123');
    await testLogin('mentee@college.edu', 'mentee123');
    await testLogin('admin@college.edu', 'wrongpass');
})();
