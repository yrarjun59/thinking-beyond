import React, { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';

const SETTINGS_KEY = 'thinking-beyond-admin-settings';
const fallback = {
  site: { name: 'Thinking Beyond', host: 'Manisha Neupane', tagline: 'Many questions. One deeper purpose.', description: '', logo: '' },
  sponsor: { name: 'Golden Tech International', url: 'http://goldeninternational.tech/', logo: '' },
  social: []
};

function readSettings() {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return fallback; }
}

export default function AdminPanel() {
  const saved = readSettings();
  const [site, setSite] = useState({ ...fallback.site, ...(saved.site || {}) });
  const [sponsors, setSponsors] = useState(saved.sponsors || (saved.sponsor ? [saved.sponsor] : [fallback.sponsor]));
  const [social, setSocial] = useState(saved.social || []);
  const [status, setStatus] = useState('');
  const setSiteValue = (key, value) => setSite(current => ({ ...current, [key]: value }));
  const setRow = (setter, index, key, value) => setter(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  function save() {
    const current = readSettings();
    const next = { ...current, site, sponsors, sponsor: sponsors[0] || null, social };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('thinking-beyond-settings'));
    setStatus('Saved in this browser. Export settings from the main admin panel to publish.');
  }
  return <main className="inner admin-page">
    <div className="admin-heading"><div><span className="eyebrow">THINKING BEYOND / MEDIA</span><h1>Brand assets.</h1><p>Manage logos and sponsor credits used throughout the site.</p></div><span className="admin-local-badge">BROWSER DRAFT</span></div>
    <section className="admin-card"><div className="admin-card-heading"><div><span className="eyebrow">01 / SITE BRAND</span><h2>Site logo and identity</h2></div></div><div className="admin-fields-two"><label>Site name<input value={site.name || ''} onChange={e => setSiteValue('name', e.target.value)} /></label><label>Host name<input value={site.host || ''} onChange={e => setSiteValue('host', e.target.value)} /></label><label className="admin-wide-field">Logo URL<input value={site.logo || ''} onChange={e => setSiteValue('logo', e.target.value)} placeholder="https://…/logo.png" /></label><label className="admin-wide-field">Footer tagline<input value={site.tagline || ''} onChange={e => setSiteValue('tagline', e.target.value)} /></label></div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><span className="eyebrow">02 / SPONSORS</span><h2>Sponsor credits</h2></div><button className="admin-secondary" onClick={() => setSponsors(rows => [...rows, { name: '', url: '', logo: '' }])}><Plus size={16}/> Add sponsor</button></div><div className="admin-content-list">{sponsors.map((sponsor, index) => <div className="admin-content-row sponsor-admin-row" key={index}><label>Name<input value={sponsor.name || ''} onChange={e => setRow(setSponsors, index, 'name', e.target.value)} placeholder="Sponsor name" /></label><label>Website<input value={sponsor.url || ''} onChange={e => setRow(setSponsors, index, 'url', e.target.value)} placeholder="https://…" /></label><label>Logo URL<input value={sponsor.logo || ''} onChange={e => setRow(setSponsors, index, 'logo', e.target.value)} placeholder="https://…/logo.svg" /></label><button className="admin-icon-button" onClick={() => setSponsors(rows => rows.filter((_, i) => i !== index))} aria-label="Delete sponsor"><Trash2 size={17}/></button></div>)}</div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><span className="eyebrow">03 / SOCIAL</span><h2>Social links and icons</h2></div><button className="admin-secondary" onClick={() => setSocial(rows => [...rows, { id: `social-${Date.now()}`, label: '', url: '', icon: '' }])}><Plus size={16}/> Add social link</button></div><div className="admin-content-list">{social.map((item, index) => <div className="admin-content-row sponsor-admin-row" key={`${item.id || 'social'}-${index}`}><label>Label<input value={item.label || ''} onChange={e => setRow(setSocial, index, 'label', e.target.value)} placeholder="Instagram" /></label><label>URL<input value={item.url || ''} onChange={e => setRow(setSocial, index, 'url', e.target.value)} placeholder="https://…" /></label><label>Icon URL<input value={item.icon || ''} onChange={e => setRow(setSocial, index, 'icon', e.target.value)} placeholder="Optional custom icon URL" /></label><button className="admin-icon-button" onClick={() => setSocial(rows => rows.filter((_, i) => i !== index))} aria-label="Delete social link"><Trash2 size={17}/></button></div>)}</div></section>
    <div className="admin-savebar"><p role="status">{status}</p><button className="contact-submit" onClick={save}><Save size={16}/> Save media settings</button></div>
  </main>;
}
