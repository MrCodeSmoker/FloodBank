const mongoose = require('mongoose');
const { codes: languageCodes } = require('../data/languages');

const Village = mongoose.model('Village', new mongoose.Schema({
  name: { type: String, required: true }, state: { type: String, required: true }, district: { type: String, required: true }, lat: Number, lon: Number, defaultLanguage: { type: String, default: 'en' }
}, { timestamps: true }));

const Farmer = mongoose.model('Farmer', new mongoose.Schema({
  name: { type: String, required: true, trim: true }, phone: { type: String, required: true, unique: true },
  language: { type: String, enum: languageCodes, default: 'en' }, villageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Village', required: true },
  crop: { type: String, required: true }, harvestDate: { type: Date, required: true }, areaAcres: { type: Number, required: true, min: 0.01 },
  drainDirection: { type: String, enum: ['N', 'S', 'E', 'W'], required: true },
  pond: { has: { type: Boolean, default: false }, capacityM3: { type: Number, default: 0 }, filledM3: { type: Number, default: 0 } },
  tank: { has: { type: Boolean, default: false }, name: String }, well: { has: { type: Boolean, default: false } }
}, { timestamps: true }));
const Forecast = mongoose.model('Forecast', new mongoose.Schema({
  villageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Village', unique: true }, fetchedAt: Date,
  hourly: [{ time: String, rainMm: Number }], daily: [{ date: String, rainMm: Number }], rain24hMm: Number,
  rain14dMm: Number, riskLevel: String, riverDischargeRatio: Number
}, { timestamps: true }));

const Alert = mongoose.model('Alert', new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', index: true }, createdAt: { type: Date, default: Date.now },
  riskLevel: String, actions: [{ type: String, priority: Number, deadlineHrs: Number }], text: String, read: { type: Boolean, default: false }
}));

const Ledger = mongoose.model('Ledger', new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', index: true }, date: { type: Date, default: Date.now },
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAW'], required: true }, m3: { type: Number, required: true, min: 0.0001 }, note: String,
  idempotencyKey: { type: String, unique: true, sparse: true }
}));

module.exports = { Village, Farmer, Forecast, Alert, Ledger };
