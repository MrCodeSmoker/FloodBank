const crops = require('../data/crops.json');
const { languages } = require('../data/languages');
const { RISK_RANK } = require('./risk');

function buildPlan({ farmer, village, forecast, now = new Date() }) {
  const risk = forecast.riskLevel || 'GREEN';
  const rank = RISK_RANK[risk] ?? 0;
  const daysToHarvest = Math.ceil((new Date(farmer.harvestDate) - now) / 86400000);
  const crop = crops[farmer.crop] || { standing_water_ok: false };
  const nextRainHour = (forecast.hourly || []).find(row => Number(row.rainMm) > 0);
  const deadlineHrs = nextRainHour ? Math.max(0, Math.ceil((new Date(nextRainHour.time) - now) / 3600000) - 2) : 6;
  const actions = [];
  if (rank >= 1 && daysToHarvest <= 10) actions.push({ type: 'HARVEST_EARLY', priority: 1, deadlineHrs: Math.max(0, daysToHarvest * 24), reason_key: 'HARVEST_NEAR_MATURITY', date: new Date(farmer.harvestDate).toLocaleDateString(languages[farmer.language]?.locale || 'en-IN') });
  if (rank >= 1) actions.push({ type: 'OPEN_DRAINS', priority: 2, deadlineHrs, reason_key: 'REDUCE_FIELD_WATER', direction: farmer.drainDirection, standingWaterCm: crop.standing_water_ok ? (rank >= 2 ? 0 : 5) : null });
  const hasStorage = farmer.pond?.has || farmer.tank?.has || farmer.well?.has;
  const rain24h = Number(forecast.rain24hMm || 0);
  const excessMm = Math.max(0, rain24h - 25);
  const volumeM3 = excessMm * Number(farmer.areaAcres || 0) * 4.047;
  if (rank >= 1 && hasStorage) {
    let destination = 'well';
    let bankedM3 = volumeM3;
    if (farmer.pond?.has) {
      destination = 'pond';
      bankedM3 = Math.min(volumeM3, Math.max(0, Number(farmer.pond.capacityM3 || 0) - Number(farmer.pond.filledM3 || 0)));
    } else if (farmer.tank?.has) destination = farmer.tank.name || 'tank';
    actions.push({ type: 'BANK_WATER', priority: 3, deadlineHrs, reason_key: 'STORE_EXCESS_RAIN', destination, excessMm, volumeM3, bankedM3, litres: Math.round(bankedM3 * 1000) });
  } else if (rank >= 1 && !hasStorage) {
    actions.push({ type: 'ASK_PANCHAYAT', priority: 3, deadlineHrs: 48, reason_key: 'NO_LOCAL_STORAGE' });
  }
  if (rank >= 2) actions.push({ type: farmer.crop === 'paddy' ? 'PROTECT_STORED_GRAIN' : 'MOVE_EQUIPMENT', priority: 4, deadlineHrs: 12, reason_key: 'PROTECT_ASSETS' });
  const limited = actions.sort((a, b) => a.priority - b.priority).slice(0, 3);
  return { village: village.name, riskLevel: risk, rain24hMm: rain24h, actions: limited, noStorage: rank >= 1 && !hasStorage };
}

module.exports = { buildPlan };
