const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');



// Dans ton contrôleur
router.get('/panier', async (req, res) => {
  const panier = await Panier.find({ client: req.session.user.id }).populate('produit');
  const total = panier.reduce((acc, item) => acc + item.produit.prix * item.quantite, 0);

  res.render('panier_valider', { panier, total });
});

// Ajouter un produit au panier (POST /panier/ajouter)
router.post('/ajouter', async (req, res) => {
  try {
    const produitId = req.body.produitId;
    if (!produitId) {
      return res.status(400).send('ProduitId manquant');
    }

    // Vérifier que le produit existe en base
    const produit = await Produit.findById(produitId);
    if (!produit) {
      return res.status(404).send('Produit introuvable');
    }

    // Initialiser le panier si inexistant
    if (!req.session.panier) {
      req.session.panier = [];
    }

    // Vérifier si produit déjà dans le panier
    const index = req.session.panier.findIndex(item => item.produitId === produitId);

    if (index !== -1) {
      // Incrémenter la quantité si déjà présent
      req.session.panier[index].quantite += 1;
    } else {
      // Sinon, ajouter le produit avec quantité 1
      req.session.panier.push({ produitId, quantite: 1 });
    }

    // Rediriger vers la page panier
    res.redirect('/panier');
  } catch (err) {
    console.error('Erreur ajout panier :', err);
    res.status(500).send('Erreur serveur lors de l\'ajout au panier');
  }
});
// POST route pour ajouter un produit au panier
router.post('/ajouter/:id', async (req, res) => {
  const produitId = req.params.id;

  if (!req.session.panier) {
    req.session.panier = [];
  }

  const index = req.session.panier.findIndex(item => item.produitId === produitId);

  if (index !== -1) {
    req.session.panier[index].quantite += 1;
  } else {
    req.session.panier.push({ produitId, quantite: 1 });
  }

  res.redirect('/panier'); // redirige vers la page panier
});

// GET route pour afficher panier
// Afficher le panier (GET /panier)
router.get('/', async (req, res) => {
  try {
    const panier = req.session.panier || [];

    if (panier.length === 0) {
      return res.render('panier', { panier: [] });
    }

    // Extraire les IDs produits du panier
    const produitsIds = panier.map(item => item.produitId);

    // Récupérer les produits de la BDD
    const produits = await Produit.find({ _id: { $in: produitsIds } });

    // Fusionner infos produit + quantité
    const panierDetail = panier.map(item => {
      const produit = produits.find(p => p._id.toString() === item.produitId);
      return {
        produit,
        quantite: item.quantite
      };
    });

    res.render('panier', { panier: panierDetail });
  } catch (err) {
    console.error('Erreur affichage panier :', err);
    res.status(500).send('Erreur serveur lors de l\'affichage du panier');
  }
});

// Supprimer un produit du panier (POST /panier/supprimer/:id)
router.post('/supprimer/:id', (req, res) => {
  const produitId = req.params.id;

  if (!req.session.panier) {
    req.session.panier = [];
  }

  req.session.panier = req.session.panier.filter(item => item.produitId !== produitId);

  res.redirect('/panier');
});

module.exports = router;
