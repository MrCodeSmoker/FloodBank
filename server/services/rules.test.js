const assert = require('node:assert/strict');
const test = require('node:test');
const { assessRisk } = require('./risk');
const { buildPlan } = require('./rules');
const { calculateBalance, insuranceScore } = require('./bankMath');
const { rewritePlan } = require('./gemini');

const village = { name: 'Demo Village' };
const baseFarmer = { crop: 'paddy', harvestDate: new Date(Date.now() + 6 * 86400000), areaAcres: 2, drainDirection: 'E', pond: { has: true, capacityM3: 500, filledM3: 0 }, tank: { has: false }, well: { has: false } };
function forecast(rain24hMm, riskLevel) { return { rain24hMm, riskLevel: riskLevel || assessRisk({ rain24hMm, daily: [] }), hourly: [], daily: [] }; }

test('risk thresholds and 3-day rainfall use the specified categories', () => {
  assert.equal(assessRisk({ rain24hMm: 34.9, daily: [{ rainMm: 20 }, { rainMm: 20 }, { rainMm: 20 }] }), 'YELLOW');
  assert.equal(assessRisk({ rain24hMm: 64.5, daily: [] }), 'ORANGE');
  assert.equal(assessRisk({ rain24hMm: 115.6, daily: [] }), 'RED');
});

test('paddy near harvest at 70 mm gets harvest, drain, and bank actions', () => {
  const plan = buildPlan({ farmer: baseFarmer, village, forecast: forecast(70) });
  assert.equal(plan.riskLevel, 'ORANGE');
  assert.deepEqual(plan.actions.map(action => action.type), ['HARVEST_EARLY', 'OPEN_DRAINS', 'BANK_WATER']);
  assert.equal(plan.actions[1].standingWaterCm, 0);
});

test('sugarcane far from harvest at 120 mm gets no harvest and includes drain and safety', () => {
  const farmer = { ...baseFarmer, crop: 'sugarcane', harvestDate: new Date(Date.now() + 60 * 86400000) };
  const plan = buildPlan({ farmer, village, forecast: forecast(120) });
  assert.equal(plan.riskLevel, 'RED');
  assert.ok(!plan.actions.some(action => action.type === 'HARVEST_EARLY'));
  assert.ok(plan.actions.some(action => action.type === 'OPEN_DRAINS'));
  assert.ok(plan.actions.some(action => action.type === 'MOVE_EQUIPMENT'));
});

test('farmer without storage gets panchayat advice and no bank-water action', () => {
  const farmer = { ...baseFarmer, pond: { has: false }, tank: { has: false }, well: { has: false } };
  const plan = buildPlan({ farmer, village, forecast: forecast(70) });
  assert.ok(!plan.actions.some(action => action.type === 'BANK_WATER'));
  assert.ok(plan.actions.some(action => action.type === 'ASK_PANCHAYAT'));
});

test('2 acres with 60 mm forecast estimates about 283 cubic metres', () => {
  const plan = buildPlan({ farmer: baseFarmer, village, forecast: forecast(60) });
  const bank = plan.actions.find(action => action.type === 'BANK_WATER');
  assert.equal(bank.excessMm, 35);
  assert.equal(Math.round(bank.volumeM3), 283);
});

test('bank balance sums deposits and withdrawals, score is capped at 100', () => {
  assert.equal(calculateBalance([{ type: 'DEPOSIT', m3: 283 }, { type: 'WITHDRAW', m3: 10 }]), 273);
  assert.equal(insuranceScore(283, 2), 100);
  assert.equal(Math.round(insuranceScore(50, 2)), 63);
});

test('missing Gemini key returns the translated local plan template', async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const wording = await rewritePlan({ village: 'Demo Village', riskLevel: 'ORANGE', actions: [
      { type: 'HARVEST_EARLY', date: '20 Nov' }, { type: 'ASK_PANCHAYAT' }
    ] }, 'en');
    assert.match(wording.summary, /Demo Village/);
    assert.match(wording.actions[0], /Harvest by/);
    assert.match(wording.actions[1], /shared tank/);
  } finally {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});
