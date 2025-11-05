// Dans models/Product.js - AJOUTER ces champs
const mongoose = require('mongoose'); // 👈 AJOUTEZ CETTE LIGNE
const productSchema = new mongoose.Schema({
  // Champs de base
  nom: { type: String },
  description: { type: String },
  prix: { type: Number, required: true }, // 👈 VOUS remplissez seulement ça
  devise: { type: String, default: 'EUR' },
  
  // 🧠 CHAMPS REMPLIS AUTOMATIQUEMENT PAR L'IA
  nom_ia: { type: String }, // Nom généré par l'IA
  description_ia: { type: String }, // Description générée
  categorie_ia: { type: String }, // Catégorie détectée
  sous_categorie_ia: { type: String },
  tags_ia: [{ type: String }],
  couleurs_ia: [{ type: String }],
  style_ia: { type: String },
  materiau_ia: { type: String },
  etat_ia: { type: String }, // Neuf/Usé/etc.
  marque_ia: { type: String },
  
  // Gallery photos
  imagesGallery: [{
    url: String,
    cloudinary_id: String,
    ordre: Number
  }],
  
  boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
  vendeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
// Si tu veux des index pour les recherches IA
productSchema.index({ 'categorie_ia': 1 });
productSchema.index({ 'tags_ia': 1 });
productSchema.index({ 'score_pertinence': -1 });

module.exports = mongoose.model('Product', productSchema);