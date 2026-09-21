const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    console.error('❌ Unexpected DB pool error:', err.message);
});

// separate test function
const testConnection = async () => {
    try {
        const res = await pool.query('SELECT NOW()');
        console.log('✅ DB Connected at:', res.rows[0].now);
    } catch (err) {
        console.error('❌ DB Connection Failed:', err.message);
    }
};

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    testConnection
};