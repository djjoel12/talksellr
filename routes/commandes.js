const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');
const Commande = require('../models/Commandes'); // ou le chemin correct
const estVendeurConnecte = require('../middlewares/estVendeur');

// Créer une commande
router.post('/creer', async (req, res) => {
  try {
    const { produits, vendeur } = req.body;

    const commande = new Commande({
      client: req.session.userId,
      produits,
      vendeur
    });

    await commande.save();
    res.status(201).json({ message: 'Commande créée avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la création de la commande', err });
  }
});

// Voir toutes les commandes du vendeur connecté
router.get('/vendeur', async (req, res) => {
  try {
    const commandes = await Commande.find({ vendeur: req.session.userId })
      .populate('produits.produit')
      .populate('client');
    res.render('commandes/vendeur', { commandes });
  } catch (err) {
    res.status(500).send('Erreur serveur');
  }
});





// Route pour valider la commande
router.post('/valider', async (req, res) => {
  const { nom, telephone, adresse } = req.body;
  const panier = req.session.panier || [];

  if (panier.length === 0) {
    return res.send('Votre panier est vide.');
  }

  // Récupérer les produits
  const produitsIds = panier.map(item => item.produitId);
  const produits = await Produit.find({ _id: { $in: produitsIds } });

  const total = panier.reduce((acc, item) => {
    const produit = produits.find(p => p._id.toString() === item.produitId);
    return acc + (produit ? produit.prix * item.quantite : 0);
  }, 0);

  const devise = produits[0]?.devise || 'FCFA';

  // Enregistrer la commande dans MongoDB
  const nouvelleCommande = new Commande({
    client: { nom, telephone, adresse },
    produits: panier,
    total,
    devise
  });

  await nouvelleCommande.save();

  // Construire le message WhatsApp
  let message = `🛒 Nouvelle commande :\n\n👤 ${nom}\n📞 ${telephone}\n📍 ${adresse}\n\n📦 Produits :\n`;
  panier.forEach(item => {
    const produit = produits.find(p => p._id.toString() === item.produitId);
    if (produit) {
      message += `- ${produit.nom} x${item.quantite} → ${produit.prix * item.quantite} ${produit.devise}\n`;
    }
  });
  message += `\n💰 Total : ${total} ${devise}`;
  const encodedMessage = encodeURIComponent(message);
  const numeroWhatsApp = '225XXXXXXXXXX'; // Ton numéro

  // Vider le panier
  req.session.panier = [];

  // Afficher page de confirmation avec bouton WhatsApp
  res.render('commande_confirmee', {
    numeroWhatsApp,
    messageWhatsApp: encodedMessage,
    nom
  });
});

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