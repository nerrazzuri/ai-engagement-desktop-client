
const http = require('http');

const data = JSON.stringify({
    platform: "test",
    video: { video_id: "dev_vid", author: { id: "dev_auth" } },
    comment: { comment_id: "dev_cmt", text: "hello", author_id: "dev_user" }
});

const options = {
    hostname: 'localhost',
    port: 3005,
    path: '/events',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'x-install-id': 'install_dev_interactive'
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    process.exit(1);
});

req.write(data);
req.end();
