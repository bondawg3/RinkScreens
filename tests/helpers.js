// Shared test helpers. Import order matters: tests/setup.js has already set
// RINKSCREENS_DATA_DIR before any server module loads.
import fs from 'fs';
import path from 'path';

export function resetDb() {
  const file = path.join(process.env.RINKSCREENS_DATA_DIR, 'db.json');
  for (const f of [file, `${file}.bak`, `${file}.tmp`, `${file}.corrupt`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

export function dbFilePath() {
  return path.join(process.env.RINKSCREENS_DATA_DIR, 'db.json');
}
