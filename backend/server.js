const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = 3000;

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PUBLIC_DIR = path.join(ROOT_DIR, 'frontend');

app.use(express.json());

// Request log for local debugging: method, URL, status, and response time.
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      `${new Date().toISOString()} | ${req.method} ${req.originalUrl} | ${res.statusCode} | ${durationMs}ms`
    );
  });

  next();
});

app.use(express.static(PUBLIC_DIR));

function isMonthKey(key) {
  return /^\d{4}-\d{2}$/.test(key);
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function monthFromDate(dateStr) {
  return dateStr.slice(0, 7);
}

function defaultData() {
  return { rate: 55, months: {} };
}

function normalizeMonthBucket(value) {
  if (Array.isArray(value)) {
    return { entries: value, status: 'pending' };
  }

  if (typeof value !== 'object' || value === null) {
    return { entries: [], status: 'pending' };
  }

  const entries = Array.isArray(value.entries) ? value.entries : [];
  const status = value.status === 'paid' ? 'paid' : 'pending';

  return { entries, status };
}

function normalizeDataShape(parsed) {
  const normalized = {
    rate: Number.isFinite(Number(parsed.rate)) ? Number(parsed.rate) : 55,
    months: {}
  };

  if (typeof parsed.months === 'object' && parsed.months !== null && !Array.isArray(parsed.months)) {
    for (const [monthKey, value] of Object.entries(parsed.months)) {
      if (!isMonthKey(monthKey)) {
        continue;
      }

      normalized.months[monthKey] = normalizeMonthBucket(value);
    }
  }

  // Backward compatibility: migrate old top-level month arrays/objects.
  for (const [key, value] of Object.entries(parsed)) {
    if (!isMonthKey(key)) {
      continue;
    }

    normalized.months[key] = normalizeMonthBucket(value);
  }

  return normalized;
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultData(), null, 2), 'utf8');
  }
}

async function readData() {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Invalid data structure.');
    }

    const normalized = normalizeDataShape(parsed);

    // Persist normalized structure so subsequent reads are consistent.
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await writeData(normalized);
    }

    return normalized;
  } catch (error) {
    if (error.name === 'SyntaxError' || error.message.includes('Invalid data structure')) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(DATA_DIR, `data.corrupt-${timestamp}.json`);

      try {
        await fs.copyFile(DATA_FILE, backupPath);
      } catch {
        // Continue with reset when backup cannot be created.
      }

      const reset = defaultData();
      await writeData(reset);
      return reset;
    }

    throw error;
  }
}

async function writeData(data) {
  await ensureDataFile();
  const tempPath = `${DATA_FILE}.tmp`;
  const serialized = JSON.stringify(data, null, 2);

  await fs.writeFile(tempPath, serialized, 'utf8');
  await fs.rename(tempPath, DATA_FILE);
}

function calculateMonthSummary(data, monthKey) {
  const monthBucket = data.months[monthKey] || { entries: [], status: 'pending' };
  const entries = Array.isArray(monthBucket.entries) ? [...monthBucket.entries] : [];
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const totalMilk = entries.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalCost = totalMilk * Number(data.rate || 0);

  return {
    month: monthKey,
    rate: Number(data.rate || 0),
    status: monthBucket.status === 'paid' ? 'paid' : 'pending',
    totalMilk,
    totalCost,
    entries
  };
}

app.get('/api/state', async (_req, res) => {
  try {
    const data = await readData();
    const months = Object.keys(data.months)
      .sort((a, b) => b.localeCompare(a));

    res.json({
      rate: Number(data.rate || 0),
      months,
      today: todayISODate()
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not read saved data.' });
  }
});

app.post('/api/rate', async (req, res) => {
  const nextRate = Number(req.body?.rate);

  if (!Number.isFinite(nextRate) || nextRate <= 0) {
    return res.status(400).json({ message: 'Rate must be a number greater than 0.' });
  }

  try {
    const data = await readData();
    data.rate = nextRate;
    await writeData(data);

    return res.json({ message: 'Rate saved.', rate: data.rate });
  } catch (error) {
    return res.status(500).json({ message: 'Could not save rate.' });
  }
});

app.post('/api/entry', async (req, res) => {
  const delivered = Boolean(req.body?.delivered);
  let quantity = Number(req.body?.quantity);

  if (!delivered) {
    quantity = 0;
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    return res.status(400).json({ message: 'Quantity must be a number 0 or more.' });
  }

  const date = todayISODate();
  const monthKey = monthFromDate(date);

  try {
    const data = await readData();
    if (!data.months[monthKey]) {
      data.months[monthKey] = { entries: [], status: 'pending' };
    }

    const monthEntries = data.months[monthKey].entries;

    const existingIndex = monthEntries.findIndex((item) => item.date === date);
    const nextEntry = { date, quantity, delivered };

    if (existingIndex >= 0) {
      monthEntries[existingIndex] = nextEntry;
    } else {
      monthEntries.push(nextEntry);
    }

    await writeData(data);

    return res.json({
      message: existingIndex >= 0 ? 'Today updated.' : 'Today saved.',
      entry: nextEntry,
      summary: calculateMonthSummary(data, monthKey)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not save entry.' });
  }
});

app.get('/api/month/:monthKey', async (req, res) => {
  const { monthKey } = req.params;

  if (!isMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
  }

  try {
    const data = await readData();
    return res.json(calculateMonthSummary(data, monthKey));
  } catch (error) {
    return res.status(500).json({ message: 'Could not load month summary.' });
  }
});

app.get('/api/months', async (_req, res) => {
  try {
    const data = await readData();
    const months = Object.keys(data.months)
      .sort((a, b) => b.localeCompare(a));

    return res.json({ months });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load months.' });
  }
});

app.post('/api/month/:monthKey/status', async (req, res) => {
  const { monthKey } = req.params;
  const status = req.body?.status;

  if (!isMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
  }

  if (status !== 'paid' && status !== 'pending') {
    return res.status(400).json({ message: 'Status must be paid or pending.' });
  }

  try {
    const data = await readData();
    if (!data.months[monthKey]) {
      return res.status(404).json({ message: 'Month not found.' });
    }

    data.months[monthKey].status = status;
    await writeData(data);

    return res.json({ message: 'Payment status updated.', month: monthKey, status });
  } catch (error) {
    return res.status(500).json({ message: 'Could not update payment status.' });
  }
});

// Backward-compatibility route for older cached frontend versions.
app.delete('/api/month/:monthKey', async (_req, res) => {
  return res.status(410).json({
    message: 'Delete month was removed. Use Payment Status (Paid/Pending) instead.'
  });
});

app.get('/summary', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'summary.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Milk tracker running at http://localhost:${PORT}`);
});
