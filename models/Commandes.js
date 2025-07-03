const mongoose = require('mongoose');

const commandeSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  // ou 'Client' selon ta structure
    required: true
  },
  produits: [{
    produitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Produit',
      required: true
    },
    quantite: {
      type: Number,
      required: true,
      min: 1
    },
    vendeurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  dateCommande: {
    type: Date,
    default: Date.now
  },
  statut: {
    type: String,
    enum: ['en attente', 'confirmée', 'expédiée', 'livrée', 'annulée'],
    default: 'en attente'
  }
});
