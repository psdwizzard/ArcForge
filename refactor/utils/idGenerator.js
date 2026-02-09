const crypto = require('crypto');

function generateId(prefix) {
  const base = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  return prefix ? `${prefix}-${base}` : base;
}

module.exports = {
  generateId
};
