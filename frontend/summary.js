const monthSelect = document.getElementById('monthSelect');
const totalMilk = document.getElementById('totalMilk');
const summaryRate = document.getElementById('summaryRate');
const totalCost = document.getElementById('totalCost');
const paymentStatus = document.getElementById('paymentStatus');
const entriesBody = document.getElementById('entriesBody');
const summaryStatus = document.getElementById('summaryStatus');

function setStatus(node, message, ok = true) {
  node.textContent = message;
  node.classList.remove('status-ok', 'status-err');
  node.classList.add(ok ? 'status-ok' : 'status-err');
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function formatDateDisplay(dateStr) {
  if (!dateStr) {
    return '';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    return dateStr;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return dateStr;
  }

  return `${day} ${monthNames[month - 1]} ${year}`;
}

function renderEntries(entries) {
  entriesBody.innerHTML = '';

  if (!entries.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3">No entries yet for this month.</td>';
    entriesBody.appendChild(row);
    return;
  }

  for (const item of entries) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDateDisplay(item.date)}</td>
      <td>${item.delivered ? 'Yes' : 'No'}</td>
      <td>${Number(item.quantity).toFixed(2)}</td>
    `;
    entriesBody.appendChild(row);
  }
}

function renderPaymentStatus(status) {
  const nextStatus = status === 'paid' ? 'paid' : 'pending';
  paymentStatus.classList.remove('payment-paid', 'payment-pending');

  if (nextStatus === 'paid') {
    paymentStatus.textContent = 'Paid';
    paymentStatus.classList.add('payment-paid');
  } else {
    paymentStatus.textContent = 'Pending';
    paymentStatus.classList.add('payment-pending');
  }
}

function fillMonthSelect(months) {
  monthSelect.innerHTML = '';

  if (!months.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No month available';
    monthSelect.appendChild(opt);
    monthSelect.disabled = true;
    totalMilk.textContent = '0.00';
    summaryRate.textContent = '0.00';
    totalCost.textContent = '0.00';
    renderPaymentStatus('pending');
    renderEntries([]);
    return;
  }

  monthSelect.disabled = false;

  for (const month of months) {
    const opt = document.createElement('option');
    opt.value = month;
    opt.textContent = formatMonth(month);
    monthSelect.appendChild(opt);
  }
}

async function loadMonthSummary(monthKey) {
  if (!monthKey) {
    return;
  }

  try {
    const summary = await api(`/api/month/${monthKey}`);
    totalMilk.textContent = Number(summary.totalMilk).toFixed(2);
    summaryRate.textContent = Number(summary.rate).toFixed(2);
    totalCost.textContent = Number(summary.totalCost).toFixed(2);
    renderPaymentStatus(summary.status);
    renderEntries(summary.entries);
  } catch (error) {
    setStatus(summaryStatus, error.message, false);
  }
}

async function init() {
  try {
    const state = await api('/api/state');
    fillMonthSelect(state.months);
    const firstMonth = state.months[0] || '';
    monthSelect.value = firstMonth;
    await loadMonthSummary(firstMonth);
  } catch (error) {
    setStatus(summaryStatus, `Startup error: ${error.message}`, false);
  }

  monthSelect.addEventListener('change', () => {
    summaryStatus.textContent = '';
    loadMonthSummary(monthSelect.value);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js?v=7')
      .then((registration) => registration.update())
      .catch(() => {
        // Registration failure should not block app usage.
      });
  }
}

init();
