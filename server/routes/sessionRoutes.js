const { atlasState } = require('../services/atlasService');
const { hydrateCurrentEncounterFromSource } = require('../services/encounterService');
const {
  listSessions,
  loadSession,
  deleteSession,
  createOrUpdateSession,
  createEncounter,
  getEncounter,
  updateEncounter,
  deleteEncounter
} = require('../services/sessionService');

function registerSessionRoutes(app, { broadcastDisplayState }) {
  app.get('/api/sessions', (req, res) => {
    res.json(listSessions());
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = loadSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  });

  app.post('/api/sessions', (req, res) => {
    const session = createOrUpdateSession(req.body);
    res.json(session);
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const deleted = deleteSession(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ message: 'Session deleted' });
  });

  app.post('/api/sessions/:sessionId/encounters', (req, res) => {
    const result = createEncounter(req.params.sessionId, req.body);
    if (result.error === 'session-not-found') {
      return res.status(404).json({ error: 'Session not found' });
    }

    try {
      atlasState.currentSessionEncounter = result.encounter;
      hydrateCurrentEncounterFromSource(result.encounter);
      broadcastDisplayState();
    } catch (e) {
      console.warn('[Sessions] Failed to hydrate new encounter into server state:', e);
    }

    res.json(result.encounter);
  });

  app.get('/api/sessions/:sessionId/encounters/:encounterId', (req, res) => {
    const result = getEncounter(req.params.sessionId, req.params.encounterId);
    if (result.error === 'session-not-found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (result.error === 'encounter-not-found') {
      return res.status(404).json({ error: 'Encounter not found' });
    }

    atlasState.currentSessionEncounter = result.encounter;
    hydrateCurrentEncounterFromSource(result.encounter);
    broadcastDisplayState();

    res.json(result.encounter);
  });

  app.put('/api/sessions/:sessionId/encounters/:encounterId', (req, res) => {
    const result = updateEncounter(req.params.sessionId, req.params.encounterId, req.body);
    if (result.error === 'session-not-found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (result.error === 'encounter-not-found') {
      return res.status(404).json({ error: 'Encounter not found' });
    }

    atlasState.currentSessionEncounter = result.encounter;
    hydrateCurrentEncounterFromSource(atlasState.currentSessionEncounter);

    broadcastDisplayState();

    res.json(result.encounter);
  });

  app.delete('/api/sessions/:sessionId/encounters/:encounterId', (req, res) => {
    const result = deleteEncounter(req.params.sessionId, req.params.encounterId);
    if (result.error === 'session-not-found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (result.error === 'encounter-not-found') {
      return res.status(404).json({ error: 'Encounter not found' });
    }

    res.json({ message: 'Encounter deleted' });
  });
}

module.exports = {
  registerSessionRoutes
};
