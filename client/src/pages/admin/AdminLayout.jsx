import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import styles from './AdminLayout.module.css';
import { clearToken } from '../../hooks/useApi';

const tabs = [
  { to: 'screens', label: 'Screens' },
  { to: 'games', label: 'Games' },
  { to: 'rink-events', label: 'Rink Events' },
  { to: 'skate', label: 'Public Skate' },
  { to: 'leagues', label: 'Leagues' },
  { to: 'backgrounds', label: 'Backgrounds' },
  { to: 'settings', label: 'Calendars' },
  { to: 'rink-settings', label: 'Settings' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  function logout() { clearToken(); navigate('/login'); }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.logo}>RinkScreens</span>
        <span className={styles.subtitle}>Admin Dashboard</span>
        <button className={styles.logoutBtn} onClick={logout}>Log out</button>
      </header>
      <nav className={styles.nav}>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              styles.tab + (isActive ? ' ' + styles.active : '')
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
      <div className={styles.buildInfo}>
        v{__APP_VERSION__} — {__BUILD_DATE__}
      </div>
    </div>
  );
}
