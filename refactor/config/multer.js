const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const { MAPS_DIR, UPLOADS_DIR } = require('./constants');

const storage = multer.diskStorage({
  destination: function destination(req, file, cb) {
    const targetDir = path.join(UPLOADS_DIR, file.fieldname || 'misc');
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: function filename(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const mapStorage = multer.diskStorage({
  destination: function destination(req, file, cb) {
    cb(null, MAPS_DIR);
  },
  filename: function filename(req, file, cb) {
    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname) || '';
    cb(null, `${id}${ext}`);
  }
});

const mapUpload = multer({
  storage: mapStorage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

module.exports = {
  upload,
  mapUpload
};
