require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { Village } = require('./models');
const villageData = require('./data/villages.json');
const { router, currentForecast } = require('./routes/api');
const { runDailyAlerts } = require('./jobs/dailyAlerts');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', router);
app.post('/api/admin/run-alerts', async (_req, res, next) => { try { res.json(await runDailyAlerts()); } catch (error) { next(error); } });
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Please try again.' });
});

async function seedVillages() {
  for (const village of villageData) await Village.updateOne({ name: village.name, district: village.district }, { $set: village }, { upsert: true });
}
async function start() {
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
    await seedVillages();
    cron.schedule('0 6 * * *', () => runDailyAlerts().catch(error => console.error('Daily alert job failed:', error)), { timezone: 'Asia/Kolkata' });
    console.log('MongoDB connected; village list seeded; daily alerts scheduled for 06:00 IST.');
  } else console.warn('MONGO_URI is missing. API starts, but database routes are unavailable.');
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => console.log(`FloodBank API listening on ${port}`));
}

if (require.main === module) start().catch(error => { console.error('Could not start FloodBank:', error); process.exit(1); });
module.exports = { app, start };
