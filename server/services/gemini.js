const fs = require('node:fs');
const path = require('node:path');
const { languages } = require('../data/languages');
const templateCache = new Map();
function templatesFor(code) {
  if (templateCache.has(code)) return templateCache.get(code);
  const file = path.resolve(__dirname, `../data/templates/${code}.json`);
  const templates = JSON.parse(fs.readFileSync(file, 'utf8'));
  templateCache.set(code, templates);
  return templates;
}

function fill(template, values) { return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '')); }
function fallback(plan, language) {
  const copy = templatesFor(language);
  const english = language === 'en' ? copy : templatesFor('en');
  const summary = fill(copy.summary || english.summary, { village: plan.village, risk: plan.riskLevel.toLowerCase() });
  const actions = plan.actions.map(action => {
    if (action.type === 'ASK_PANCHAYAT') return fill(copy.ASK_PANCHAYAT || english.ASK_PANCHAYAT, {});
    const key = copy[action.type] || english[action.type];
    if (!key) return '';
    const direction = copy.directions?.[action.direction] || english.directions?.[action.direction] || action.direction;
    const destination = copy.destinations?.[action.destination] || english.destinations?.[action.destination] || action.destination;
    return fill(key, { date: action.date, hours: action.deadlineHrs, direction, destination, litres: action.litres?.toLocaleString(languages[language]?.locale || 'en-IN') });
  }).filter(Boolean);
  return { summary, actions };
}

async function rewritePlan(plan, language) {
  if (!process.env.GEMINI_API_KEY) return fallback(plan, language);
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const languageInfo = languages[language] || languages.en;
    const languageName = `${languageInfo.englishName || 'English'} (${language})`;
    const scriptRules = { hi: 'Devanagari', mr: 'Devanagari', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', bn: 'Bengali', as: 'Bengali-Assamese', gu: 'Gujarati', or: 'Odia', pa: 'Gurmukhi' };
    const script = scriptRules[language];
    const prompt = `Rewrite this structured field plan in simple ${languageName}. Use ${script || 'Latin'} script only. Decisions are already final. Return only JSON with summary and actions array. One short sentence per action, maximum 15 words each. No jargon. Use acres, hours, litres. Include village name. Preserve every action and its meaning. Plan: ${JSON.stringify(plan)}`;
    const result = await client.interactions.create({
      model: 'gemini-3.8-flash', input: prompt,
      response_format: { type: 'text', mime_type: 'application/json', schema: {
        type: 'object', properties: { summary: { type: 'string' }, actions: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'actions']
      } }
    });
    const parsed = JSON.parse(result.output_text);
    const scriptPatterns = { hi: /\p{Script=Devanagari}/u, mr: /\p{Script=Devanagari}/u, ta: /\p{Script=Tamil}/u, te: /\p{Script=Telugu}/u, kn: /\p{Script=Kannada}/u, ml: /\p{Script=Malayalam}/u, bn: /\p{Script=Bengali}/u, as: /\p{Script=Bengali}/u, gu: /\p{Script=Gujarati}/u, or: /\p{Script=Oriya}/u, pa: /\p{Script=Gurmukhi}/u };
    const sentences = [parsed.summary, ...(parsed.actions || [])];
    const scriptValid = !scriptPatterns[language] || sentences.every(sentence => {
      const withoutVillage = plan.village ? sentence.toLocaleLowerCase().replaceAll(String(plan.village).toLocaleLowerCase(), '') : sentence;
      return scriptPatterns[language].test(withoutVillage) && !/[A-Za-z]/.test(withoutVillage);
    });
    if (!parsed.summary || !Array.isArray(parsed.actions) || parsed.actions.length !== plan.actions.length || parsed.actions.some(sentence => typeof sentence !== 'string' || sentence.trim().split(/\s+/).length > 15) || !scriptValid) throw new Error('Invalid Gemini response');
    return parsed;
  } catch (error) {
    console.warn('Gemini rewrite failed; using local templates:', error.message);
    return fallback(plan, language);
  }
}

module.exports = { rewritePlan, fallback };
