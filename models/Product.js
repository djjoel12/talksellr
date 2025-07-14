const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  description: String,
  prix: { type: Number, required: true },
  devise: { type: String, default: 'EUR' }, // Par défaut Euro
  image: { type: String }, // chemin vers image uploadée
  cloudinary_id: { type: String },
  videoUrl: String,        // <-- NOUVEAU champ URL vidéo
  boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
  dateCreation: { type: Date, default: Date.now },  // <-- bien fermer l'accolade ici
  vendeur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // vérifie que ce modèle existe
    required: true
  }
});

module.exports = mongoose.model('Product', productSchema);

