const express = require('express');
const path = require('path');
const { initializeDatabase, getPool } = require('./database');
const { bookingStatuses, canTransitionStatus } = require('./statusRules');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function getTodayDateString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasInputValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function parsePositiveInteger(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  const errors = {};

  if (!Number.isInteger(page) || page < 1) {
    errors.page = 'Page harus berupa angka minimal 1.';
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.limit = 'Limit harus berupa angka 1 sampai 100.';
  }

  return {
    errors,
    page: Object.keys(errors).length ? 1 : page,
    limit: Object.keys(errors).length ? 10 : limit,
    offset: Object.keys(errors).length ? 0 : (page - 1) * limit
  };
}

function validateBookingPayload(body) {
  const errors = {};
  const customerName = cleanText(body.customer_name);
  const contact = cleanText(body.contact);
  const packageId = hasInputValue(body.package_id) ? Number(body.package_id) : NaN;
  const departureDate = cleanText(body.departure_date);
  const participants = hasInputValue(body.participants) ? Number(body.participants) : NaN;
  const pricePerPerson = hasInputValue(body.price_per_person) ? Number(body.price_per_person) : NaN;
  const note = body.note === undefined || body.note === null ? null : cleanText(body.note);

  if (!customerName) {
    errors.customer_name = 'Nama pemesan wajib diisi.';
  }

  if (!contact) {
    errors.contact = 'Kontak wajib diisi.';
  }

  if (!hasInputValue(body.package_id)) {
    errors.package_id = 'Paket wisata wajib dipilih.';
  } else if (!Number.isInteger(packageId) || packageId < 1) {
    errors.package_id = 'Paket wisata tidak valid.';
  }

  if (!departureDate) {
    errors.departure_date = 'Tanggal keberangkatan wajib diisi.';
  } else if (!isValidDateString(departureDate)) {
    errors.departure_date = 'Format tanggal harus YYYY-MM-DD.';
  } else if (departureDate < getTodayDateString()) {
    errors.departure_date = 'Tanggal keberangkatan tidak boleh di masa lalu.';
  }

  if (!hasInputValue(body.participants)) {
    errors.participants = 'Jumlah peserta wajib diisi.';
  } else if (!Number.isInteger(participants) || participants < 1) {
    errors.participants = 'Jumlah peserta minimal 1.';
  }

  if (!hasInputValue(body.price_per_person)) {
    errors.price_per_person = 'Harga per orang wajib diisi.';
  } else if (!Number.isFinite(pricePerPerson) || pricePerPerson < 0) {
    errors.price_per_person = 'Harga per orang tidak boleh negatif.';
  }

  return {
    errors,
    data: {
      customer_name: customerName,
      contact,
      package_id: packageId,
      departure_date: departureDate,
      participants,
      price_per_person: pricePerPerson,
      note
    }
  };
}

function validateFilterQuery(query) {
  const errors = {};
  const filters = [];
  const values = [];
  const status = cleanText(query.status);
  const packageName = cleanText(query.package);
  const search = cleanText(query.search);
  const startDate = cleanText(query.startDate);
  const endDate = cleanText(query.endDate);

  if (status) {
    if (!bookingStatuses.includes(status)) {
      errors.status = 'Status filter tidak valid.';
    } else {
      filters.push('b.status = ?');
      values.push(status);
    }
  }

  if (packageName) {
    filters.push('(p.name LIKE ? OR b.package_name LIKE ?)');
    values.push(`%${packageName}%`, `%${packageName}%`);
  }

  if (search) {
    filters.push('(b.customer_name LIKE ? OR b.contact LIKE ?)');
    values.push(`%${search}%`, `%${search}%`);
  }

  if (startDate) {
    if (!isValidDateString(startDate)) {
      errors.startDate = 'Format startDate harus YYYY-MM-DD.';
    } else {
      filters.push('b.departure_date >= ?');
      values.push(startDate);
    }
  }

  if (endDate) {
    if (!isValidDateString(endDate)) {
      errors.endDate = 'Format endDate harus YYYY-MM-DD.';
    } else {
      filters.push('b.departure_date <= ?');
      values.push(endDate);
    }
  }

  if (startDate && endDate && isValidDateString(startDate) && isValidDateString(endDate) && startDate > endDate) {
    errors.dateRange = 'startDate tidak boleh lebih besar dari endDate.';
  }

  return { errors, filters, values };
}

