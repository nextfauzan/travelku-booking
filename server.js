const express = require('express');
const path = require('path');
const { initializeDatabase, getPool } = require('./database');

const app = express();
const port = Number(process.env.PORT || 3000);

const bookingStatuses = ['Menunggu', 'Dikonfirmasi', 'Selesai', 'Dibatalkan'];
const allowedTransitions = {
  Menunggu: ['Dikonfirmasi', 'Dibatalkan'],
  Dikonfirmasi: ['Selesai', 'Dibatalkan'],
  Selesai: [],
  Dibatalkan: []
};

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

function parseBookingId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateBookingPayload(body) {
  const errors = {};
  const customerName = cleanText(body.customer_name);
  const contact = cleanText(body.contact);
  const packageName = cleanText(body.package_name);
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

  if (!packageName) {
    errors.package_name = 'Paket wisata wajib diisi.';
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
      package_name: packageName,
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
  const startDate = cleanText(query.startDate);
  const endDate = cleanText(query.endDate);

  if (status) {
    if (!bookingStatuses.includes(status)) {
      errors.status = 'Status filter tidak valid.';
    } else {
      filters.push('status = ?');
      values.push(status);
    }
  }

  if (packageName) {
    filters.push('package_name LIKE ?');
    values.push(`%${packageName}%`);
  }

  if (startDate) {
    if (!isValidDateString(startDate)) {
      errors.startDate = 'Format startDate harus YYYY-MM-DD.';
    } else {
      filters.push('departure_date >= ?');
      values.push(startDate);
    }
  }

  if (endDate) {
    if (!isValidDateString(endDate)) {
      errors.endDate = 'Format endDate harus YYYY-MM-DD.';
    } else {
      filters.push('departure_date <= ?');
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
    price_per_person: Number(row.price_per_person)
  };
}

function bookingSelectSql() {
  return `
    SELECT
      id,
      customer_name,
      contact,
      package_name,
      DATE_FORMAT(departure_date, '%Y-%m-%d') AS departure_date,
      participants,
      price_per_person,
      status,
      note,
      created_at,
      updated_at
    FROM bookings
  `;
}

app.get('/api/bookings', asyncHandler(async (req, res) => {
  const { errors, filters, values } = validateFilterQuery(req.query);

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Filter tidak valid.', errors });
  }

  const [rows] = await getPool().query(
    `${bookingSelectSql()} ${buildWhereClause(filters)} ORDER BY created_at DESC, id DESC`,
    values
  );

  return res.json(rows.map(mapBooking));
}));

app.get('/api/bookings/:id', asyncHandler(async (req, res) => {
  const id = parseBookingId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'ID booking tidak valid.' });
  }

  const [rows] = await getPool().query(`${bookingSelectSql()} WHERE id = ?`, [id]);

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

  const [result] = await getPool().query(
    `INSERT INTO bookings
      (customer_name, contact, package_name, departure_date, participants, price_per_person, status, note)
     VALUES (?, ?, ?, ?, ?, ?, 'Menunggu', ?)`,
    [
      data.customer_name,
      data.contact,
      data.package_name,
      data.departure_date,
      data.participants,
      data.price_per_person,
      data.note
    ]
  );

  const [rows] = await getPool().query(`${bookingSelectSql()} WHERE id = ?`, [result.insertId]);
  return res.status(201).json(mapBooking(rows[0]));
}));

app.put('/api/bookings/:id', asyncHandler(async (req, res) => {
  const id = parseBookingId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'ID booking tidak valid.' });
  }

  const { errors, data } = validateBookingPayload(req.body);

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Data booking tidak valid.', errors });
  }

  const [result] = await getPool().query(
    `UPDATE bookings
     SET customer_name = ?,
         contact = ?,
         package_name = ?,
         departure_date = ?,
         participants = ?,
         price_per_person = ?,
         note = ?
     WHERE id = ?`,
    [
      data.customer_name,
      data.contact,
      data.package_name,
      data.departure_date,
      data.participants,
      data.price_per_person,
      data.note,
      id
    ]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Booking tidak ditemukan.' });
  }

  const [rows] = await getPool().query(`${bookingSelectSql()} WHERE id = ?`, [id]);
  return res.json(mapBooking(rows[0]));
}));

app.delete('/api/bookings/:id', asyncHandler(async (req, res) => {
  const id = parseBookingId(req.params.id);

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
  const id = parseBookingId(req.params.id);
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

  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    return res.status(400).json({
      message: `Status tidak boleh diubah dari ${currentStatus} ke ${nextStatus}.`
    });
  }

  await getPool().query('UPDATE bookings SET status = ? WHERE id = ?', [nextStatus, id]);

  const [updatedRows] = await getPool().query(`${bookingSelectSql()} WHERE id = ?`, [id]);
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
       COALESCE(SUM(
         CASE
           WHEN status IN ('Dikonfirmasi', 'Selesai')
           THEN participants * price_per_person
           ELSE 0
         END
       ), 0) AS total_estimated_revenue
     FROM bookings
     ${buildWhereClause(filters)}`,
    values
  );

  return res.json({
    total_bookings: Number(rows[0].total_bookings),
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
