# Milk Expense Tracking App

Offline-first localhost web app for daily milk tracking with file-based JSON storage. Designed for simple, elderly-friendly daily use.

## Features

- Daily entry with automatic date detection
- Delivered / Not Delivered buttons (no date input)
- Global milk rate setting (INR per kg)
- Monthly summary: total milk, total cost, day-wise list
- Month payment status tracking (Pending / Paid)
- File corruption fallback (auto-reset with backup copy)
- Single source of truth in `data/data.json`
- Service worker cache for offline UI support

## Project Structure

- `frontend/`
- `backend/`
- `data/data.json`
- `package.json`
- `README.md`

## Run Locally

1. Open terminal in project root.
2. Install dependencies:

```bash
npm install
```

3. Start server:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

## Screens

- `/` -> Daily entry, rate setting, and payment status controls
- `/summary` -> Monthly summary view (totals, status display, and day-wise list)

## API Endpoints

- `GET /api/state` -> rate, month list, today
- `POST /api/entry` -> save/update today entry
- `POST /api/rate` -> update current rate
- `GET /api/month/:monthKey` -> month summary (`YYYY-MM`)
- `POST /api/month/:monthKey/status` -> update payment status (`paid` or `pending`)

## Data Format

Stored in `data/data.json`:

```json
{
  "rate": 55,
  "months": {
    "2026-04": {
      "status": "pending",
      "entries": [
        {
          "date": "2026-04-08",
          "quantity": 2,
          "delivered": true
        },
        {
          "date": "2026-04-09",
          "quantity": 0,
          "delivered": false
        }
      ]
    }
  }
}
```

Backward compatibility is built in: old month arrays at top level are auto-migrated into the `months` object with default `status: "pending"`.

## Verification Checklist

- Add Delivered entry -> saves today quantity
- Add Not Delivered -> saves quantity as 0 for today
- Change rate -> monthly total updates
- Mark month Paid/Pending -> status remains saved after restart

## Mobile Wrapping Readiness

- Responsive mobile-first layout
- No external CDN dependencies
- PWA manifest and service worker included
- Can be wrapped with Android WebView, Capacitor, or Cordova
