const path = require('path');
console.log('Chemin courant:', __dirname);
console.log('Chemin vers estConnecte:', path.resolve(__dirname, '../middlewares/estConnecte.js'));

const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');
const Commande = require('../models/Commandes');
const estConnecte = require('../middlewares/estConnecte');
const estVendeur = require('../middlewares/estVendeur');

// ✅ Route : Valider commande d’un client
router.post('/valider', async (req, res) => {
  const { nom, telephone, adresse } = req.body;
  const panier = req.session.panier || [];

  if (panier.length === 0) return res.send('Votre panier est vide.');

  const produitsIds = panier.map(item => item.produitId);
  const produits = await Produit.find({ _id: { $in: produitsIds } });

  const total = panier.reduce((acc, item) => {
    const produit = produits.find(p => p._id.toString() === item.produitId);
    return acc + (produit ? produit.prix * item.quantite : 0);
  }, 0);

  const devise = produits[0]?.devise || 'FCFA';

  const nouvelleCommande = new Commande({
    nom,
    telephone,
    adresse,
    produits: panier,
    total,
    date: new Date(),
  });

  await nouvelleCommande.save();
  req.session.panier = [];

  // Construction du message WhatsApp
  let message = `🛒 Nouvelle commande :\n\n👤 ${nom}\n📞 ${telephone}\n📍 ${adresse}\n\n📦 Produits :\n`;
  panier.forEach(item => {
    const produit = produits.find(p => p._id.toString() === item.produitId);
    if (produit) {
      message += `- ${produit.nom} x${item.quantite} → ${produit.prix * item.quantite} ${produit.devise}\n`;
    }
  });
  message += `\n💰 Total : ${total} ${devise}`;

  const numeroWhatsApp = '225XXXXXXXXX'; // Remplace par ton numéro WhatsApp

  // Rendu de la vue finale commande_confirmee.ejs
  res.render('commande_confirmee', {
    numeroWhatsApp,
    messageWhatsApp: encodeURIComponent(message),
    nom
  });
});

// Route GET panier (affichage du panier)
router.get('/valider', (req, res) => {
  res.render('panier', { panier: req.session.panier || [] });
});

// ✅ Route : Voir les commandes liées à mes produits (vendeur)
router.get('/mes-commandes', estVendeur, async (req, res) => {
  try {
    // Récupère tous les produits du vendeur connecté
    const mesProduits = await Produit.find({ vendeur: req.session.user.id }).select('_id');
    const mesProduitsIds = mesProduits.map(p => p._id);

    // Cherche toutes les commandes contenant ces produits
    const commandes = await Commande.find({ "produits.produitId": { $in: mesProduitsIds } })
      .populate('produits.produitId', 'nom prix image')
      .sort({ date: -1 });

    res.render('commande_mes', { commandes });
  } catch (err) {
    console.error('Erreur affichage commandes :', err);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router;
