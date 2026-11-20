const { Farmer, Village, Alert } = require('../models');
const { fetchForecast } = require('../services/weather');
const { buildPlan } = require('../services/rules');
const { rewritePlan } = require('../services/gemini');
const { notify } = require('../services/notify');
const { RISK_RANK } = require('../services/risk');

async function runDailyAlerts() {
  const farmers = await Farmer.find().populate('villageId');
  let created = 0;
  for (const farmer of farmers) {
    try {
      const forecast = await fetchForecast(farmer.villageId);
      if ((RISK_RANK[forecast.riskLevel] || 0) < 1) continue;
      const plan = buildPlan({ farmer, village: farmer.villageId, forecast });
      const wording = await rewritePlan(plan, farmer.language);
      const alert = await Alert.create({ farmerId: farmer._id, riskLevel: plan.riskLevel, actions: plan.actions.map(({ type, priority, deadlineHrs }) => ({ type, priority, deadlineHrs })), text: `${wording.summary} ${wording.actions.join(' ')}`, read: false });
      notify(farmer, alert);
      created += 1;
    } catch (error) { console.error(`Alert check failed for ${farmer._id}:`, error.message); }
  }
  console.log(`Daily alert job stored ${created} alert(s).`);
  return { created };
}
module.exports = { runDailyAlerts };
