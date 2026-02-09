const { registerAtlasRoutes } = require('./atlasRoutes');
const { registerCharacterRoutes } = require('./characterRoutes');
const { registerCombatRoutes } = require('./combatRoutes');
const { registerCreatureRoutes } = require('./creatureRoutes');
const { registerDevRoutes } = require('./devRoutes');
const { registerEffectRoutes } = require('./effectRoutes');
const { registerSessionRoutes } = require('./sessionRoutes');

function registerRoutes(app, dependencies) {
  const {
    upload,
    mapUpload,
    broadcastDisplayState,
    setActiveFlavorMedia,
    clearActiveFlavorMedia,
    displayState
  } = dependencies;

  registerCreatureRoutes(app);
  registerCharacterRoutes(app, { upload });
  registerEffectRoutes(app);
  registerAtlasRoutes(app, {
    mapUpload,
    broadcastDisplayState,
    setActiveFlavorMedia,
    clearActiveFlavorMedia,
    displayState
  });
  registerCombatRoutes(app, { broadcastDisplayState });
  registerSessionRoutes(app, { broadcastDisplayState });
  registerDevRoutes(app);
}

module.exports = {
  registerRoutes
};
