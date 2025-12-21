
const argon2 = require('argon2');

async function test() {
    console.log('Testing Argon2...');
    try {
        const hash = await argon2.hash('password123');
        console.log('Hash:', hash);
        const valid = await argon2.verify(hash, 'password123');
        console.log('Valid:', valid);
    } catch (e) {
        console.error('Argon2 failed:', e);
        process.exit(1);
    }
}

test();
