const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');
const Commande = require('../models/Commandes'); // ou le chemin correct

// Route pour valider la commande
router.post('/valider', async (req, res) => {
  const { nom, telephone, adresse } = req.body;

  // Vérifier que le panier existe
  const panier = req.session.panier || [];
  if (panier.length === 0) {
    return res.send('Votre panier est vide.');
  }

  // Récupérer les produits
  const produitsIds = panier.map(item => item.produitId);
  const produits = await Produit.find({ _id: { $in: produitsIds } });

  // Construire le message WhatsApp
  let message = `🛒 Nouvelle commande depuis votre site :\n\n👤 Nom : ${nom}\n📞 Téléphone : ${telephone}\n📍 Adresse : ${adresse}\n\n📦 Produits commandés :\n`;

  panier.forEach(item => {
    const produit = produits.find(p => p._id.toString() === item.produitId);
    if (produit) {
      message += `- ${produit.nom} x${item.quantite} → ${produit.prix * item.quantite} ${produit.devise}\n`;
    }
  });

  const total = panier.reduce((acc, item) => {
    const produit = produits.find(p => p._id.toString() === item.produitId);
    return acc + (produit ? produit.prix * item.quantite : 0);
  }, 0);

  const devise = produits[0]?.devise || 'FCFA';
  message += `\n💰 Total : ${total} ${devise}`;

  // Encoder pour URL
  const encodedMessage = encodeURIComponent(message);

  // Numéro WhatsApp du vendeur ou admin
  const numeroWhatsApp = '225XXXXXXXXXX'; // ← remplace par ton numéro

  // Nettoyer le panier
  req.session.panier = [];

  // Redirection vers WhatsApp
  res.redirect(`https://wa.me/${numeroWhatsApp}?text=${encodedMessage}`);
});
// Middleware pour vérifier si vendeur est connecté
function estVendeurConnecte(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'vendeur') {
    next();
  } else {
    res.redirect('/login'); // Ou page d'erreur
  }
}

router.get('/mes', estVendeurConnecte, async (req, res) => {
  try {
    const vendeurId = req.session.user._id;

    // Chercher toutes les commandes où au moins un produit appartient au vendeur connecté
    const commandes = await Commande.find({ 'produits.vendeurId': vendeurId })
      .populate('client', 'nom email')
      .sort({ dateCommande: -1 });

    res.render('commandes_vendeur', { commandes, vendeurId });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors du chargement des commandes.');
  }
});
module.exports = router;