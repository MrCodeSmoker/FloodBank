const { Ledger } = require('../models');
const { calculateBalance, insuranceScore } = require('./bankMath');
async function getBalance(farmerId) {
  const entries = await Ledger.find({ farmerId }).sort({ date: -1 }).lean();
  return { balanceM3: calculateBalance(entries), entries };
}
async function getBankSummary(farmer, forecast) {
  const { balanceM3, entries } = await getBalance(farmer._id);
  const score = insuranceScore(balanceM3, farmer.areaAcres);
  const result = { balanceM3, litres: Math.round(balanceM3 * 1000), score: Number.isFinite(score) ? Math.round(score) : 0, entries, droughtMessage: null };
  if (forecast && Number(forecast.rain14dMm) < 10 && balanceM3 > 0) {
    const days = balanceM3 / (Number(farmer.areaAcres) * 4);
    result.droughtMessage = { litres: Math.round(balanceM3 * 1000), days: Math.round(days * 10) / 10 };
  }
  return result;
}
async function addLedger(farmer, type, m3, note = '', idempotencyKey = undefined) {
  const amount = Number(m3);
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });
  if (type === 'WITHDRAW') {
    const { balanceM3 } = await getBalance(farmer._id);
    if (amount > balanceM3) throw Object.assign(new Error('Insufficient saved water'), { status: 400 });
  }
  const entry = await Ledger.create({ farmerId: farmer._id, type, m3: amount, note, ...(idempotencyKey ? { idempotencyKey } : {}) });
  if (farmer.pond?.has) {
    const delta = type === 'DEPOSIT' ? amount : -amount;
    farmer.pond.filledM3 = Math.max(0, Math.min(farmer.pond.capacityM3, Number(farmer.pond.filledM3 || 0) + delta));
    await farmer.save();
  }
  return entry;
}
module.exports = { getBalance, getBankSummary, addLedger, calculateBalance, insuranceScore };
