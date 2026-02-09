const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('../config/constants');

function registerCharacterRoutes(app, { upload }) {
  app.get('/api/characters', (req, res) => {
    const charactersDir = path.join(DATA_DIR, 'characters');

    console.log(`[API] GET /api/characters from ${req.ip}`);
    console.log(`[API] Characters directory: ${charactersDir}`);

    if (!fs.existsSync(charactersDir)) {
      console.log('[API] Characters directory does not exist, creating...');
      fs.mkdirSync(charactersDir, { recursive: true });
      return res.json([]);
    }

    const files = fs.readdirSync(charactersDir);
    console.log(`[API] Found ${files.length} files in characters directory:`, files);

    const characters = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const data = JSON.parse(fs.readFileSync(path.join(charactersDir, file), 'utf8'));
        return data;
      });

    console.log(`[API] Returning ${characters.length} characters`);
    res.json(characters);
  });

  app.get('/api/characters/:id', (req, res) => {
    const characterPath = path.join(DATA_DIR, 'characters', `${req.params.id}.json`);

    if (!fs.existsSync(characterPath)) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
    res.json(character);
  });

  app.post('/api/characters', (req, res) => {
    const charactersDir = path.join(DATA_DIR, 'characters');

    if (!fs.existsSync(charactersDir)) {
      fs.mkdirSync(charactersDir, { recursive: true });
    }

    const character = req.body;

    if (!character.id) {
      character.id = `char-${Date.now()}`;
    }

    const characterPath = path.join(charactersDir, `${character.id}.json`);
    fs.writeFileSync(characterPath, JSON.stringify(character, null, 2));

    res.json(character);
  });

  app.delete('/api/characters/:id', (req, res) => {
    const characterPath = path.join(DATA_DIR, 'characters', `${req.params.id}.json`);

    if (!fs.existsSync(characterPath)) {
      return res.status(404).json({ error: 'Character not found' });
    }

    fs.unlinkSync(characterPath);
    res.json({ message: 'Character deleted' });
  });

  app.post('/api/uploads/characters', upload.single('characterImage'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const relativePath = `/uploads/${req.file.fieldname || 'characters'}/${req.file.filename}`;
    res.json({
      filename: req.file.filename,
      path: relativePath,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
}

module.exports = {
  registerCharacterRoutes
};
