const express = require('express');
const router = express.Router(); // ✅ Cette ligne est essentielle
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');

router.get('/', async (req, res) => {
  try {
    const query = req.query.q || '';
    // Construire le filtre en fonction de la recherche
    const filter = query ? { nom: new RegExp(query, 'i') } : {};
    // Toujours exclure produits sans vendeur
    filter.vendeur = { $ne: null };

    // Requête avec filtre et populate vendeur + boutique
    const produits = await Produit.find(filter)
      .populate('boutique','nom adresse')
      .populate('vendeur', 'nom email'); // Ne populate que le nom du vendeur

    let boutique = null;
    let isVendeur = false;

    console.log("Produits récupérés :", produits.length);

    if (req.session.user && req.session.user.role === 'vendeur') {
      isVendeur = true;
      boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    }

    res.render('accueil', {
      user: req.session.user || null,
      boutique,
      isVendeur,
      produits,
      q: query  // pour préremplir la barre recherche si besoin
    });
  } catch (err) {
    console.error("❌ Erreur exacte :", err);
    res.status(500).send("Erreur lors du chargement des produits");
  }
});

module.exports = router;