function buildWhereClause(filters) {
  return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function mapBooking(row) {
  return {
    ...row,
    package_id: row.package_id === null ? null : Number(row.package_id),
    package_capacity: row.package_capacity === null ? null : Number(row.package_capacity),
    package_price_per_person: row.package_price_per_person === null ? null : Number(row.package_price_per_person),
    price_per_person: Number(row.price_per_person)
  };
}

function mapPackage(row) {
  return {
    ...row,
    capacity: Number(row.capacity),
    price_per_person: Number(row.price_per_person)
  };
}

function bookingSelectSql() {
  return `
    SELECT
      b.id,
      b.customer_name,
      b.contact,
      b.package_id,
      COALESCE(p.name, b.package_name) AS package_name,
      p.capacity AS package_capacity,
      p.price_per_person AS package_price_per_person,
      DATE_FORMAT(b.departure_date, '%Y-%m-%d') AS departure_date,
      b.participants,
      b.price_per_person,
      b.status,
      b.note,
      b.created_at,
      b.updated_at
    FROM bookings b
    LEFT JOIN packages p ON p.id = b.package_id
  `;
}

async function getPackageById(packageId) {
  const [rows] = await getPool().query(
    `SELECT id, name, capacity, price_per_person
     FROM packages
     WHERE id = ? AND is_active = 1`,
    [packageId]
  );

  return rows.length ? mapPackage(rows[0]) : null;
}

async function validatePackageCapacity(packageData, departureDate, participants, excludeBookingId = null) {
  const values = [packageData.id, departureDate];
  let excludeSql = '';

  if (excludeBookingId) {
    excludeSql = 'AND id <> ?';
    values.push(excludeBookingId);
  }

  const [rows] = await getPool().query(
    `SELECT COALESCE(SUM(participants), 0) AS used_capacity
     FROM bookings
     WHERE package_id = ?
       AND departure_date = ?
       AND status <> 'Dibatalkan'
       ${excludeSql}`,
    values
  );

  const usedCapacity = Number(rows[0].used_capacity);
  const remainingCapacity = packageData.capacity - usedCapacity;

  if (participants > remainingCapacity) {
    return `Kuota paket tersisa ${Math.max(remainingCapacity, 0)} peserta untuk tanggal tersebut.`;
  }

  return null;
}

function csvEscape(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function bookingsToCsv(bookings) {
  const headers = [
    'Nama Pemesan',
    'Kontak',
    'Paket Wisata',
    'Tanggal Keberangkatan',
    'Jumlah Peserta',
    'Harga Per Orang',
    'Status',
    'Catatan'
  ];

  const rows = bookings.map((booking) => [
    booking.customer_name,
    booking.contact,
    booking.package_name,
    booking.departure_date,
    booking.participants,
    booking.price_per_person,
    booking.status,
    booking.note || ''
  ]);

  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');
}

app.get('/api/packages', asyncHandler(async (req, res) => {
  const [rows] = await getPool().query(
    `SELECT id, name, capacity, price_per_person
     FROM packages
     WHERE is_active = 1
     ORDER BY name ASC`
  );

  return res.json(rows.map(mapPackage));
}));

app.get('/api/bookings', asyncHandler(async (req, res) => {
  const { errors, filters, values } = validateFilterQuery(req.query);
  const pagination = parsePagination(req.query);

  if (Object.keys(errors).length || Object.keys(pagination.errors).length) {
    return res.status(400).json({
      message: 'Filter tidak valid.',
      errors: { ...errors, ...pagination.errors }
    });
  }

  const whereClause = buildWhereClause(filters);
  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total
     FROM bookings b
     LEFT JOIN packages p ON p.id = b.package_id
     ${whereClause}`,
    values
  );
  const total = Number(countRows[0].total);

  const [rows] = await getPool().query(
    `${bookingSelectSql()}
     ${whereClause}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ? OFFSET ?`,
    [...values, pagination.limit, pagination.offset]
  );

  return res.json({
    data: rows.map(mapBooking),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(Math.ceil(total / pagination.limit), 1)
    }
  });
}));

app.get('/api/bookings/export', asyncHandler(async (req, res) => {
  const { errors, filters, values } = validateFilterQuery(req.query);

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Filter tidak valid.', errors });
  }

  const [rows] = await getPool().query(
    `${bookingSelectSql()}
     ${buildWhereClause(filters)}
     ORDER BY b.created_at DESC, b.id DESC`,
    values
  );
  const csv = bookingsToCsv(rows.map(mapBooking));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="travelku-bookings.csv"');
  return res.send(csv);
}));

app.get('/api/bookings/:id', asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'ID booking tidak valid.' });
  }

  const [rows] = await getPool().query(`${bookingSelectSql()} WHERE b.id = ?`, [id]);

  if (!rows.length) {
    return res.status(404).json({ message: 'Booking tidak ditemukan.' });
  }

  return res.json(mapBooking(rows[0]));
}));

app.post('/api/bookings', asyncHandler(async (req, res) => {
  const { errors, data } = validateBookingPayload(req.body);

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Data booking tidak valid.', errors });
  }

  const packageData = await getPackageById(data.package_id);

  if (!packageData) {
    return res.status(400).json({
      message: 'Data booking tidak valid.',
      errors: { package_id: 'Paket wisata tidak ditemukan atau tidak aktif.' }
    });
  }

  const capacityError = await validatePackageCapacity(
    packageData,
    data.departure_date,
    data.participants
  );

  if (capacityError) {
    return res.status(400).json({
      message: 'Data booking tidak valid.',
      errors: { participants: capacityError }
    });
  }

  const [result] = await getPool().query(
    `INSERT INTO bookings
      (customer_name, contact, package_id, package_name, departure_date, participants, price_per_person, status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Menunggu', ?)`,
    [
      data.customer_name,
      data.contact,
      data.package_id,
      packageData.name,
      data.departure_date,
      data.participants,
      data.price_per_person,
      data.note
    ]
  );

  const [rows] = await getPool().query(`${bookingSelectSql()} WHERE b.id = ?`, [result.insertId]);
  return res.status(201).json(mapBooking(rows[0]));
}));

app.put('/api/bookings/:id', asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'ID booking tidak valid.' });
  }

  const [existingRows] = await getPool().query('SELECT id, status FROM bookings WHERE id = ?', [id]);

  if (!existingRows.length) {
    return res.status(404).json({ message: 'Booking tidak ditemukan.' });
  }

  const { errors, data } = validateBookingPayload(req.body);

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Data booking tidak valid.', errors });
  }

  const packageData = await getPackageById(data.package_id);

  if (!packageData) {
    return res.status(400).json({
      message: 'Data booking tidak valid.',
      errors: { package_id: 'Paket wisata tidak ditemukan atau tidak aktif.' }
    });
  }

  if (existingRows[0].status !== 'Dibatalkan') {
    const capacityError = await validatePackageCapacity(
      packageData,
      data.departure_date,
      data.participants,
      id
    );

    if (capacityError) {
      return res.status(400).json({
        message: 'Data booking tidak valid.',
        errors: { participants: capacityError }
      });
    }
  }

  await getPool().query(
    `UPDATE bookings
     SET customer_name = ?,
         contact = ?,
         package_id = ?,
         package_name = ?,
         departure_date = ?,
         participants = ?,
         price_per_person = ?,
         note = ?
     WHERE id = ?`,
    [
      data.customer_name,
      data.contact,
      data.package_id,
      packageData.name,
      data.departure_date,
      data.participants,
      data.price_per_person,
      data.note,
      id
    ]
  );

  const [rows] = await getPool().query(`${bookingSelectSql()} WHERE b.id = ?`, [id]);
  return res.json(mapBooking(rows[0]));
}));

