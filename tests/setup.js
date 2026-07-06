// Runs before each test file is imported. Points the JSON store at a unique
// temp directory so tests never touch the real data/db.json.
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rinkscreens-test-'));
process.env.RINKSCREENS_DATA_DIR = dir;
