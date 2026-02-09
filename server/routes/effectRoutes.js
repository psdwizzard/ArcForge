const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('../config/constants');

function registerEffectRoutes(app) {
  app.get('/api/effects', (req, res) => {
    const effectsDir = path.join(DATA_DIR, 'effects');

    if (!fs.existsSync(effectsDir)) {
      fs.mkdirSync(effectsDir, { recursive: true });
      return res.json([]);
    }

    const files = fs.readdirSync(effectsDir);
    const effects = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const data = JSON.parse(fs.readFileSync(path.join(effectsDir, file), 'utf8'));
        return data;
      });

    res.json(effects);
  });

  app.get('/api/effects/:id', (req, res) => {
    const effectPath = path.join(DATA_DIR, 'effects', `${req.params.id}.json`);

    if (!fs.existsSync(effectPath)) {
      return res.status(404).json({ error: 'Effect not found' });
    }

    const effect = JSON.parse(fs.readFileSync(effectPath, 'utf8'));
    res.json(effect);
  });

  app.post('/api/effects', (req, res) => {
    const effectsDir = path.join(DATA_DIR, 'effects');

    if (!fs.existsSync(effectsDir)) {
      fs.mkdirSync(effectsDir, { recursive: true });
    }

    const effect = req.body;

    if (!effect.id) {
      effect.id = `effect-${Date.now()}`;
    }

    const effectPath = path.join(effectsDir, `${effect.id}.json`);
    fs.writeFileSync(effectPath, JSON.stringify(effect, null, 2));

    res.json(effect);
  });

  app.delete('/api/effects/:id', (req, res) => {
    const effectPath = path.join(DATA_DIR, 'effects', `${req.params.id}.json`);

    if (!fs.existsSync(effectPath)) {
      return res.status(404).json({ error: 'Effect not found' });
    }

    fs.unlinkSync(effectPath);
    res.json({ message: 'Effect deleted' });
  });
}

module.exports = {
  registerEffectRoutes
};
