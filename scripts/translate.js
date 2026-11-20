require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const fs = require('node:fs');
const path = require('node:path');
const { GoogleGenAI } = require('@google/genai');

const localeDir = path.resolve(__dirname, '../client/src/i18n');
const nativeNames = { hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', or: 'Odia', pa: 'Punjabi', as: 'Assamese' };
const localUnits = {
  hi: ['\u092e\u093f\u092e\u0940', '\u0918\u0928 \u092e\u0940\u091f\u0930'], ta: ['\u0bae\u0bbf.\u0bae\u0bc0.', '\u0b95\u0ba9 \u0bae\u0bc0\u0b9f\u0bcd\u0b9f\u0bb0\u0bcd'],
  te: ['\u0c2e\u0c3f.\u0c2e\u0c40.', '\u0c18\u0c28 \u0c2e\u0c40\u0c1f\u0c30\u0c4d\u0c32\u0c41'], kn: ['\u0c2e\u0cbf.\u0c2e\u0cc0.', '\u0c18\u0ca8 \u0cae\u0cc0\u0c9f\u0cb0\u0ccd'],
  ml: ['\u0d2e\u0d3f.\u0d2e\u0d40.', '\u0d18\u0d28 \u0d2e\u0d40\u0d31\u0d4d\u0d31\u0d7c'], mr: ['\u092e\u093f\u092e\u0940', '\u0918\u0928 \u092e\u0940\u091f\u0930'],
  bn: ['\u09ae\u09bf\u09ae\u09bf', '\u0998\u09a8 \u09ae\u09bf\u099f\u09be\u09b0'], gu: ['\u0aae\u0abf\u0aae\u0ac0', '\u0a98\u0aa8 \u0aae\u0ac0\u0a9f\u0ab0'],
  or: ['\u0b2e\u0b3f.\u0b2e\u0b3f.', '\u0b18\u0b28 \u0b2e\u0b3f\u0b1f\u0b30'], pa: ['\u0a2e\u0a3f.\u0a2e\u0a40.', '\u0a18\u0a23 \u0a2e\u0a40\u0a1f\u0a30'],
  as: ['\u09ae\u09bf\u09ae\u09bf', '\u0998\u09a8 \u09ae\u09bf\u099f\u09be\u09f0']
};
const localBadges = {
  hi: ['\u092a\u094d\u0930\u0926\u0930\u094d\u0936\u0928', '\u0928\u092f\u093e'], ta: ['\u0bae\u0bbe\u0ba4\u0bbf\u0bb0\u0bbf', '\u0baa\u0bc1\u0ba4\u0bbf\u0baf'],
  te: ['\u0c21\u0c46\u0c2e\u0c4b', '\u0c15\u0c4a\u0c24\u0c4d\u0c24'], kn: ['\u0ca1\u0cc6\u0cae\u0ccb', '\u0cb9\u0cca\u0cb8'],
  ml: ['\u0d21\u0d46\u0d2e\u0d4b', '\u0d2a\u0d41\u0d24\u0d3f\u0d2f\u0d24\u0d4d'], mr: ['\u092a\u094d\u0930\u093e\u0924\u094d\u092f\u0915\u094d\u0937\u093f\u0915', '\u0928\u0935\u0940\u0928'],
  bn: ['\u09a1\u09c7\u09ae\u09cb', '\u09a8\u09a4\u09c1\u09a8'], gu: ['\u0aa1\u0ac7\u0aae\u0acb', '\u0aa8\u0ab5\u0ac1\u0a82'],
  or: ['\u0b21\u0b47\u0b2e\u0b4b', '\u0b28\u0b42\u0b06'], pa: ['\u0a21\u0a48\u0a2e\u0a4b', '\u0a28\u0a35\u0a3e\u0a02'],
  as: ['\u09a1\u09c7\u09ae\u09cb', '\u09a8\u09a4\u09c1\u09a8']
};
const english = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf8'));
const keys = Object.keys(english).filter(key => !key.startsWith('_'));
const requestedCodes = process.argv.slice(2);

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing from floodbank/.env');
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 60000 } });
  const localeEntries = Object.entries(nativeNames).filter(([code]) => !requestedCodes.length || requestedCodes.includes(code));
  for (const [code, language] of localeEntries) {
    const file = path.join(localeDir, `${code}.json`);
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    const prompt = `Translate every value in this JSON object into ${language}, written naturally in ${language}'s native script. Keep all keys unchanged. Preserve placeholders exactly, including braces such as {village}, {date}, {hours}, {cm}. Keep brand name FloodBank, crop names used as keys, units such as mm, m³, and numeric values unchanged. Translate all other visible text, short labels, errors, buttons, accessibility labels, and helper text. Return a JSON object with exactly these keys and string values. Source: ${JSON.stringify(Object.fromEntries(keys.map(key => [key, english[key]])))}`;
    console.log(`Translating ${code}.json...`);
    let translated;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const result = await client.models.generateContent({
          model: attempt % 2 ? 'gemini-3.6-flash' : 'gemini-3.8-flash', contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        translated = JSON.parse(String(result.text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
        break;
      } catch (error) {
        if (attempt === 6 || ![429, 500, 502, 503, 504].includes(Number(error.status))) throw error;
        console.warn(`${code}: translation service busy; retry ${attempt + 1}/6`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2500));
      }
    }
    [translated.millimetersShort, translated.cubicMetresShort] = localUnits[code];
    [translated.demoBadge, translated.newBadge] = localBadges[code];
    for (const key of keys) {
      if (typeof translated[key] !== 'string' || !translated[key].trim()) throw new Error(`${code}.json has an empty translation for ${key}`);
      const placeholders = value => value.match(/\{[^}]+\}/g)?.sort().join('|') || '';
      if (placeholders(translated[key]) !== placeholders(english[key])) throw new Error(`${code}.json changed a placeholder in ${key}`);
      if (translated[key] === english[key] && !['FloodBank'].includes(english[key]) && !/^\d+(?:\.\d+)?$/.test(english[key])) throw new Error(`${code}.json left ${key} in English; refusing to save partial translations`);
    }
    const output = { ...translated, _meta: current._meta, _reviewed: false };
    fs.writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`Translated ${code}.json (${keys.length} strings)`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
