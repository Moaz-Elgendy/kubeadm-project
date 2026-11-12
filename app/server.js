const os = require('os');
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT || 3000);
const VERSION = process.env.APP_VERSION || 'dev';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'shopapp',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shopapp',
  connectionLimit: 5,
});

const SEED = [
  ['Aurora Hoodie', 59.0, 'Apparel', '#7c3aed'],
  ['Citrus Water Bottle', 24.5, 'Outdoor', '#f59e0b'],
  ['Lagoon Backpack', 89.99, 'Bags', '#0ea5e9'],
  ['Ember Desk Lamp', 42.0, 'Home', '#ef4444'],
  ['Moss Notebook', 12.75, 'Stationery', '#10b981'],
  ['Dusk Headphones', 129.0, 'Audio', '#ec4899'],
];

let dbReady = false;
let shuttingDown = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function initDb() {
  for (let attempt = 1; !shuttingDown; attempt++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(50) NOT NULL,
        color VARCHAR(7) NOT NULL
      )`);
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM products');
      if (n === 0) {
        await pool.query('INSERT INTO products (name, price, category, color) VALUES ?', [SEED]);
      }
      dbReady = true;
      console.log('database ready');
      return;
    } catch (err) {
      console.error(`database not ready (attempt ${attempt}): ${err.code || err.message}`);
      await sleep(Math.min(attempt * 1000, 5000));
    }
  }
}

const app = express();
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'database unavailable' });
  }
});

app.get('/api/products', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, price, category, color FROM products ORDER BY id');
    const products = rows.map((p) => ({ ...p, price: Number(p.price) }));
    res.json({ pod: os.hostname(), version: VERSION, products });
  } catch (err) {
    console.error(err.message);
    res.status(503).json({ error: 'database unavailable' });
  }
});

const server = app.listen(PORT, () => console.log(`shopapp ${VERSION} listening on ${PORT}`));
initDb();

function shutdown(sig) {
  console.log(`${sig} received, shutting down`);
  shuttingDown = true;
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
