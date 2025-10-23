const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  description: String,
  prix: { type: Number, required: true },
  devise: { type: String, default: 'EUR' },
  image: { type: String }, // Image principale
  cloudinary_id: { type: String }, // ID Cloudinary image principale
  // Nouveaux champs pour la galerie - CORRIGÉ : cloudinary_id n'est plus requis
  imagesGallery: [{
    url: { type: String, required: true },
    cloudinary_id: { type: String }, // ✅ Retirer required: true
    ordre: { type: Number, default: 0 }
  }],
  videoUrl: String,
  boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
  dateCreation: { type: Date, default: Date.now },
  vendeur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  categorie: { type: String },
  stock: { type: Number, default: 0 },
  sku: { type: String }
});

module.exports = mongoose.model('Product', productSchema);