const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('../config/constants');

function registerCreatureRoutes(app) {
  app.get('/api/creatures', (req, res) => {
    const creaturesDir = path.join(DATA_DIR, 'creatures');

    if (!fs.existsSync(creaturesDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(creaturesDir);
    const creatures = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const data = JSON.parse(fs.readFileSync(path.join(creaturesDir, file), 'utf8'));
        return data;
      });

    res.json(creatures);
  });
}

module.exports = {
  registerCreatureRoutes
};
