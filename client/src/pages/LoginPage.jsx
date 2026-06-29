import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, getToken } from '../hooks/useApi';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [configured, setConfigured] = useState(null); // null = loading
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/check', {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          navigate('/admin', { replace: true });
        } else {
          setConfigured(data.configured);
        }
      })
      .catch(() => setConfigured(true));
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!configured && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const endpoint = configured ? '/api/auth/login' : '/api/auth/setup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setToken(data.token);
      navigate('/admin', { replace: true });
    } catch {
      setError('Could not connect to the server.');
    } finally {
      setSubmitting(false);
    }
  }

  if (configured === null) {
    return <div className={styles.wrap}><div className={styles.card}><p className={styles.loading}>Loading…</p></div></div>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo}>RinkScreens</div>
        <h1 className={styles.title}>
          {configured ? 'Admin Login' : 'Create Admin Password'}
        </h1>
        {!configured && (
          <p className={styles.hint}>Set a password to protect the admin panel.</p>
        )}
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
          {!configured && (
            <input
              className={styles.input}
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          )}
          {error && <div className={styles.error}>{error}</div>}
          <button className={styles.btn} type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : configured ? 'Log In' : 'Set Password & Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}
