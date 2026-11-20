const express = require('express');
const { Village, Farmer, Forecast, Alert, Ledger } = require('../models');
const { fetchForecast } = require('../services/weather');
const { buildPlan } = require('../services/rules');
const { rewritePlan } = require('../services/gemini');
const { getBankSummary, addLedger } = require('../services/bank');
const { RISK_RANK } = require('../services/risk');
const crops = require('../data/crops.json');
const { languages, has: hasLanguage } = require('../data/languages');

const router = express.Router();
// Express 4 does not forward rejected async route promises automatically.
// Forward them to the API error middleware so a failed request cannot crash Node.
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const idOk = id => /^[a-f\d]{24}$/i.test(String(id));
async function farmerContext(id) {
  if (!idOk(id)) throw Object.assign(new Error('Farmer not found'), { status: 404 });
  const farmer = await Farmer.findById(id).populate('villageId');
  if (!farmer) throw Object.assign(new Error('Farmer not found'), { status: 404 });
  return { farmer, village: farmer.villageId };
}
async function currentForecast(village, demo = false) {
  const forecast = await fetchForecast(village);
  if (!demo) return forecast;
  const daily = (forecast.daily || []).map(row => ({ date: row.date, rainMm: Number(row.rainMm || 0) }));
  if (daily.length) daily[0].rainMm = 120;
  else daily.push({ date: new Date().toISOString().slice(0, 10), rainMm: 120 });
  return { ...forecast.toObject(), rain24hMm: 120, riskLevel: 'RED', daily, demo: true };
}

router.get('/languages', (_req, res) => res.json(Object.values(languages).map(({ code, nativeName, englishName }) => ({ code, nativeName, englishName }))));
router.get('/states', asyncHandler(async (_req, res) => {
  const villages = await Village.find().select('state district defaultLanguage').lean();
  const states = new Map();
  for (const village of villages) {
    if (!village.state) continue;
    if (!states.has(village.state)) states.set(village.state, { name: village.state, defaultLanguage: village.defaultLanguage || 'en', districts: [] });
    const item = states.get(village.state);
    if (!item.districts.includes(village.district)) item.districts.push(village.district);
  }
  res.json([...states.values()].sort((a, b) => a.name.localeCompare(b.name)).map(state => ({ ...state, districts: state.districts.sort() })));
}));
router.get('/villages', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.state) filter.state = req.query.state;
  if (req.query.district) filter.district = req.query.district;
  res.json(await Village.find(filter).sort({ district: 1, name: 1 }).lean());
}));
router.get('/villages/water-map', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.state) filter.state = req.query.state;
  const villages = await Village.find(filter).sort({ district: 1, name: 1 }).select('name state district lat lon').lean();
  const villageIds = villages.map(village => village._id);
  const [forecasts, farmerCounts, ledgerTotals] = await Promise.all([
    Forecast.find({ villageId: { $in: villageIds } }).select('villageId riskLevel rain24hMm fetchedAt').lean(),
    Farmer.aggregate([{ $match: { villageId: { $in: villageIds } } }, { $group: { _id: '$villageId', farmers: { $sum: 1 } } }]),
    Ledger.aggregate([{ $match: { farmerId: { $in: await Farmer.find({ villageId: { $in: villageIds } }).distinct('_id') } } }, { $group: { _id: { farmerId: '$farmerId', type: '$type' }, totalM3: { $sum: '$m3' } } }])
  ]);
  const forecastByVillage = new Map(forecasts.map(item => [String(item.villageId), item]));
  const farmersByVillage = new Map(farmerCounts.map(item => [String(item._id), item.farmers]));
  const farmerIdsByVillage = new Map();
  const farmerDocs = await Farmer.find({ villageId: { $in: villageIds } }).select('_id villageId').lean();
  for (const farmer of farmerDocs) { const key = String(farmer.villageId); farmerIdsByVillage.set(key, [...(farmerIdsByVillage.get(key) || []), String(farmer._id)]); }
  const netByFarmer = new Map();
  for (const item of ledgerTotals) netByFarmer.set(String(item._id.farmerId), (netByFarmer.get(String(item._id.farmerId)) || 0) + (item._id.type === 'DEPOSIT' ? item.totalM3 : -item.totalM3));
  res.json(villages.map(village => {
    const key = String(village._id);
    const totals = (farmerIdsByVillage.get(key) || []).reduce((sum, id) => sum + Math.max(0, netByFarmer.get(id) || 0), 0);
    const forecast = forecastByVillage.get(key);
    return { ...village, farmers: farmersByVillage.get(key) || 0, reportedStorageM3: Number(totals.toFixed(1)), riskLevel: forecast?.riskLevel || null, rain24hMm: forecast?.rain24hMm ?? null, fetchedAt: forecast?.fetchedAt || null };
  }));
}));
router.get('/crops', (_req, res) => res.json(crops));

