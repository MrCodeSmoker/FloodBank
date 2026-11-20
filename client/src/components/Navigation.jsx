import { Home, Droplets, Bell, Settings, Waves } from 'lucide-react';

export default function Navigation({ page, setPage, t, unread = 0, stateName }) {
  const items = [
    { id: 'home', icon: Home, label: t('home') }, { id: 'bank', icon: Droplets, label: t('bank') },
    { id: 'alerts', icon: Bell, label: t('alerts') }, { id: 'settings', icon: Settings, label: t('settings') }
  ];
  return <nav className="nav" aria-label={t('mainNavigation')}>
    <div className="nav-brand"><span className="brand-mark"><Droplets size={20} /></span><span>Flood<span>Bank</span></span></div>
    <p className="nav-caption">{t('fieldTools')}</p>
    {items.map(({ id, icon: Icon, label }) => <button key={id} className={`nav-item ${page === id ? 'selected' : ''}`} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}>
      <Icon size={19} strokeWidth={1.8} /><span>{label}</span>{id === 'alerts' && unread > 0 && <b className="nav-count">{unread}</b>}
    </button>)}
    <div className="nav-note"><div className="nav-note-icon"><Waves size={18} /></div><strong>{t('tagline')}</strong><span>{t('navNote', { state: stateName })}</span></div>
  </nav>;
}
