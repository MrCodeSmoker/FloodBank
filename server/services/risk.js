function assessRisk({ rain24hMm = 0, daily = [], riverDischargeRatio = null }) {
  const rain3d = daily.slice(0, 3).reduce((sum, day) => sum + Number(day.rainMm || 0), 0);
  if (rain24hMm >= 115.6) return 'RED';
  if (rain24hMm >= 64.5 || (riverDischargeRatio != null && riverDischargeRatio > 2)) return 'ORANGE';
  if (rain24hMm >= 35 || rain3d >= 60) return 'YELLOW';
  return 'GREEN';
}
const RISK_RANK = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };
module.exports = { assessRisk, RISK_RANK };
