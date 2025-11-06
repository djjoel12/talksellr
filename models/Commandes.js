const mongoose = require('mongoose');

const commandeSchema = new mongoose.Schema({
  numeroCommande: { 
    type: String, 
    unique: true,
    required: true 
  },
  client: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nom: { type: String, required: true },
    telephone: { type: String, required: true },
    adresse: { type: String, required: true }
  },
  boutique: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
    nom: { type: String, required: true },
    slug: { type: String, required: true }
  },
  produits: [{
    produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, // CORRIGÉ : produitId au lieu de produit
    nom: { type: String, required: true },
    prix: { type: Number, required: true },
    devise: { type: String, default: 'EUR' },
    quantite: { type: Number, required: true },
    image: { type: String },
    // ✅ AJOUTER CE CHAMP
    imagesGallery: [{
      url: String,
      cloudinary_id: String,
      ordre: Number
    }],
    vendeurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  }],
  statut: {
    type: String,
    enum: ['en_attente', 'confirmee', 'en_preparation', 'expediee', 'livree', 'annulee'],
    default: 'en_attente'
  },
  etapesSuivi: [{
    etape: { type: String, required: true },
    date: { type: Date, default: Date.now },
    description: { type: String },
    lieu: { type: String }
  }],
  total: { type: Number, required: true },
  methodePaiement: { type: String, default: 'non_specifie' },
  dateCreation: { type: Date, default: Date.now },
  dateModification: { type: Date, default: Date.now }
});

// Générer un numéro de commande unique
commandeSchema.pre('save', async function(next) {
  if (this.isNew) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    
    this.numeroCommande = `CMD-${year}${month}${day}-${random}`;
    
    // Ajouter l'étape initiale de suivi
    this.etapesSuivi.push({
      etape: 'commande_creée',
      description: 'Votre commande a été créée avec succès',
      lieu: 'Système'
    });
  }
  next();
});

module.exports = mongoose.model('Commande', commandeSchema);