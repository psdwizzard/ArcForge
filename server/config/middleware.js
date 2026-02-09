const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const path = require('path');

const {
  DATA_DIR,
  MAPS_DIR,
  DISPLAY_PUBLIC_DIR,
  PUBLIC_DIR,
  UPLOADS_DIR,
  CREATURE_LIBRARY_DIR,
  DB_ASSETS_DIR
} = require('./constants');

function configureControlApp(app) {
  app.use(cors());
  app.use(bodyParser.json());

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Expires', '0');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use(express.static(PUBLIC_DIR));
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/db-assets', express.static(DB_ASSETS_DIR));
  app.use('/data/creatures/library', express.static(CREATURE_LIBRARY_DIR));
  app.use('/data', express.static(DATA_DIR));
  app.use('/maps', express.static(MAPS_DIR));
}

function configureDisplayApp(app) {
  app.use(express.static(DISPLAY_PUBLIC_DIR));
  app.use('/maps', express.static(MAPS_DIR));
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/data/creatures/library', express.static(CREATURE_LIBRARY_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DISPLAY_PUBLIC_DIR, 'index.html'));
  });
}

module.exports = {
  configureControlApp,
  configureDisplayApp
};