app.delete('/api/bookings/:id', asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'ID booking tidak valid.' });
  }

  const [result] = await getPool().query('DELETE FROM bookings WHERE id = ?', [id]);

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Booking tidak ditemukan.' });
  }

  return res.status(204).send();
}));

app.patch('/api/bookings/:id/status', asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  const nextStatus = cleanText(req.body.status);

  if (!id) {
    return res.status(400).json({ message: 'ID booking tidak valid.' });
  }

  if (!bookingStatuses.includes(nextStatus)) {
    return res.status(400).json({ message: 'Status tidak valid.' });
  }

  const [rows] = await getPool().query('SELECT status FROM bookings WHERE id = ?', [id]);

  if (!rows.length) {
    return res.status(404).json({ message: 'Booking tidak ditemukan.' });
  }

  const currentStatus = rows[0].status;

  if (!canTransitionStatus(currentStatus, nextStatus)) {
    return res.status(400).json({
      message: `Status tidak boleh diubah dari ${currentStatus} ke ${nextStatus}.`
    });
  }

  await getPool().query('UPDATE bookings SET status = ? WHERE id = ?', [nextStatus, id]);

  const [updatedRows] = await getPool().query(`${bookingSelectSql()} WHERE b.id = ?`, [id]);
  return res.json(mapBooking(updatedRows[0]));
}));

app.get('/api/summary', asyncHandler(async (req, res) => {
  const { errors, filters, values } = validateFilterQuery(req.query);

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Filter tidak valid.', errors });
  }

  const [rows] = await getPool().query(
    `SELECT
       COUNT(*) AS total_bookings,
       COALESCE(SUM(CASE WHEN b.status = 'Menunggu' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN b.status = 'Dikonfirmasi' THEN 1 ELSE 0 END), 0) AS confirmed,
       COALESCE(SUM(
         CASE
           WHEN b.status IN ('Dikonfirmasi', 'Selesai')
           THEN b.participants * b.price_per_person
           ELSE 0
         END
       ), 0) AS total_estimated_revenue
     FROM bookings b
     LEFT JOIN packages p ON p.id = b.package_id
     ${buildWhereClause(filters)}`,
    values
  );

  return res.json({
    total_bookings: Number(rows[0].total_bookings),
    pending: Number(rows[0].pending),
    confirmed: Number(rows[0].confirmed),
    total_estimated_revenue: Number(rows[0].total_estimated_revenue)
  });
}));

app.use((err, req, res, next) => {
  console.error(err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`TravelKu backend berjalan di http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Gagal menjalankan backend:', err);
    process.exit(1);
  });
