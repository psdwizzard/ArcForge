const fs = require('fs');
const path = require('path');
const { imageSize } = require('image-size');

const { ATLAS_SETTINGS_PATH, MAPS_DB_PATH, ROOT_DIR } = require('../config/constants');
const { writeJsonFile } = require('../utils/fileUtils');
const { computePixelsPerInch } = require('../utils/mathUtils');
const { atlasState, applyStartAreaViewport, ensureAtlasDefaults } = require('../services/atlasService');
const { generateId } = require('../utils/idGenerator');

function registerAtlasRoutes(app, {
  mapUpload,
  broadcastDisplayState,
  setActiveFlavorMedia,
  clearActiveFlavorMedia,
  displayState
}) {
  app.get('/api/atlas/displays', (req, res) => {
    const sockets = Array.from(app.locals.displayIo.sockets.sockets.values()).map((socket) => ({
      id: socket.id,
      handshake: {
        address: socket.handshake.address,
        issued: socket.handshake.issued
      }
    }));
    res.json({ count: sockets.length, displays: sockets });
  });

  app.get('/api/maps', (req, res) => {
    res.json(atlasState.mapsState);
  });

  app.post('/api/maps', (req, res) => {
    mapUpload.single('file')(req, res, (err) => {
      if (err) {
        console.error('[Atlas] Multer error during map upload:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
        }
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      try {
        const storedPath = path.join(req.file.destination, req.file.filename);
        let dimensions = null;

        try {
          dimensions = imageSize(storedPath);
        } catch (dimError) {
          console.warn('[Atlas] Could not determine image size from path:', dimError.message);
        }

        const record = {
          id: generateId('map'),
          name: req.body?.name || path.parse(req.file.originalname).name,
          file: `/maps/${req.file.filename}`,
          width_px: dimensions?.width ?? null,
          height_px: dimensions?.height ?? null,
          created_at: new Date().toISOString(),
          meta: req.body?.meta || {}
        };

        console.log('[Atlas] Uploading map:', record.name, 'Size:', dimensions ? `${dimensions.width}x${dimensions.height}` : 'unknown');

        atlasState.mapsState.push(record);
        writeJsonFile(MAPS_DB_PATH, atlasState.mapsState);

        try {
          broadcastDisplayState();
        } catch (broadcastError) {
          console.warn('[Atlas] Failed to broadcast display state after map upload:', broadcastError.message);
        }

        res.json(record);
      } catch (error) {
        console.error('[Atlas] Failed to process uploaded map:', error);
        res.status(500).json({ error: 'Failed to process map' });
      }
    });
  });

  app.patch('/api/maps/:id', (req, res) => {
    const target = atlasState.mapsState.find((entry) => entry.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Map not found' });
    }

    if (req.body?.name) {
      target.name = req.body.name;
    }
    if (req.body?.meta) {
      target.meta = {
        ...target.meta,
        ...req.body.meta
      };
    }

    writeJsonFile(MAPS_DB_PATH, atlasState.mapsState);

    if (atlasState.atlasSettings.active_map_id === req.params.id) {
      applyStartAreaViewport({ enforce: true });
      writeJsonFile(ATLAS_SETTINGS_PATH, atlasState.atlasSettings);
      broadcastDisplayState();
    }

    res.json(target);
  });

  app.delete('/api/maps/:id', (req, res) => {
    const index = atlasState.mapsState.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const [removed] = atlasState.mapsState.splice(index, 1);
    if (removed && removed.file) {
      try {
        const filesystemPath = path.join(ROOT_DIR, removed.file.replace(/^\//, ''));
        if (fs.existsSync(filesystemPath)) {
          fs.unlinkSync(filesystemPath);
        }
      } catch (error) {
        console.error('[Atlas] Failed to delete map file from disk:', error);
      }
    }

    if (atlasState.atlasSettings.active_map_id === req.params.id) {
      atlasState.atlasSettings.active_map_id = null;
      applyStartAreaViewport({ enforce: true });
      writeJsonFile(ATLAS_SETTINGS_PATH, atlasState.atlasSettings);
      broadcastDisplayState();
    }

    writeJsonFile(MAPS_DB_PATH, atlasState.mapsState);
    res.json({ success: true });
  });

  app.get('/api/atlas/settings', (req, res) => {
    res.json(atlasState.atlasSettings);
  });

  app.patch('/api/atlas/settings', (req, res) => {
    function deepMerge(target, source) {
      const output = { ...target };
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          output[key] = deepMerge(target[key] || {}, source[key]);
        } else {
          output[key] = source[key];
        }
      }
      return output;
    }

    atlasState.atlasSettings = deepMerge(atlasState.atlasSettings, req.body);

    ensureAtlasDefaults();

    const isViewportOnlyUpdate = req.body?.display?.viewport && !req.body?.encounter && !req.body?.display?.grid && !req.body?.display?.resolution;
    const isCosmeticDisplayUpdate = Boolean(
      req.body?.display
      && !req.body?.encounter
      && !req.body?.display?.viewport
      && !req.body?.display?.grid
      && !req.body?.display?.resolution
      && !req.body?.active_map_id
    );

    console.log('[PATCH /api/atlas/settings] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[PATCH /api/atlas/settings] isViewportOnlyUpdate:', isViewportOnlyUpdate);
    console.log('[PATCH /api/atlas/settings] Current viewport.zoom:', atlasState.atlasSettings.display?.viewport?.zoom);

    if (req.body?.encounter) {
      console.log('[PATCH /api/atlas/settings] Applying start area viewport (encounter changed)');
      applyStartAreaViewport({ enforce: true });
    } else if (!isViewportOnlyUpdate && !isCosmeticDisplayUpdate) {
      console.log('[PATCH /api/atlas/settings] Applying start area viewport (not viewport-only update)');
      applyStartAreaViewport();
    } else {
      console.log('[PATCH /api/atlas/settings] Skipping start area viewport (viewport-only or cosmetic display update)');
    }

    if (!atlasState.atlasSettings.display?.physical?.ppi_override) {
      const computed = computePixelsPerInch(
        atlasState.atlasSettings.display?.resolution,
        atlasState.atlasSettings.display?.physical?.diagonal_in
      );
      atlasState.atlasSettings.display.physical.ppi_override = null;
      atlasState.atlasSettings.display.grid = atlasState.atlasSettings.display.grid || {};
      atlasState.atlasSettings.display.grid.pixels_per_inch = computed;
    }

    writeJsonFile(ATLAS_SETTINGS_PATH, atlasState.atlasSettings);
    broadcastDisplayState();
    res.json(atlasState.atlasSettings);
  });

  app.post('/api/atlas/active-map', (req, res) => {
    const { mapId, applyStartArea } = req.body || {};
    if (!mapId) {
      return res.status(400).json({ error: 'mapId is required' });
    }

    const target = atlasState.mapsState.find((entry) => entry.id === mapId);
    if (!target) {
      return res.status(404).json({ error: 'Map not found' });
    }

    atlasState.atlasSettings.active_map_id = mapId;

    if (applyStartArea) {
      applyStartAreaViewport({ enforce: true });
    }

    writeJsonFile(ATLAS_SETTINGS_PATH, atlasState.atlasSettings);
    broadcastDisplayState();

    res.json(target);
  });

  app.post('/api/flavor-media', mapUpload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const record = {
        id: generateId('flavor'),
        name: req.body?.name || path.parse(req.file.originalname).name,
        file: `/maps/${req.file.filename}`,
        created_at: new Date().toISOString()
      };

      res.json(record);
    } catch (error) {
      console.error('[FlavorMedia] Failed to process uploaded file:', error);
      res.status(500).json({ error: 'Failed to process file' });
    }
  });

  app.post('/api/atlas/flavor-media/show', (req, res) => {
    const { imagePath } = req.body;

    if (!imagePath) {
      return res.status(400).json({ error: 'imagePath is required' });
    }

    const activeFlavorMedia = setActiveFlavorMedia(imagePath);
    console.log('[FlavorMedia] Showing to players:', imagePath);

    broadcastDisplayState();
    res.json({ success: true, activeFlavorMedia });
  });

  app.post('/api/atlas/flavor-media/hide', (req, res) => {
    console.log('[FlavorMedia] Hiding from players');
    clearActiveFlavorMedia();

    broadcastDisplayState();
    res.json({ success: true, activeFlavorMedia: displayState.activeFlavorMedia });
  });
}

module.exports = {
  registerAtlasRoutes
};
