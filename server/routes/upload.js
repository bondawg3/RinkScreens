const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../auth');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `bg_${Date.now()}${ext}`);
  },
});

// Extension must match the declared MIME type (defense against renamed files)
const IMAGE_MIMES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function imageFilter(allowedExts) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowedExts.includes(ext) && file.mimetype === IMAGE_MIMES[ext]);
  };
}

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: imageFilter(['.jpg', '.jpeg', '.png', '.gif', '.webp']),
});

router.post('/backgrounds', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no valid image file' });
  const label = req.body.label || req.file.originalname;
  const image_type = req.body.image_type === 'general' ? 'general' : 'background';
  const row = db.insert('backgrounds', { filename: req.file.filename, label, image_type });
  res.json({ id: row.id, filename: row.filename, label: row.label, image_type: row.image_type });
});

const logoStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo_${Date.now()}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']),
});

router.post('/logo', requireAuth, logoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no valid image file' });
  const old = db.getSettings().logo_filename;
  if (old) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, old)); } catch (_) {}
  }
  db.setSetting('logo_filename', req.file.filename);
  res.json({ filename: req.file.filename });
});

const feedLogoStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `feedlogo_${Date.now()}${ext}`);
  },
});

const feedLogoUpload = multer({
  storage: feedLogoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']),
});

// An uploaded logo supersedes a linked one — clears logo_url so the two
// sources (upload vs. link) never disagree about which one is "the" logo.
router.post('/rss-feeds/:id/logo', requireAuth, feedLogoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no valid image file' });
  const feed = db.findById('rss_feeds', req.params.id);
  if (!feed) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(404).json({ error: 'not found' });
  }
  if (feed.logo_filename) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, feed.logo_filename)); } catch (_) {}
  }
  db.update('rss_feeds', req.params.id, { logo_filename: req.file.filename, logo_url: '' });
  res.json({ filename: req.file.filename });
});

module.exports = router;
