import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api.js';
import Navigation from './components/Navigation.jsx';
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, Check, ChevronDown, ChevronRight, CloudRain, Droplets, Leaf, LoaderCircle, MapPin, ShieldCheck, Sun, Waves } from './components/Icons.jsx';
import en from './i18n/en.json';
import { languages as languageOptions } from './languages.js';

const riskInfo = { GREEN: ['riskGreenTitle', 'riskGreenHint'], YELLOW: ['riskYellowTitle', 'riskYellowHint'], ORANGE: ['riskOrangeTitle', 'riskOrangeHint'], RED: ['riskRedTitle', 'riskRedHint'] };
const missingKeyWarnings = new Set();
const errText = error => {
  const message = String(error?.message || '');
  if (/fetch|network|ECONN|timeout|reconnect|offline/i.test(message)) return 'offline';
  if (/complete|required|field details/i.test(message)) return 'completeFieldDetails';
  if (/supported language/i.test(message)) return 'chooseLanguage';
  if (/listed village/i.test(message)) return 'chooseVillage';
  if (/drain direction/i.test(message)) return 'chooseDirectionError';
  if (/already has|duplicate/i.test(message)) return 'duplicateProfile';
  if (/insufficient/i.test(message)) return 'insufficientWater';
  if (/amount/i.test(message)) return 'amountError';
  return 'error';
};
const formatNumber = (number, locale) => new Intl.NumberFormat(locale || 'en-IN', { maximumFractionDigits: 0 }).format(Number(number || 0));
function LanguagePicker({ language, onChange, t }) {
  return <details className="language-picker">
    <summary className="language-toggle" aria-label={t('languages')}>
      <span>{t('languages')}</span><ChevronDown size={15} aria-hidden="true" />
    </summary>
    <div className="language-options" role="menu" aria-label={t('languages')}>
      {languageOptions.map(option => <button type="button" role="menuitemradio" aria-checked={language === option.code} className={language === option.code ? 'selected' : ''} key={option.code} onClick={event => { onChange(option.code); event.currentTarget.closest('details').open = false; }}>
        <span lang={option.locale}>{option.nativeName}</span>{language === option.code && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>
  </details>;
}
const dateShort = (value, locale = 'en-IN') => {
  if (!value) return '-';
  const datePart = String(value).slice(0, 10);
  const date = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

export default function App() {
  const { t: translate, i18n } = useTranslation();
  const [farmerId, setFarmerId] = useState(() => localStorage.getItem('floodbank-farmer'));
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('floodbank-language');
    return languageOptions.some(option => option.code === saved) ? saved : 'en';
  });
  const [page, setPage] = useState('home');
  const [farmer, setFarmer] = useState(null);
  const [villages, setVillages] = useState([]);
  const [states, setStates] = useState([]);
  const [crops, setCrops] = useState({});
  const [risk, setRisk] = useState(null);
  const [plan, setPlan] = useState(null);
  const [bank, setBank] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [waterMap, setWaterMap] = useState([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingSync, setPendingSync] = useState(() => api.pendingCount());
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = useCallback((key, options) => {
    const selected = i18n.getResource(language, 'translation', key);
    if (import.meta.env.DEV && (selected === undefined || selected === null || selected === '')) {
      const warningKey = `${language}:${key}`;
      if (!missingKeyWarnings.has(warningKey)) {
        missingKeyWarnings.add(warningKey);
        console.warn(`[FloodBank i18n] Missing translation: ${language}.${key}`);
      }
    }
    return translate(key, { ...options, lng: language, defaultValue: typeof en[key] === 'string' ? en[key] : '' });
  }, [translate, i18n, language]);
  const locale = languageOptions.find(option => option.code === language)?.locale || 'en-IN';

  const refresh = useCallback(async (id = farmerId, useDemo = demo) => {
    if (!id) return;
    setBusy(true); setError('');
    try {
      const [profile, weather, fieldPlan, water, notices] = await Promise.all([api.profile(id), api.risk(id, useDemo), api.plan(id, useDemo), api.bank(id), api.alerts(id)]);
      const savedLanguage = localStorage.getItem('floodbank-language');
      const nextLanguage = languageOptions.some(option => option.code === savedLanguage) ? savedLanguage : profile.language || 'en';
      setFarmer(profile); setLanguage(nextLanguage); setRisk(weather); setPlan(fieldPlan); setBank(water); setAlerts(notices);
      if (profile.language !== nextLanguage) api.updateProfile(id, { language: nextLanguage }).catch(() => {});
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  }, [farmerId, demo, language, t]);

  useEffect(() => {
    localStorage.setItem('floodbank-language', language);
    i18n.changeLanguage(language);
    document.documentElement.lang = languageOptions.find(option => option.code === language)?.locale || 'en-IN';
    const family = languageOptions.find(option => option.code === language)?.fontFamily || 'Noto Sans';
    const fontLink = document.getElementById('floodbank-script-font') || document.createElement('link');
    fontLink.id = 'floodbank-script-font'; fontLink.rel = 'stylesheet';
    fontLink.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replaceAll('%20', '+')}:wght@400;500;600;700&display=swap`;
    if (!fontLink.isConnected) document.head.appendChild(fontLink);
    document.documentElement.style.setProperty('--floodbank-font', `'${family}', system-ui, sans-serif`);
  }, [language, i18n]);
  useEffect(() => { api.villages().then(setVillages).catch(err => setError(errText(err))); api.states().then(setStates).catch(err => setError(errText(err))); api.crops().then(setCrops).catch(err => setError(errText(err))); }, []);
  useEffect(() => {
    const updateQueue = event => setPendingSync(event.detail?.length ?? api.pendingCount());
    const wentOnline = async () => { setOnline(true); await api.syncLedgerQueue(); if (farmerId) refresh(farmerId, demo); };
    const wentOffline = () => setOnline(false);
    window.addEventListener('floodbank:queue', updateQueue); window.addEventListener('online', wentOnline); window.addEventListener('offline', wentOffline);
    api.syncLedgerQueue();
    return () => { window.removeEventListener('floodbank:queue', updateQueue); window.removeEventListener('online', wentOnline); window.removeEventListener('offline', wentOffline); };
  }, [farmerId, demo, refresh]);
  useEffect(() => { if (farmerId) refresh(farmerId, demo); }, [farmerId]);
  useEffect(() => { if (farmerId) refresh(farmerId, demo); }, [demo]);
  useEffect(() => { const state = farmer?.villageId?.state; if (state) api.waterMap(state).then(setWaterMap).catch(() => setWaterMap([])); }, [farmer?.villageId?.state]);

  async function handleNewFarmer(data) {
    setBusy(true); setError('');
    try {
      const profile = await api.createFarmer({ ...data, language });
      localStorage.setItem('floodbank-farmer', profile._id); setFarmerId(profile._id);
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  }
  async function actionDone(action) {
    if (action.type !== 'BANK_WATER' || !action.bankedM3) return;
    try { await api.ledger(farmerId, 'deposit', action.bankedM3); await refresh(); }
    catch (err) { setError(errText(err)); }
  }
  async function ledger(type, amount) {
    setError('');
    try { await api.ledger(farmerId, type, amount); await refresh(); }
    catch (err) { setError(errText(err)); }
  }
  async function saveProfile(next) {
    try { const updated = await api.updateProfile(farmerId, next); setFarmer(updated); setLanguage(updated.language); await refresh(); return true; }
    catch (err) { setError(errText(err)); return false; }
  }
  async function changeLanguage(next) {
    setLanguage(next);
    i18n.changeLanguage(next);
    localStorage.setItem('floodbank-language', next);
    if (farmerId) {
      try { await api.updateProfile(farmerId, { language: next }); await refresh(farmerId, demo); }
      catch (err) { setError(errText(err)); }
    }
  }
  async function readAlert(alertId) {
    try { await api.readAlert(farmerId, alertId); setAlerts(previous => previous.map(alert => alert._id === alertId ? { ...alert, read: true } : alert)); }
    catch (err) { setError(errText(err)); }
  }
  const unread = useMemo(() => alerts.filter(alert => !alert.read).length, [alerts]);

  if (!farmerId) return <Onboarding t={t} language={language} setLanguage={changeLanguage} villages={villages} states={states} crops={crops} busy={busy} error={error} onCreate={handleNewFarmer} />;
  return <div className="app-shell">
    <Navigation page={page} setPage={setPage} t={t} unread={unread} stateName={farmer?.villageId?.state || t('india')} />
    <div className="app-main">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Droplets size={19} /></span><span>Flood<span>Bank</span></span></div><div className="topbar-place"><MapPin size={16} />{farmer?.villageId?.name || '-'}{farmer?.villageId?.district && <span> | {farmer.villageId.district}</span>}</div>{(!online || pendingSync > 0) && <span className={`connection-status ${online ? 'is-online' : 'is-offline'}`} role="status" aria-label={`${online ? '' : t('offlineMode')}${pendingSync ? `, ${pendingSync}` : ''}`}>{!online && t('offlineMode')}{pendingSync > 0 && <b>{pendingSync}</b>}</span>}<LanguagePicker language={language} onChange={changeLanguage} t={t} /></header>
      <main className="page-content">
        {error && <div className="notice notice-error" role="alert">{t(error)}<button onClick={() => refresh()}>{t('continue')}</button></div>}
        {page === 'home' && <HomePage {...{ t, locale, language, farmer, risk, plan, bank, waterMap, demo, setDemo, busy, refresh, actionDone, setPage }} />}
        {page === 'bank' && <BankPage {...{ t, locale, bank, busy, ledger }} />}
        {page === 'alerts' && <AlertsPage {...{ t, alerts, riskInfo, language, busy, readAlert }} />}
        {page === 'settings' && <SettingsPage {...{ t, farmer, villages, states, crops, language, setLanguage: changeLanguage, saveProfile, busy }} />}
      </main>
      <nav className="mobile-nav" aria-label={t('mainNavigation')}>
        {[['home', CloudRain, t('home')], ['bank', Droplets, t('bank')], ['alerts', Sun, t('alerts')], ['settings', Leaf, t('settings')]].map(([key, Icon, label]) => <button className={page === key ? 'active' : ''} key={key} onClick={() => setPage(key)} aria-current={page === key ? 'page' : undefined}><Icon size={19}/><span>{label}</span>{key === 'alerts' && unread > 0 && <i className="mobile-dot"/>}</button>)}
      </nav>
    </div>
  </div>;
}

function Onboarding({ t, language, setLanguage, villages, states, crops, busy, error, onCreate }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', phone: '', otp: '', state: '', district: '', villageId: '', crop: 'paddy', harvestDate: '', areaAcres: '', drainDirection: 'N', pond: { has: false, capacityM3: '' }, tank: { has: false, name: '' }, well: { has: false } });
  const [verified, setVerified] = useState(false);
  const [localError, setLocalError] = useState('');
  function update(key, value) { setForm(previous => ({ ...previous, [key]: value })); }
  const selectedState = states.find(item => item.name === form.state);
  const districts = selectedState?.districts || [];
  const availableVillages = villages.filter(v => v.state === form.state && (!form.district || v.district === form.district));
  function chooseState(stateName) { const state = states.find(item => item.name === stateName); setForm(previous => ({ ...previous, state: stateName, district: '', villageId: '' })); if (state?.defaultLanguage) setLanguage(state.defaultLanguage); }
  function setNested(group, key, value) { setForm(previous => ({ ...previous, [group]: { ...previous[group], [key]: value } })); }
  const next = () => {
    setLocalError('');
    if (step === 1) {
      if (!form.name.trim() || !form.phone.trim()) return setLocalError('namePhoneRequired');
      if (!verified && form.otp !== '1234') return setLocalError('useDemoCode');
      setVerified(true);
    }
    if (step === 2 && (!form.state || !form.district || !form.villageId || !form.harvestDate || Number(form.areaAcres) <= 0)) return setLocalError('completeFieldDetails');
    setStep(Math.min(3, step + 1));
  };
  const submit = () => onCreate({ ...form, language, areaAcres: Number(form.areaAcres), pond: { ...form.pond, capacityM3: Number(form.pond.capacityM3 || 0) } });
  return <div className="onboarding-wrap"><header className="onboard-head"><div className="brand-lockup"><span className="brand-mark"><Droplets size={21}/></span><b>Flood<span>Bank</span></b></div><LanguagePicker language={language} onChange={setLanguage} t={t} /></header>
    <section className="onboard-card"><div className="onboard-aside"><div className="field-art"><span className="field-sun"><Sun size={24}/></span><span className="field-wave wave-one"/><span className="field-wave wave-two"/><span className="field-wave wave-three"/><span className="field-drop"><Droplets size={24}/></span></div><p className="aside-caption">FloodBank | {form.state || t('india')}</p><h1>{t('tagline')}</h1><p>{t('onboardingIntro')}</p></div>
      <div className="onboard-form"><div className="progress-copy"><span>{step === 0 ? t('chooseLanguage') : `${t('step')} ${step} ${t('of')} 3`}</span>{step > 0 && <span>{Math.round((step / 3) * 100)}%</span>}</div><div className="progress-track"><span style={{ width: `${Math.max(20, step * 33.34)}%` }}/></div>
        {step === 0 && <><h2>{t('chooseLanguage')}</h2><p className="form-intro">{t('chooseLanguageIntro')}</p><div className="language-choices">{languageOptions.map(option => <button key={option.code} className={language === option.code ? 'picked' : ''} onClick={() => setLanguage(option.code)}><span>{option.nativeName}</span><ChevronRight size={18}/></button>)}</div><button className="button-primary full" onClick={() => setStep(1)}>{t('continue')}<ChevronRight size={17}/></button></>}
        {step === 1 && <><h2>{t('hello')}, {t('farmer')}</h2><p className="form-intro">{t('phoneConfirm')}</p><label>{t('name')}<input value={form.name} onChange={e => update('name', e.target.value)} autoComplete="name" /></label><label>{t('phone')}<input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} autoComplete="tel" /></label><label>{t('otp')}<input inputMode="numeric" maxLength={4} value={form.otp} onChange={e => update('otp', e.target.value)} placeholder="1234" /></label><p className="field-hint">{t('demoCodeHint')}</p><WizardButtons {...{ t, step, setStep, next, busy }}/></>}
        {step === 2 && <><h2>{t('setupTitle')}</h2><p className="form-intro">{t('setupHint')}</p><label>{t('state')}<select value={form.state} onChange={e => chooseState(e.target.value)}><option value="">{t('chooseState')}</option>{states.map(item => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label><label>{t('district')}<select value={form.district} disabled={!form.state} onChange={e => { update('district', e.target.value); update('villageId', ''); }}><option value="">{t('chooseDistrict')}</option>{districts.map(name => <option value={name} key={name}>{name}</option>)}</select></label><label>{t('village')}<select value={form.villageId} disabled={!form.district} onChange={e => update('villageId', e.target.value)}><option value="">{t('chooseVillage')}</option>{availableVillages.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}</select></label><div className="field-grid"><label>{t('crop')}<select value={form.crop} onChange={e => update('crop', e.target.value)}>{Object.entries(crops).map(([key, crop]) => <option key={key} value={key}>{t(key) || (key === 'other' ? t('genericCrop') : crop.label)}</option>)}</select></label><label>{t('harvestDate')}<input type="date" value={form.harvestDate} onChange={e => update('harvestDate', e.target.value)} /></label><label>{t('area')}<input type="number" min="0.1" step="0.1" value={form.areaAcres} onChange={e => update('areaAcres', e.target.value)} /></label><label>{t('drain')}<select value={form.drainDirection} onChange={e => update('drainDirection', e.target.value)}>{['N','S','E','W'].map(d => <option key={d} value={d}>{t(({N:'north',S:'south',E:'east',W:'west'})[d])}</option>)}</select></label></div><WizardButtons {...{ t, step, setStep, next, busy }}/></>}
        {step === 3 && <><h2>{t('waterStorageTitle')}</h2><p className="form-intro">{t('waterStorageHint')}</p><label className="check-field"><input type="checkbox" checked={form.pond.has} onChange={e => setNested('pond', 'has', e.target.checked)} />{t('pond')}</label>{form.pond.has && <label>{t('capacity')}<input type="number" min="0" step="1" value={form.pond.capacityM3} onChange={e => setNested('pond', 'capacityM3', e.target.value)} /></label>}<label className="check-field"><input type="checkbox" checked={form.tank.has} onChange={e => setNested('tank', 'has', e.target.checked)} />{t('tank')}</label>{form.tank.has && <label>{t('tankName')}<input value={form.tank.name} onChange={e => setNested('tank', 'name', e.target.value)} /></label>}<label className="check-field"><input type="checkbox" checked={form.well.has} onChange={e => setNested('well', 'has', e.target.checked)} />{t('well')}</label><WizardButtons {...{ t, step, setStep, next, busy, submit }}/></>}
        {(localError || error) && <p className="form-error" role="alert">{t(localError || error)}</p>}
      </div></section><p className="onboard-foot">{t('onboardingFoot')}</p>
  </div>;
}

function WizardButtons({ t, step, setStep, next, submit, busy }) { return <div className="wizard-buttons"><button className="button-quiet" onClick={() => setStep(step - 1)}>{t('back')}</button><button className="button-primary" onClick={submit || next} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : null}{submit ? t('createProfile') : t('next')}<ChevronRight size={17}/></button></div>; }

function HomePage({ t, locale, language, farmer, risk, plan, bank, waterMap, demo, setDemo, busy, refresh, actionDone, setPage }) {
  const [completed, setCompleted] = useState({});
  const level = risk?.riskLevel || 'GREEN';
  const [riskTitle, riskHint] = riskInfo[level];
  const dateLabel = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return <>
    <div className="page-heading"><div><p className="eyebrow">{dateLabel}</p><h1>{t('hello')}, {farmer?.name?.split(' ')[0] || '-'}</h1><p className="heading-sub">{t('fieldStatus')} <span className="dot-sep">|</span> {farmer?.crop ? t(farmer.crop) : '-'} <span className="dot-sep">|</span> {farmer?.areaAcres} {languageUnit(t)}</p></div><button className="icon-refresh" onClick={() => refresh()} aria-label={t('continue')} disabled={busy}><LoaderCircle className={busy ? 'spin' : ''} size={18}/></button></div>
    <section className={`risk-panel risk-${risk ? level.toLowerCase() : 'pending'}`} aria-live="polite"><div className="risk-copy"><span className="risk-eyebrow"><span className="risk-indicator"/>{t('rainRisk')} | {risk ? t(level.toLowerCase()) : ''}</span><h2>{risk ? t(riskTitle) : t('loading')}</h2><p>{risk ? t(riskHint) : t('loading')}</p><div className="risk-meta"><MapPin size={15}/>{farmer?.villageId?.name || '-'} <span>|</span> {dateShort(farmer?.harvestDate, locale)}</div></div><div className="rain-measure"><span className="rain-measure-label">{t('rainNext24')}</span><div className="rain-reading">{risk ? Math.round(risk.rain24hMm || 0) : '-'}<small>{t('millimetersShort')}</small></div><div className="rain-scale"><span style={{ width: `${Math.min(100, ((risk?.rain24hMm || 0) / 120) * 100)}%` }}/></div><span className="rain-scale-label">0 <span>120 {t('millimetersShort')}</span></span></div><div className="risk-watermark"><CloudRain size={114} strokeWidth={0.8}/></div></section>
    {risk?.fetchedAt && <p className="forecast-meta">{t('weather')} | Open-Meteo | {new Date(risk.fetchedAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>}
     <div className="summary-row"><section className="panel rain-panel"><div className="section-heading"><div><span className="eyebrow">{t('weather')}</span><h2>{t('next7')}</h2></div><span className="soft-icon"><CloudRain size={18}/></span></div><RainChart daily={risk?.daily || []} locale={locale} t={t} /></section>
      <button className="bank-teaser" onClick={() => setPage('bank')}><div className="teaser-top"><span className="teaser-icon"><Droplets size={19}/></span><span className="teaser-link"><ChevronRight size={17}/></span></div><p>{t('yourBank')}</p><strong>{formatNumber(bank?.litres, locale)} <small>{t('litres')}</small></strong><div className="teaser-bottom"><span>{t('insuranceScore')}</span><b>{bank?.score || 0}<small>/100</small></b></div><div className="score-rail"><span style={{ width: `${bank?.score || 0}%` }}/></div></button></div>
    <section className="actions-section"><div className="section-heading actions-heading"><div><span className="eyebrow">{t('dashboard')}</span><h2>{t('fieldPlan')}</h2></div>{plan?.actions?.length > 0 && <span className="action-count">{plan.actions.length} {languageUnit(t, plan.actions.length)}</span>}</div>
      {!plan && busy ? <div className="loading-state"><LoaderCircle className="spin"/> {t('loading')}</div> : null}
      {plan?.actions?.length ? <div className="action-list">{plan.actions.map((action, index) => <ActionCard key={`${action.type}-${index}`} action={action} t={t} locale={locale} language={language} index={index} completed={completed[action.type]} onDone={() => { setCompleted(prev => ({ ...prev, [action.type]: true })); actionDone(action); }} />)}</div> : plan ? <div className="empty-plan"><span><ShieldCheck size={22}/></span><p>{t('noActions')}</p></div> : null}
    </section>
    <div className="home-footer"><button className="demo-button" onClick={() => setDemo(!demo)}><Waves size={17}/>{demo ? t('clearDemo') : t('simulate')}<span>{t('demoBadge')}</span></button>{demo && <span className="demo-note" role="status">{t('simulated')}</span>}<button className="text-link" onClick={() => setPage('bank')}>{t('viewBank')}<ChevronRight size={15}/></button></div>
    <section className="home-extras">
      <HarvestCalendar farmer={farmer} locale={locale} t={t} />
      <CommunityWaterMap villages={waterMap} locale={locale} t={t} />
    </section>
  </>;
}

function HarvestCalendar({ farmer, locale, t }) {
  const harvest = farmer?.harvestDate ? new Date(`${String(farmer.harvestDate).slice(0, 10)}T00:00:00`) : null;
  if (!harvest || Number.isNaN(harvest.getTime())) return null;
  const prep = new Date(harvest); prep.setDate(prep.getDate() - 14);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const events = [{ date: prep, label: t('fieldPlan') }, { date: harvest, label: t('harvestDate') }].filter(event => event.date >= today).sort((a, b) => a.date - b.date);
  return <section className="panel seasonal-calendar"><div className="section-heading"><div><span className="eyebrow">{t('harvestDate')}</span><h2>{t('fieldPlan')}</h2></div><CalendarDays size={19}/></div>
    {events.length ? <ol>{events.map((event, index) => <li key={`${event.label}-${index}`}><time>{event.date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</time><span>{event.label}</span></li>)}</ol> : <p className="chart-empty">{t('noActions')}</p>}
    <p className="calendar-note">{farmer?.villageId?.state} | {farmer?.crop ? t(farmer.crop) : ''}</p>
  </section>;
}

function CommunityWaterMap({ villages, locale, t }) {
  const points = (villages || []).filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)));
  if (!points.length) return null;
  const minLat = Math.min(...points.map(point => Number(point.lat))), maxLat = Math.max(...points.map(point => Number(point.lat)));
  const minLon = Math.min(...points.map(point => Number(point.lon))), maxLon = Math.max(...points.map(point => Number(point.lon)));
  const topVillages = [...points].sort((a, b) => Number(b.reportedStorageM3) - Number(a.reportedStorageM3)).slice(0, 5);
  return <section className="panel community-map"><div className="section-heading"><div><span className="eyebrow">{t('village')}</span><h2>{t('bank')}</h2></div><MapPin size={19}/></div>
    <div className="map-canvas" role="group" aria-label={`${t('village')} ${t('bank')}`}>
      {points.map(point => {
        const left = 8 + (maxLon === minLon ? 50 : (Number(point.lon) - minLon) / (maxLon - minLon) * 84);
        const top = 8 + (maxLat === minLat ? 50 : (maxLat - Number(point.lat)) / (maxLat - minLat) * 84);
        return <span key={point._id} className={`map-marker ${point.riskLevel ? `risk-${point.riskLevel.toLowerCase()}` : ''}`} style={{ left: `${left}%`, top: `${top}%` }} title={`${point.name}: ${point.reportedStorageM3} ${t('cubicMetresShort')}`}><MapPin size={14}/></span>;
      })}
    </div>
    <ul className="community-list">{topVillages.map(point => <li key={point._id}><span><b>{point.name}</b><small>{point.district}</small></span><span>{Number(point.reportedStorageM3).toLocaleString(locale)} {t('cubicMetresShort')}<small>{point.farmers} | {t('farmers')}</small></span></li>)}</ul>
    <p className="calendar-note">{t('rainRisk')} | {t('weather')}</p>
  </section>;
}
function languageUnit(t, count) { return count === undefined ? t('acres') : t('actions'); }

function RainChart({ daily, locale, t }) {
  const max = Math.max(10, ...daily.map(day => Number(day.rainMm || 0)));
  return <div className="rain-chart" role="img" aria-label={daily.map(d => `${dateShort(d.date, locale)}: ${Math.round(d.rainMm)} ${t('millimetersShort')}`).join(', ')}>{daily.length ? daily.slice(0, 7).map((day, index) => <div className="rain-day" key={day.date}><span className="rain-bar-value">{Math.round(day.rainMm)}<i>{t('millimetersShort')}</i></span><div className="rain-bar-track"><span className={day.rainMm >= 64.5 ? 'heavy' : day.rainMm >= 35 ? 'moderate' : ''} style={{ height: `${Math.max(day.rainMm ? 5 : 2, day.rainMm / max * 100)}%` }}/></div><small>{new Date(`${day.date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short' })}</small></div>) : <p className="chart-empty">{t('forecastUnavailable')}</p>}</div>;
}

function ActionCard({ action, t, locale, language, index, completed, onDone }) {
  const icon = action.type === 'BANK_WATER' ? Droplets : action.type === 'HARVEST_EARLY' ? Leaf : action.type === 'OPEN_DRAINS' ? Waves : ShieldCheck;
  const Icon = icon;
  const text = action.text || (action.type === 'ASK_PANCHAYAT' ? t('askPanchayat') : action.type);
  const actionLabels = { HARVEST_EARLY: t('actionHarvest'), OPEN_DRAINS: t('actionDrains'), BANK_WATER: t('actionBank'), ASK_PANCHAYAT: t('actionPanchayat'), PROTECT_STORED_GRAIN: t('actionGrain'), MOVE_EQUIPMENT: t('actionEquipment') };
  return <article className={`action-card ${completed ? 'is-complete' : ''}`}><div className={`action-icon action-icon-${index}`}><Icon size={19}/></div><div className="action-copy"><span className="action-type">{actionLabels[action.type] || action.type}</span><p>{text}</p>{action.standingWaterCm != null && <small>{t('standingWater').replace('{cm}', action.standingWaterCm)}</small>}<ListenButton text={text} language={language} t={t}/></div><button className={`done-button ${completed ? 'checked' : ''}`} onClick={onDone} aria-label={completed ? t('done') : t('markDone')} disabled={completed}>{completed ? <Check size={17}/> : <span className="done-check"/>}<span>{completed ? t('done') : t('markDone')}</span></button></article>;
}

function ListenButton({ text, language, t }) {
  const [voice, setVoice] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const locale = languageOptions.find(option => option.code === language)?.locale || 'en-IN';
  useEffect(() => {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
    const load = () => { const match = window.speechSynthesis.getVoices().find(item => item.lang?.toLowerCase().startsWith(`${language.toLowerCase()}-`)); setVoice(match || null); };
    load(); window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [language]);
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function' || !voice) return null;
  function toggle() {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new window.SpeechSynthesisUtterance(text); if (voice) utterance.voice = voice; utterance.lang = voice?.lang || locale;
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  return <button className="listen-button" type="button" onClick={event => { event.stopPropagation(); toggle(); }} aria-label={speaking ? t('stopListening') : t('listen')}>{speaking ? t('stopListening') : t('listen')}</button>;
}

function BankPage({ t, locale, bank, busy, ledger }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('deposit');
  const [message, setMessage] = useState('');
  const score = Number(bank?.score || 0);
  const label = score < 30 ? t('low') : score <= 70 ? t('medium') : t('strong');
  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setMessage('amountError');
    setMessage(''); await ledger(mode, value); setAmount('');
  }
  return <><div className="page-heading"><div><p className="eyebrow">{t('yourFieldResource')}</p><h1>{t('yourBank')}</h1><p className="heading-sub">{t('bankSubtitle')}</p></div><span className="page-heading-icon"><Droplets size={22}/></span></div>
    <section className="bank-hero"><div className="bank-hero-content"><span className="eyebrow">{t('availableWater')}</span><p className="bank-big-number">{formatNumber(bank?.litres, locale)}<small> {t('litres')}</small></p><div className="bank-volume"><Waves size={16}/>{Number(bank?.balanceM3 || 0).toFixed(1)} {t('cubicMetresShort')} {t('inYourBank')}</div></div><div className="score-gauge" style={{ '--score-angle': `${score * 3.6}deg` }} role="img" aria-label={`${score} / 100, ${label}`}><div><strong>{score}</strong><span>/100</span></div></div><div className="score-caption"><ShieldCheck size={15}/><span>{t('insuranceScore')}</span><b>{label}</b></div></section>
    {bank?.droughtMessage && <div className="dry-card"><span className="dry-icon"><Sun size={22}/></span><div><strong>{t('drySpell')}</strong><p>{formatNumber(bank.droughtMessage.litres, locale)} {t('litres')} | {bank.droughtMessage.days} {t('days')}</p></div></div>}
    <section className="panel ledger-form"><div className="section-heading"><div><span className="eyebrow">{t('waterLedger')}</span><h2>{t('addOrUseWater')}</h2></div></div><div className="ledger-tabs"><button className={mode === 'deposit' ? 'selected' : ''} onClick={() => setMode('deposit')}><ArrowDownToLine size={17}/>{t('deposit')}</button><button className={mode === 'withdraw' ? 'selected' : ''} onClick={() => setMode('withdraw')}><ArrowUpFromLine size={17}/>{t('withdraw')}</button></div><div className="ledger-entry"><label className="visually-hidden" htmlFor="amount-m3">{t('amountM3')}</label><div className="amount-input"><input id="amount-m3" type="number" min="0.1" step="0.1" placeholder="0.0" value={amount} onChange={e => setAmount(e.target.value)} /><span>{t('cubicMetresShort')}</span></div><button className="button-primary" onClick={submit} disabled={busy}>{mode === 'deposit' ? t('deposit') : t('withdraw')}</button></div>{message && <p className="form-error">{t(message)}</p>}</section>
    <section className="ledger-history"><div className="section-heading"><div><span className="eyebrow">{t('recentEntries')}</span><h2>{t('history')}</h2></div><span className="history-count">{bank?.entries?.length || 0}</span></div>{bank?.entries?.length ? <div className="ledger-list">{bank.entries.map(item => <article className={`ledger-row ${item.pending ? 'ledger-pending' : ''}`} key={item._id}><span className={`ledger-type-icon ${item.type.toLowerCase()}`}>{item.type === 'DEPOSIT' ? <ArrowDownToLine size={17}/> : <ArrowUpFromLine size={17}/>}</span><div><strong>{item.type === 'DEPOSIT' ? t('deposit') : t('withdraw')}</strong><small>{new Date(item.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}{item.pending ? ` | ${t('offlineMode')}` : ''}</small></div><b className={item.type === 'DEPOSIT' ? 'positive' : 'negative'}>{item.type === 'DEPOSIT' ? '+' : '-'}{Number(item.m3).toFixed(1)} {t('cubicMetresShort')}</b></article>)}</div> : <div className="empty-plan"><span><Droplets size={21}/></span><p>{t('noEntries')}</p></div>}</section>
  </>;
}

function AlertsPage({ t, alerts, language, busy, readAlert }) {
  const locale = languageOptions.find(option => option.code === language)?.locale || 'en-IN';
  return <><div className="page-heading"><div><p className="eyebrow">{t('fieldUpdates')}</p><h1>{t('alerts')}</h1><p className="heading-sub">{t('alertSubtitle')}</p></div><span className="page-heading-icon"><CloudRain size={21}/></span></div>{busy ? <div className="loading-state"><LoaderCircle className="spin"/>{t('loading')}</div> : alerts.length ? <div className="alert-list">{alerts.map(alert => <article className={`alert-card risk-${alert.riskLevel.toLowerCase()} ${alert.read ? 'read' : ''}`} key={alert._id} onClick={() => !alert.read && readAlert(alert._id)} tabIndex={alert.read ? -1 : 0} onKeyDown={e => { if (e.target === e.currentTarget && !alert.read && (e.key === 'Enter' || e.key === ' ')) readAlert(alert._id); }}><div className="alert-card-top"><span className="alert-risk"><i/>{t(alert.riskLevel.toLowerCase())}{!alert.read && <b>{t('newBadge')}</b>}</span><time>{new Date(alert.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time></div><p>{alert.text}</p><div className="alert-card-footer"><span className="alert-action-count">{alert.actions?.length || 0} {t('fieldActions')}</span><ListenButton text={alert.text} language={language} t={t}/></div></article>)}</div> : <div className="empty-large"><span><BellIcon/></span><h2>{t('alerts')}</h2><p>{t('alertsEmpty')}</p></div>}</>;
}
function BellIcon() { return <CloudRain size={25}/>; }

function SettingsPage({ t, farmer, villages, states, crops, language, setLanguage, saveProfile, busy }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (farmer) setForm({ ...farmer, state: farmer.villageId?.state || '', district: farmer.villageId?.district || '', villageId: farmer.villageId?._id || farmer.villageId, pond: { ...farmer.pond }, tank: { ...farmer.tank }, well: { ...farmer.well }, harvestDate: farmer.harvestDate?.slice(0, 10) }); }, [farmer]);
  if (!form) return <div className="loading-state"><LoaderCircle className="spin"/>{t('loading')}</div>;
  function update(key, value) { setSaved(false); setForm(previous => ({ ...previous, [key]: value })); }
  const selectedState = states.find(item => item.name === form.state);
  const districts = selectedState?.districts || [];
  const availableVillages = villages.filter(v => v.state === form.state && (!form.district || v.district === form.district));
  function chooseState(stateName) { const state = states.find(item => item.name === stateName); update('state', stateName); update('district', ''); update('villageId', ''); if (state?.defaultLanguage) { setLanguage(state.defaultLanguage); update('language', state.defaultLanguage); } }
  function nested(group, key, value) { setSaved(false); setForm(previous => ({ ...previous, [group]: { ...previous[group], [key]: value } })); }
  async function save(e) { e.preventDefault(); const ok = await saveProfile(form); setSaved(ok); }
  return <><div className="page-heading"><div><p className="eyebrow">{t('yourInformation')}</p><h1>{t('settings')}</h1><p className="heading-sub">{t('setupHint')}</p></div><span className="page-heading-icon"><Leaf size={21}/></span></div><form className="panel settings-form" onSubmit={save}><section><span className="eyebrow">{t('personal')}</span><div className="field-grid"><label>{t('name')}<input value={form.name || ''} onChange={e => update('name', e.target.value)} /></label><label>{t('phone')}<input type="tel" value={form.phone || ''} disabled /></label><label>{t('language')}<select value={language} onChange={e => { setLanguage(e.target.value); update('language', e.target.value); }}>{languageOptions.map(option => <option key={option.code} value={option.code}>{option.nativeName}</option>)}</select></label></div></section><section><span className="eyebrow">{t('yourField')}</span><div className="field-grid"><label>{t('state')}<select value={form.state || ''} onChange={e => chooseState(e.target.value)}><option value="">{t('chooseState')}</option>{states.map(item => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label><label>{t('district')}<select value={form.district || ''} disabled={!form.state} onChange={e => { update('district', e.target.value); update('villageId', ''); }}><option value="">{t('chooseDistrict')}</option>{districts.map(name => <option value={name} key={name}>{name}</option>)}</select></label><label>{t('village')}<select value={form.villageId || ''} onChange={e => update('villageId', e.target.value)}>{availableVillages.map(v => <option value={v._id} key={v._id}>{v.name}</option>)}</select></label><label>{t('crop')}<select value={form.crop} onChange={e => update('crop', e.target.value)}>{Object.entries(crops).map(([key, crop]) => <option value={key} key={key}>{t(key) || (key === 'other' ? t('genericCrop') : crop.label)}</option>)}</select></label><label>{t('harvestDate')}<input type="date" value={form.harvestDate || ''} onChange={e => update('harvestDate', e.target.value)} /></label><label>{t('area')}<input type="number" min="0.1" step="0.1" value={form.areaAcres} onChange={e => update('areaAcres', e.target.value)} /></label><label>{t('drain')}<select value={form.drainDirection} onChange={e => update('drainDirection', e.target.value)}>{['N','S','E','W'].map(d => <option value={d} key={d}>{t(({N:'north',S:'south',E:'east',W:'west'})[d])}</option>)}</select></label></div></section><section><span className="eyebrow">{t('waterStorage')}</span><div className="settings-checks"><label className="check-field"><input type="checkbox" checked={form.pond?.has} onChange={e => nested('pond', 'has', e.target.checked)} />{t('pond')}</label>{form.pond?.has && <label>{t('capacity')}<input type="number" value={form.pond.capacityM3} onChange={e => nested('pond', 'capacityM3', e.target.value)} /></label>}<label className="check-field"><input type="checkbox" checked={form.tank?.has} onChange={e => nested('tank', 'has', e.target.checked)} />{t('tank')}</label>{form.tank?.has && <label>{t('tankName')}<input value={form.tank.name || ''} onChange={e => nested('tank', 'name', e.target.value)} /></label>}<label className="check-field"><input type="checkbox" checked={form.well?.has} onChange={e => nested('well', 'has', e.target.checked)} />{t('well')}</label></div></section><div className="settings-save"><span>{saved ? t('saved') : ''}</span><button className="button-primary" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={17}/>}<Check size={17}/>{t('save')}</button></div></form></>;
}
