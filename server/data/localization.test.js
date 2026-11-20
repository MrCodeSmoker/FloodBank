const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { languages } = require('./languages');
const villages = require('./villages.json');

test('all 12 locale catalogs expose native names and complete fallback templates', () => {
  assert.equal(Object.keys(languages).length, 12);
  for (const [code, language] of Object.entries(languages)) {
    assert.equal(language.code, code);
    assert.ok(language.nativeName);
    assert.ok(language.englishName);
    assert.ok(language.locale);
    assert.ok(language.fontFamily);
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, `../../client/src/i18n/${code}.json`), 'utf8'));
    assert.equal(catalog._reviewed, code === 'en');
    const templates = JSON.parse(fs.readFileSync(path.join(__dirname, `templates/${code}.json`), 'utf8'));
    for (const key of ['summary', 'HARVEST_EARLY', 'OPEN_DRAINS', 'BANK_WATER', 'ASK_PANCHAYAT']) assert.equal(typeof templates[key], 'string');
  }
});

test('seed has 40 villages with coordinates and at least two per state', () => {
  assert.equal(villages.length, 40);
  const counts = new Map();
  for (const village of villages) {
    assert.ok(village.state);
    assert.ok(village.district);
    assert.ok(languages[village.defaultLanguage]);
    assert.ok(village.lat >= -90 && village.lat <= 90);
    assert.ok(village.lon >= -180 && village.lon <= 180);
    counts.set(village.state, (counts.get(village.state) || 0) + 1);
  }
  assert.equal(counts.size, 13);
  for (const count of counts.values()) assert.ok(count >= 2);
});
