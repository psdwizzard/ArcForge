const fs = require('fs');

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[Atlas] Failed to read JSON file ${filePath}:`, error);
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(`[Atlas] Failed to write JSON file ${filePath}:`, error);
  }
}

module.exports = {
  readJsonFile,
  writeJsonFile
};
