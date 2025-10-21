const mongoose = require('mongoose');

const commandeSchema = new mongoose.Schema({
  nom: String,
  telephone: String,
  adresse: String,
  produits: [
    {
      produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      nom: String,
      prix: Number,
      devise: String,
      quantite: Number,
      vendeurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  ],
  total: Number,
  date: { type: Date, default: Date.now },
  statut: { 
    type: String, 
    default: 'En attente',
    enum: ['En attente', 'Confirmée', 'En préparation', 'Expédiée', 'En cours de livraison', 'Livrée', 'Annulée']
  }
});

module.exports = mongoose.model('Commande', commandeSchema);