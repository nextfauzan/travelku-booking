const mysql = require('mysql2/promise');
require('dotenv').config();

const databaseName = process.env.DB_NAME || 'travelku_booking';

const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

let pool;

function quoteDatabaseName(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('DB_NAME hanya boleh berisi huruf, angka, dan underscore.');
  }

  return `\`${name}\``;
}

async function initializeDatabase() {
  const connection = await mysql.createConnection(connectionConfig);

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteDatabaseName(databaseName)}
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci`
  );

  await connection.end();

  pool = mysql.createPool({
    ...connectionConfig,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      customer_name VARCHAR(100) NOT NULL,
      contact VARCHAR(100) NOT NULL,
      package_name VARCHAR(120) NOT NULL,
      departure_date DATE NOT NULL,
      participants INT UNSIGNED NOT NULL,
      price_per_person DECIMAL(12, 2) NOT NULL,
      status ENUM('Menunggu', 'Dikonfirmasi', 'Selesai', 'Dibatalkan') NOT NULL DEFAULT 'Menunggu',
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_bookings_status (status),
      INDEX idx_bookings_package_name (package_name),
      INDEX idx_bookings_departure_date (departure_date),
      INDEX idx_bookings_created_at (created_at)
    ) ENGINE=InnoDB
  `);

  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('Database belum diinisialisasi.');
  }

  return pool;
}

module.exports = {
  initializeDatabase,
  getPool
};
