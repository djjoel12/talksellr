const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  description: String,
  categorie: { type: String, default: "autre" },
  apercuImage: String, // lien Cloudinary pour l’image d’aperçu
  fichier: String, // nom du fichier EJS du template, ex: "nike_style"
  type: { type: String, enum: ["gratuit", "premium"], default: "gratuit" },
  prix: { type: Number, default: 0 }
});

module.exports = mongoose.model('Template', templateSchema);
