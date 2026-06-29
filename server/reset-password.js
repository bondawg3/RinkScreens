/**
 * Emergency admin password reset.
 * Run from the project root:  node server/reset-password.js
 * Then open /login in the browser — the setup form will appear.
 */
const db = require('./db');
db.setSetting('admin_password_hash', '');
console.log('Admin password cleared. Open /login to set a new password.');
