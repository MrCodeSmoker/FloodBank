const fs = require('node:fs');
const path = require('node:path');

const localeDir = path.resolve(__dirname, '../../client/src/i18n');
const languages = Object.fromEntries(fs.readdirSync(localeDir)
  .filter(file => file.endsWith('.json'))
  .map(file => {
    const catalog = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    const code = path.basename(file, '.json');
    return [code, { code, ...(catalog._meta || {}) }];
  }));

module.exports = { languages, codes: Object.keys(languages), has: code => Object.hasOwn(languages, code) };
