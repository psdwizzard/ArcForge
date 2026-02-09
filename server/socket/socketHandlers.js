function registerSocketHandlers({
  mainIo,
  displayIo,
  atlasState,
  writeJsonFile,
  atlasSettingsPath,
  buildDisplayState,
  broadcastDisplayState,
  incrementDisplayConnections,
  decrementDisplayConnections
}) {
  mainIo.on('connection', (socket) => {
    socket.on('display:hello', (payload) => {
      if (payload && payload.resolution) {
        atlasState.atlasSettings.display = atlasState.atlasSettings.display || {};
        atlasState.atlasSettings.display.resolution = payload.resolution;
        writeJsonFile(atlasSettingsPath, atlasState.atlasSettings);
      }
      socket.emit('display:state', buildDisplayState());
    });

    socket.on('settings:ui-scale', (payload) => {
      displayIo.emit('settings:ui-scale', payload);
    });
  });

  displayIo.on('connection', (socket) => {
    incrementDisplayConnections();
    socket.on('display:hello', (payload) => {
      if (payload && payload.resolution) {
        atlasState.atlasSettings.display = atlasState.atlasSettings.display || {};
        atlasState.atlasSettings.display.resolution = payload.resolution;
        writeJsonFile(atlasSettingsPath, atlasState.atlasSettings);
      }
      socket.emit('display:state', buildDisplayState());
      broadcastDisplayState();
    });
    socket.on('disconnect', () => {
      decrementDisplayConnections();
      broadcastDisplayState();
    });
  });
}

module.exports = {
  registerSocketHandlers
};
