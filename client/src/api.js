const CACHE_PREFIX = 'floodbank-cache:';
const QUEUE_KEY = 'floodbank-pending-ledger';
const readJson = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Cache storage can be unavailable or full. */ } };
const emitQueue = () => window.dispatchEvent(new CustomEvent('floodbank:queue', { detail: readJson(QUEUE_KEY) || [] }));

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  try {
    const response = await fetch(`/api${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    if (method === 'GET') writeJson(`${CACHE_PREFIX}${path}`, data);
    return data;
  } catch (error) {
    if (method === 'GET' && navigator.onLine && !(error instanceof TypeError)) throw error;
    if (method === 'GET') {
      const cached = readJson(`${CACHE_PREFIX}${path}`);
      if (cached !== null) return cached;
    }
    if (method === 'POST' && /\/farmers\/[^/]+\/bank\/(deposit|withdraw)$/.test(path) && (!navigator.onLine || error instanceof TypeError)) {
      const queue = readJson(QUEUE_KEY) || [];
      const farmerId = path.split('/')[3];
      if (path.endsWith('/withdraw')) {
        const cachedBank = readJson(`${CACHE_PREFIX}/farmers/${farmerId}/bank`);
        if (!cachedBank) throw new Error('Reconnect before using water from your bank.');
        const queuedBalance = queue.filter(item => item.path.startsWith(`/farmers/${farmerId}/bank/`)).reduce((sum, item) => sum + (item.path.endsWith('/deposit') ? Number(item.body.m3) : -Number(item.body.m3)), Number(cachedBank.balanceM3 || 0));
        if (Number(options.body ? JSON.parse(options.body).m3 : 0) > queuedBalance) throw new Error('Insufficient saved water.');
      }
      const idempotencyKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const item = { path, body: JSON.parse(options.body || '{}'), idempotencyKey, queuedAt: new Date().toISOString() };
      writeJson(QUEUE_KEY, [...queue, item]); emitQueue();
      return { ...item, queued: true, _id: `pending-${idempotencyKey}`, type: path.endsWith('/deposit') ? 'DEPOSIT' : 'WITHDRAW', m3: Number(item.body.m3), date: item.queuedAt };
    }
    throw error;
  }
}

async function syncLedgerQueue() {
  if (!navigator.onLine) return;
  const queue = readJson(QUEUE_KEY) || [];
  const remaining = [];
  for (const item of queue) {
    try {
      const response = await fetch(`/api${item.path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.idempotencyKey }, body: JSON.stringify(item.body) });
      if (!response.ok) { remaining.push(item); continue; }
      const farmerId = item.path.split('/')[3];
      for (const key of [`${CACHE_PREFIX}/farmers/${farmerId}/bank`, `${CACHE_PREFIX}/farmers/${farmerId}/alerts`]) localStorage.removeItem(key);
    } catch { remaining.push(item); }
  }
  writeJson(QUEUE_KEY, remaining); emitQueue();
}

export const api = {
  languages: () => request('/languages'),
  states: () => request('/states'),
  villages: (state, district) => { const params = new URLSearchParams(); if (state) params.set('state', state); if (district) params.set('district', district); return request(`/villages${params.size ? `?${params}` : ''}`); },
  waterMap: state => request(`/villages/water-map${state ? `?state=${encodeURIComponent(state)}` : ''}`),
  crops: () => request('/crops'),
  createFarmer: body => request('/farmers', { method: 'POST', body: JSON.stringify(body) }),
  profile: id => request(`/farmers/${id}`),
  updateProfile: (id, body) => request(`/farmers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  risk: (id, demo) => request(`/farmers/${id}/risk${demo ? '?demo=true' : ''}`),
  plan: (id, demo) => request(`/farmers/${id}/plan${demo ? '?demo=true' : ''}`),
  bank: async id => {
    const data = await request(`/farmers/${id}/bank`);
    const pending = (readJson(QUEUE_KEY) || []).filter(item => item.path.startsWith(`/farmers/${id}/bank/`)).map(item => ({ _id: `pending-${item.idempotencyKey}`, type: item.path.endsWith('/deposit') ? 'DEPOSIT' : 'WITHDRAW', m3: Number(item.body.m3), date: item.queuedAt, pending: true }));
    const net = pending.reduce((sum, item) => sum + (item.type === 'DEPOSIT' ? item.m3 : -item.m3), 0);
    return pending.length ? { ...data, balanceM3: Math.max(0, Number(data.balanceM3 || 0) + net), litres: Math.max(0, Number(data.litres || 0) + net * 1000), entries: [...pending, ...(data.entries || [])] } : data;
  },
  alerts: id => request(`/farmers/${id}/alerts`),
  readAlert: (id, alertId) => request(`/farmers/${id}/alerts/${alertId}/read`, { method: 'PUT' }),
  ledger: (id, type, m3) => request(`/farmers/${id}/bank/${type}`, { method: 'POST', body: JSON.stringify({ m3 }) }),
  pendingCount: () => (readJson(QUEUE_KEY) || []).length,
  syncLedgerQueue
};

if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
