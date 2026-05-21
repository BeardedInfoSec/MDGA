const mysql = require('mysql2/promise');
require('dotenv').config();

// `timezone: 'Z'` tells mysql2 to (de)serialize DATE/DATETIME/TIMESTAMP
// values as UTC. We additionally `SET time_zone = '+00:00'` on every new
// connection so the MySQL session matches. Without this, TIMESTAMP columns
// shift by the server's OS UTC offset whenever we pass a pre-formatted UTC
// string (e.g. Luxon's .toUTC().toFormat(...) used for forum/event
// publish_at), and reads through DATE_FORMAT(...) come back in the server
// local zone too. Locking both ends to UTC keeps wall-clock intent intact
// regardless of where the host machine is running.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
});

pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

pool.getConnection()
  .then(conn => {
    console.log('MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('MySQL connection failed:', err.message);
  });

module.exports = pool;
