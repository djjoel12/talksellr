const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le dossier temp s'il n'existe pas
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Storage temporaire pour garder les fichiers localement
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Garder le nom original mais sécurisé
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + safeName;
    cb(null, uniqueName);
  }
});

const uploadTemp = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Accepter images et vidéos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images et vidéos sont autorisées!'), false);
    }
  }
});

module.exports = uploadTemp;