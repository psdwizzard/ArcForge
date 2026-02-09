const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('../config/constants');

function registerDevRoutes(app) {
  app.post('/api/save', (req, res) => {
    const dataPath = path.join(DATA_DIR, 'data.json');
    fs.writeFileSync(dataPath, JSON.stringify(req.body, null, 2));
    res.json({ message: 'Data saved successfully' });
  });

  app.get('/api/load', (req, res) => {
    const dataPath = path.join(DATA_DIR, 'data.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      res.json(data);
    } else {
      res.status(404).json({ error: 'No saved data found' });
    }
  });

  app.post('/api/dev/restart', (req, res) => {
    console.log('[DEV] Restart requested');
    res.json({ message: 'Server restarting...' });

    setTimeout(() => {
      console.log('[DEV] Shutting down...');
      process.exit(0);
    }, 500);
  });
}

module.exports = {
  registerDevRoutes
};
