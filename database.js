const mysql = require('mysql2/promise');
require('dotenv').config();

const databaseName = process.env.DB_NAME || 'travelku_booking';

const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

const defaultPackages = [
  ['Bali 4D3N', 30, 2500000],
  ['Lombok 3D2N', 24, 1800000],
  ['Yogyakarta 2D1N', 35, 1200000],
  ['Labuan Bajo 4D3N', 18, 4500000],
  ['Raja Ampat 5D4N', 12, 7800000]
];

let pool;

function quoteDatabaseName(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('DB_NAME hanya boleh berisi huruf, angka, dan underscore.');
  }

  return `\`${name}\``;
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [databaseName, tableName, columnName]
  );

  return Number(rows[0].total) > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [databaseName, tableName, indexName]
  );

  return Number(rows[0].total) > 0;
}

async function foreignKeyExists(tableName, constraintName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ?
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [databaseName, tableName, constraintName]
  );

  return Number(rows[0].total) > 0;
}

async function ensurePackagesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS packages (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      capacity INT UNSIGNED NOT NULL,
      price_per_person DECIMAL(12, 2) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_packages_name (name),
      INDEX idx_packages_active (is_active)
    ) ENGINE=InnoDB
  `);

  await pool.query(
    `INSERT INTO packages (name, capacity, price_per_person)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       capacity = VALUES(capacity),
       price_per_person = VALUES(price_per_person),
       is_active = 1`,
     [defaultPackages]
  );

  await pool.query(
    `UPDATE packages
     SET is_active = 0
     WHERE name NOT IN (?)`,
    [defaultPackages.map(([name]) => name)]
  );
}

async function ensureBookingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      customer_name VARCHAR(100) NOT NULL,
      contact VARCHAR(100) NOT NULL,
      package_id INT UNSIGNED NULL,
      package_name VARCHAR(120) NOT NULL,
      departure_date DATE NOT NULL,
      participants INT UNSIGNED NOT NULL,
      price_per_person DECIMAL(12, 2) NOT NULL,
      status ENUM('Menunggu', 'Dikonfirmasi', 'Selesai', 'Dibatalkan') NOT NULL DEFAULT 'Menunggu',
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_bookings_package_id (package_id),
      INDEX idx_bookings_status (status),
      INDEX idx_bookings_package_name (package_name),
      INDEX idx_bookings_departure_date (departure_date),
      INDEX idx_bookings_created_at (created_at),
      CONSTRAINT fk_bookings_package
        FOREIGN KEY (package_id) REFERENCES packages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    ) ENGINE=InnoDB
  `);

  if (!(await columnExists('bookings', 'package_id'))) {
    await pool.query('ALTER TABLE bookings ADD COLUMN package_id INT UNSIGNED NULL AFTER contact');
  }

  if (!(await indexExists('bookings', 'idx_bookings_package_id'))) {
    await pool.query('ALTER TABLE bookings ADD INDEX idx_bookings_package_id (package_id)');
  }

  await pool.query(`
    UPDATE bookings b
    INNER JOIN packages p ON p.name = b.package_name
    SET b.package_id = p.id
    WHERE b.package_id IS NULL
  `);

  if (!(await foreignKeyExists('bookings', 'fk_bookings_package'))) {
    await pool.query(`
      ALTER TABLE bookings
      ADD CONSTRAINT fk_bookings_package
        FOREIGN KEY (package_id) REFERENCES packages(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    `);
  }
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

  await ensurePackagesTable();
  await ensureBookingsTable();

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
