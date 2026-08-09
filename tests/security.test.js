import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { assertPublicUrl, ipBlocked } from '../server/safe-url.js';

// Point the uploads dir at a throwaway temp dir BEFORE loading backup.js, so
// the zip-slip test exercises the real restore path without touching the
// project's actual uploads/ folder.
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rinkscreens-uploads-'));
process.env.RINKSCREENS_UPLOAD_DIR = uploadDir;

const backup = await import('../server/backup.js');
const { restoreFromZip } = backup.default || backup;

describe('backup restore zip-slip guard', () => {
  let escapeTarget;

  beforeEach(() => {
    fs.mkdirSync(uploadDir, { recursive: true });
    // A sentinel file one level above the uploads dir that a malicious entry
    // would try to overwrite via "uploads/../evil.txt".
    escapeTarget = path.join(path.dirname(uploadDir), 'zipslip-evil.txt');
    if (fs.existsSync(escapeTarget)) fs.unlinkSync(escapeTarget);
  });

  afterEach(() => {
    if (fs.existsSync(escapeTarget)) fs.unlinkSync(escapeTarget);
  });

  it('does not write entries that escape the uploads dir', () => {
    const zip = new AdmZip();
    zip.addFile('db.json', Buffer.from(JSON.stringify({ settings: {} })));
    // Legit file (should land) + traversal file (should be skipped).
    zip.addFile('uploads/logo.png', Buffer.from('good'));
    zip.addFile('uploads/../zipslip-evil.txt', Buffer.from('pwned'));
    const zipPath = path.join(uploadDir, '..', 'malicious.zip');
    fs.writeFileSync(zipPath, zip.toBuffer());

    restoreFromZip(zipPath);

    expect(fs.existsSync(escapeTarget)).toBe(false);
    expect(fs.existsSync(path.join(uploadDir, 'logo.png'))).toBe(true);

    fs.unlinkSync(zipPath);
  });
});

describe('SSRF guard (safe-url)', () => {
  it('blocks loopback, private, and link-local IPs', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1',
      '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(ipBlocked(ip), ip).toBe(true);
    }
  });

  it('allows ordinary public IPs', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '1.1.1.1', '2606:2800:220:1::']) {
      expect(ipBlocked(ip), ip).toBe(false);
    }
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/scheme/);
    await expect(assertPublicUrl('gopher://x/')).rejects.toThrow(/scheme/);
  });

  it('rejects URLs whose host is an internal address (no DNS needed)', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/internal/);
    await expect(assertPublicUrl('http://127.0.0.1:3001/api/settings')).rejects.toThrow(/internal/);
  });

  it('rejects a hostname that resolves to loopback', async () => {
    await expect(assertPublicUrl('http://localhost:3001/')).rejects.toThrow(/internal/);
  });

  it('accepts a public bare-IP URL and returns it normalized', async () => {
    await expect(assertPublicUrl('http://93.184.216.34/x')).resolves.toBe('http://93.184.216.34/x');
  });
});
