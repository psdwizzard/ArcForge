const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DISPLAY_PORT = 3001;

const ROOT_DIR = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MAPS_DIR = path.join(ROOT_DIR, 'maps');
const ENCOUNTERS_DIR = path.join(DATA_DIR, 'encounters');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DISPLAY_PUBLIC_DIR = path.join(ROOT_DIR, 'public-display');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const CREATURE_LIBRARY_DIR = path.join(DATA_DIR, 'creatures', 'library');
const DB_ASSETS_DIR = path.join(DATA_DIR, 'DBs');
const MAPS_DB_PATH = path.join(DATA_DIR, 'maps.json');
const ATLAS_SETTINGS_PATH = path.join(DATA_DIR, 'atlas_settings.json');

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(MAPS_DIR, { recursive: true });
  fs.mkdirSync(ENCOUNTERS_DIR, { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.mkdirSync(DISPLAY_PUBLIC_DIR, { recursive: true });
}

module.exports = {
  PORT,
  DISPLAY_PORT,
  ROOT_DIR,
  DATA_DIR,
  MAPS_DIR,
  ENCOUNTERS_DIR,
  SESSIONS_DIR,
  DISPLAY_PUBLIC_DIR,
  PUBLIC_DIR,
  UPLOADS_DIR,
  CREATURE_LIBRARY_DIR,
  DB_ASSETS_DIR,
  MAPS_DB_PATH,
  ATLAS_SETTINGS_PATH,
  ensureDirectories
};
