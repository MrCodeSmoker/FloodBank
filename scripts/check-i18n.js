const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '../client/src/i18n');
const english = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const keys = Object.keys(english).filter(key => !key.startsWith('_'));
const locales = ['hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'or', 'pa', 'as'];
const scripts = { hi: 'Devanagari', mr: 'Devanagari', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', bn: 'Bengali', as: 'Bengali', gu: 'Gujarati', or: 'Oriya', pa: 'Gurmukhi' };
const failures = [];
const isAllowedIdentical = value => value === 'FloodBank' || /^\d+(?:[.,/]\d+)?$/.test(value);

for (const code of locales) {
  const file = path.join(dir, `${code}.json`);
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'));
  const localeKeys = Object.keys(locale).filter(key => !key.startsWith('_'));
  for (const key of keys) {
    if (!Object.hasOwn(locale, key)) failures.push(`${code}: missing key "${key}"`);
    else if (typeof locale[key] !== 'string' || !locale[key].trim()) failures.push(`${code}: empty or invalid value for "${key}"`);
    else if (locale[key] === english[key] && !isAllowedIdentical(english[key])) failures.push(`${code}: untranslated English value for "${key}"`);
    else if (!isAllowedIdentical(locale[key]) && !new RegExp(`\\p{Script=${scripts[code]}}`, 'u').test(locale[key])) failures.push(`${code}: value for "${key}" is not in its native script`);
  }
  for (const key of localeKeys) if (!Object.hasOwn(english, key)) failures.push(`${code}: extra key "${key}"`);
}

if (failures.length) {
  console.error(`i18n check failed with ${failures.length} issue(s):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else console.log(`i18n check passed: ${locales.length} locales contain all ${keys.length} translated keys.`);
