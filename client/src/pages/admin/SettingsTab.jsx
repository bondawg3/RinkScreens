import React, { useEffect, useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';

export default function SettingsTab() {
  const { data: settings, reload } = useApi('/settings');
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  async function save(e) {
    e.preventDefault();
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(form) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    reload();
  }

  const field = (key, label, props = {}) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        className={styles.input}
        value={form[key] ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </div>
  );

  return (
    <div>
      <h2 className={styles.heading}>Settings</h2>
      <form onSubmit={save} className={styles.settingsForm}>
        {field('rink_name', 'Rink Name', { placeholder: 'Ice Rink' })}
        {field('ical_url', 'Google Calendar iCal URL', {
          placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics',
          type: 'url',
        })}
        {field('skate_keyword', 'Public Skate Keyword', {
          placeholder: 'Public Skate',
        })}
        {field('poll_interval_minutes', 'Calendar Poll Interval (minutes)', {
          type: 'number', min: 1,
        })}
        <div className={styles.formFooter}>
          <button className={styles.btnPrimary} type="submit">Save Settings</button>
          {saved && <span className={styles.savedMsg}>Saved!</span>}
        </div>
      </form>

      <div className={styles.infoBox}>
        <h3>How to get your iCal URL</h3>
        <ol>
          <li>Open Google Calendar and find your calendar in the left sidebar.</li>
          <li>Click the three dots next to the calendar name → <strong>Settings and sharing</strong>.</li>
          <li>Scroll to <strong>Integrate calendar</strong> → copy the <strong>Secret address in iCal format</strong> (or the public iCal URL if the calendar is public).</li>
          <li>Paste it above and save.</li>
        </ol>
      </div>
    </div>
  );
}
