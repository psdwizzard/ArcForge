const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const {
  PORT,
  DISPLAY_PORT,
  ATLAS_SETTINGS_PATH,
  ensureDirectories
} = require('./config/constants');
const { configureControlApp, configureDisplayApp } = require('./config/middleware');
const { upload, mapUpload } = require('./config/multer');
const { writeJsonFile } = require('./utils/fileUtils');
const {
  atlasState,
  ensureAtlasDefaults,
  applyStartAreaViewport
} = require('./services/atlasService');
const {
  displayState,
  buildDisplayState,
  incrementDisplayConnections,
  decrementDisplayConnections,
  setActiveFlavorMedia,
  clearActiveFlavorMedia
} = require('./services/displayService');
const { createDefaultSessionIfMissing } = require('./services/sessionService');
const { registerRoutes } = require('./routes');
const { registerSocketHandlers } = require('./socket/socketHandlers');

const app = express();
const displayApp = express();

ensureDirectories();
configureDisplayApp(displayApp);
configureControlApp(app);

ensureAtlasDefaults();

applyStartAreaViewport({ enforce: true });
// Socket.IO setup for display broadcast
const controlServer = http.createServer(app);
const mainIo = new Server(controlServer, {
  cors: {
    origin: '*'
  }
});

const displayServer = http.createServer(displayApp);
const displayIo = new Server(displayServer, {
  cors: {
    origin: '*'
  }
});
app.locals.displayIo = displayIo;

function broadcastDisplayState() {
  const payload = buildDisplayState();
  mainIo.emit('display:state', payload);
  displayIo.emit('display:state', payload);
}

registerRoutes(app, {
  upload,
  mapUpload,
  broadcastDisplayState,
  setActiveFlavorMedia,
  clearActiveFlavorMedia,
  displayState
});

registerSocketHandlers({
  mainIo,
  displayIo,
  atlasState,
  writeJsonFile,
  atlasSettingsPath: ATLAS_SETTINGS_PATH,
  buildDisplayState,
  broadcastDisplayState,
  incrementDisplayConnections,
  decrementDisplayConnections
});
// Start server
controlServer.listen(PORT, () => {
  const address = `http://${process.env.HOSTNAME || 'localhost'}:${PORT}`;
  console.log(`ArcForge control server listening on ${address}`);
  createDefaultSessionIfMissing();
});

displayServer.listen(DISPLAY_PORT, () => {
  console.log(`ArcForge display server listening on port ${DISPLAY_PORT}`);
});












