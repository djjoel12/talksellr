const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

// Configuration pour les images
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'produits/images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// Configuration pour les vidéos
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'produits/videos',
    resource_type: 'video',
    allowed_formats: ['mp4', 'mov', 'avi'],
    transformation: [
      { width: 640, height: 360, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// Configuration mixte (images + vidéos)
const mixedStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'produits',
    resource_type: 'auto'
  }
});

const uploadImage = multer({ storage: imageStorage });
const uploadVideo = multer({ storage: videoStorage });
const uploadMixed = multer({ storage: mixedStorage });

module.exports = { uploadImage, uploadVideo, uploadMixed };