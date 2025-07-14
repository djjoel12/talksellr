const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'produits',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'avi', 'webm'],
    resource_type: (req, file) => {
      if (file.mimetype.startsWith('video/')) {
        return 'video';
      }
      return 'image';
    },
    transformation: (req, file) => {
      if (file.mimetype.startsWith('video/')) {
        return [
          { quality: 'auto' },
          { fetch_format: 'mp4' },
          { width: 720, crop: 'limit' },
        ];
      } else {
        return [
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ];
      }
    },
  },
});

const upload = multer({ storage });

module.exports = upload;