router.post('/farmers', asyncHandler(async (req, res) => {
  const data = req.body || {};
  if (!data.name || !/^\+?[\d\s-]{7,16}$/.test(data.phone || '') || !idOk(data.villageId) || typeof data.crop !== 'string' || !data.crop.trim() || !data.harvestDate || Number(data.areaAcres) <= 0) return res.status(400).json({ error: 'Please complete all required field details.' });
  if (!hasLanguage(data.language)) return res.status(400).json({ error: 'Choose a supported language.' });
  if (!['N', 'S', 'E', 'W'].includes(data.drainDirection)) return res.status(400).json({ error: 'Choose a drain direction.' });
  if (!(await Village.exists({ _id: data.villageId }))) return res.status(400).json({ error: 'Choose a listed village.' });
  try {
    const farmer = await Farmer.create({ ...data, pond: { has: Boolean(data.pond?.has), capacityM3: Number(data.pond?.capacityM3 || 0), filledM3: 0 }, tank: { has: Boolean(data.tank?.has), name: data.tank?.name || '' }, well: { has: Boolean(data.well?.has) } });
    res.status(201).json(farmer);
  } catch (err) { if (err.code === 11000) return res.status(409).json({ error: 'That phone number already has a field profile.' }); throw err; }
}));

router.get('/farmers/:id', asyncHandler(async (req, res) => { const { farmer } = await farmerContext(req.params.id); res.json(farmer); }));
router.put('/farmers/:id', asyncHandler(async (req, res) => {
  await farmerContext(req.params.id);
  const changes = { ...req.body };
  delete changes.phone;
  const farmer = await Farmer.findByIdAndUpdate(req.params.id, changes, { new: true, runValidators: true });
  res.json(farmer);
}));

router.get('/farmers/:id/risk', asyncHandler(async (req, res) => {
  const { farmer, village } = await farmerContext(req.params.id);
  const forecast = await currentForecast(village, req.query.demo === 'true');
  res.json({ riskLevel: forecast.riskLevel, rain24hMm: forecast.rain24hMm, rain7d: forecast.daily.slice(0, 7), daily: forecast.daily.slice(0, 7), riverDischargeRatio: forecast.riverDischargeRatio, fetchedAt: forecast.fetchedAt, demo: Boolean(forecast.demo) });
}));
router.get('/farmers/:id/plan', asyncHandler(async (req, res) => {
  const { farmer, village } = await farmerContext(req.params.id);
  const forecast = await currentForecast(village, req.query.demo === 'true');
  const plan = buildPlan({ farmer, village, forecast });
  const wording = await rewritePlan(plan, farmer.language);
  res.json({ ...plan, ...wording, actions: plan.actions.map((action, i) => ({ ...action, text: wording.actions[i] || '' })) });
}));

router.post('/farmers/:id/bank/deposit', asyncHandler(async (req, res) => {
  const { farmer } = await farmerContext(req.params.id);
  const existing = req.get('Idempotency-Key') && await Ledger.findOne({ farmerId: farmer._id, idempotencyKey: req.get('Idempotency-Key') });
  const entry = existing || await addLedger(farmer, 'DEPOSIT', req.body?.m3, req.body?.note || 'Water banked', req.get('Idempotency-Key'));
  res.status(201).json(entry);
}));
router.post('/farmers/:id/bank/withdraw', asyncHandler(async (req, res) => {
  const { farmer } = await farmerContext(req.params.id);
  const existing = req.get('Idempotency-Key') && await Ledger.findOne({ farmerId: farmer._id, idempotencyKey: req.get('Idempotency-Key') });
  const entry = existing || await addLedger(farmer, 'WITHDRAW', req.body?.m3, req.body?.note || 'Water used', req.get('Idempotency-Key'));
  res.status(201).json(entry);
}));
router.get('/farmers/:id/bank', asyncHandler(async (req, res) => {
  const { farmer, village } = await farmerContext(req.params.id);
  let forecast = await Forecast.findOne({ villageId: village._id });
  if (!forecast || Date.now() - new Date(forecast.fetchedAt).getTime() > 3 * 60 * 60 * 1000) {
    try { forecast = await fetchForecast(village); } catch { /* Balance and ledger remain available offline. */ }
  }
  res.json(await getBankSummary(farmer, forecast));
}));
router.get('/farmers/:id/alerts', asyncHandler(async (req, res) => { await farmerContext(req.params.id); res.json(await Alert.find({ farmerId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean()); }));
router.put('/farmers/:id/alerts/:alertId/read', asyncHandler(async (req, res) => {
  await farmerContext(req.params.id);
  const alert = await Alert.findOneAndUpdate({ _id: req.params.alertId, farmerId: req.params.id }, { read: true }, { new: true });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
}));
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = { router, currentForecast, farmerContext };
