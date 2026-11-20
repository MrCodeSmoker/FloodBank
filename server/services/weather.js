const { Forecast } = require('../models');
const { assessRisk } = require('./risk');

async function fetchForecast(village) {
  const cached = await Forecast.findOne({ villageId: village._id });
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 3 * 60 * 60 * 1000) return cached;
  const params = new URLSearchParams({ latitude: village.lat, longitude: village.lon, hourly: 'precipitation', daily: 'precipitation_sum', forecast_days: '14', past_days: '30', timezone: 'UTC' });
  const [weatherResponse, floodResponse] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`),
    fetch(`https://flood-api.open-meteo.com/v1/flood?${new URLSearchParams({ latitude: village.lat, longitude: village.lon, daily: 'river_discharge', forecast_days: '7', past_days: '30' })}`)
  ]);
  if (!weatherResponse.ok) throw new Error(`Forecast service returned ${weatherResponse.status}`);
  const weather = await weatherResponse.json();
  const hourly = (weather.hourly?.time || []).map((time, i) => ({ time, rainMm: Number(weather.hourly.precipitation?.[i] || 0) }));
  const todayUtc = new Date().toISOString().slice(0, 10);
  const daily = (weather.daily?.time || []).map((date, i) => ({ date, rainMm: Number(weather.daily.precipitation_sum?.[i] || 0) })).filter(row => row.date >= todayUtc).slice(0, 14);
  const now = Date.now();
  const hourStart = Math.floor(now / 3600000) * 3600000;
  const parseUtcHour = value => Date.parse(value.endsWith('Z') ? value : `${value}Z`);
  const rain24hMm = hourly.filter(row => parseUtcHour(row.time) >= hourStart && parseUtcHour(row.time) < hourStart + 24 * 60 * 60 * 1000).reduce((sum, row) => sum + row.rainMm, 0);
  const rain14dMm = daily.slice(0, 14).reduce((sum, row) => sum + row.rainMm, 0);
  let riverDischargeRatio = null;
  if (floodResponse.ok) {
    const flood = await floodResponse.json();
    const flow = flood.daily?.river_discharge || [];
    const times = flood.daily?.time || [];
    const pastFlows = flow.filter((_, i) => String(times[i]) < todayUtc).map(Number).filter(value => Number.isFinite(value) && value >= 0);
    const currentFlow = flow.find((_, i) => String(times[i]) >= todayUtc);
    const mean = pastFlows.reduce((a, b) => a + b, 0) / (pastFlows.length || 1);
    if (currentFlow != null && mean > 0) riverDischargeRatio = Number(currentFlow) / mean;
  }
  const riskLevel = assessRisk({ rain24hMm, daily, riverDischargeRatio });
  const data = { villageId: village._id, fetchedAt: new Date(), hourly, daily, rain24hMm, rain14dMm, riskLevel, riverDischargeRatio };
  return Forecast.findOneAndUpdate({ villageId: village._id }, data, { upsert: true, new: true, setDefaultsOnInsert: true });
}

module.exports = { fetchForecast };
