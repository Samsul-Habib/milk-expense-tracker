const quantityInput = document.getElementById('quantityInput');
const deliveredBtn = document.getElementById('deliveredBtn');
const notDeliveredBtn = document.getElementById('notDeliveredBtn');
const entryStatus = document.getElementById('entryStatus');

const rateInput = document.getElementById('rateInput');
const saveRateBtn = document.getElementById('saveRateBtn');
const rateStatus = document.getElementById('rateStatus');

const todayLabel = document.getElementById('todayLabel');
const monthSelect = document.getElementById('monthSelect');
const paymentStatus = document.getElementById('paymentStatus');
const markPaidBtn = document.getElementById('markPaidBtn');
const markPendingBtn = document.getElementById('markPendingBtn');
const summaryStatus = document.getElementById('summaryStatus');

function setStatus(node, message, ok = true) {
  node.textContent = message;
  node.classList.remove('status-ok', 'status-err');
  node.classList.add(ok ? 'status-ok' : 'status-err');
}

function clearStatus(node) {
  node.textContent = '';
  node.classList.remove('status-ok', 'status-err');
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

async function loadMonthSummary(monthKey) {
  if (!monthKey) {
    renderPaymentStatus('pending');
    markPaidBtn.disabled = true;
    markPendingBtn.disabled = true;
    return;
  }

  try {
    const summary = await api(`/api/month/${monthKey}`);
    renderPaymentStatus(summary.status);
    markPaidBtn.disabled = false;
    markPendingBtn.disabled = false;
  } catch (error) {
    setStatus(summaryStatus, error.message, false);
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
    markPaidBtn.disabled = true;
    markPendingBtn.disabled = true;
    return;
  }

  monthSelect.disabled = false;
  markPaidBtn.disabled = false;
  markPendingBtn.disabled = false;

  for (const month of months) {
    const opt = document.createElement('option');
    opt.value = month;
    opt.textContent = formatMonth(month);
    monthSelect.appendChild(opt);
  }
}

async function refreshState(preferredMonth) {
  const state = await api('/api/state');
  rateInput.value = Number(state.rate).toFixed(2);
  todayLabel.textContent = `Today: ${formatDateDisplay(state.today)}`;

  fillMonthSelect(state.months);

  const monthToLoad = preferredMonth && state.months.includes(preferredMonth)
    ? preferredMonth
    : state.months[0] || '';

  monthSelect.value = monthToLoad;
  await loadMonthSummary(monthToLoad);
}

async function saveEntry(delivered) {
  clearStatus(entryStatus);
  clearStatus(summaryStatus);

  const quantity = Number(quantityInput.value);

  try {
    const payload = await api('/api/entry', {
      method: 'POST',
      body: JSON.stringify({ quantity, delivered })
    });

    setStatus(entryStatus, payload.message, true);
    await refreshState(payload.summary.month);
  } catch (error) {
    setStatus(entryStatus, error.message, false);
  }
}

async function saveRate() {
  clearStatus(rateStatus);

  const rate = Number(rateInput.value);

  try {
    await api('/api/rate', {
      method: 'POST',
      body: JSON.stringify({ rate })
    });
    setStatus(rateStatus, 'Rate updated.', true);
    await loadMonthSummary(monthSelect.value);
  } catch (error) {
    setStatus(rateStatus, error.message, false);
  }
}

async function updatePaymentStatus(status) {
  const selected = monthSelect.value;
  if (!selected) {
    setStatus(summaryStatus, 'Please choose a month first.', false);
    return;
  }

  try {
    const payload = await api(`/api/month/${selected}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    renderPaymentStatus(payload.status);
    setStatus(summaryStatus, `Status set to ${payload.status}.`, true);
  } catch (error) {
    setStatus(summaryStatus, error.message, false);
  }
}

async function init() {
  deliveredBtn.addEventListener('click', () => saveEntry(true));
  notDeliveredBtn.addEventListener('click', () => saveEntry(false));
  saveRateBtn.addEventListener('click', saveRate);
  markPaidBtn.addEventListener('click', () => updatePaymentStatus('paid'));
  markPendingBtn.addEventListener('click', () => updatePaymentStatus('pending'));
  monthSelect.addEventListener('change', () => {
    clearStatus(summaryStatus);
    loadMonthSummary(monthSelect.value);
  });

  try {
    await refreshState();
  } catch (error) {
    setStatus(summaryStatus, `Startup error: ${error.message}`, false);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js?v=7')
      .then((registration) => registration.update())
      .catch(() => {
        // Registration failure should not block app usage.
      });
  }
}

init();
