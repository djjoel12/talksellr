// config/storage.js
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'marketplace_produits',
    allowed_formats: ['jpg', 'jpeg', 'png'],
  },
});

module.exports = storage;
