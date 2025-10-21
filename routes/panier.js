const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');

// GET route pour afficher panier
router.get('/', async (req, res) => {
  try {
    const panier = req.session.panier || [];
    const user = req.user;

    console.log('=== DEBUG PANIER ===');
    console.log('Session boutiqueActuelle:', req.session.boutiqueActuelle);
    console.log('Referer:', req.get('Referer'));
    console.log('Panier length:', panier.length);

    let slug = null;
    
    // PRIORITÉ 1: Vérifier si on vient d'une boutique spécifique
    if (req.session.boutiqueActuelle) {
      slug = req.session.boutiqueActuelle;
      console.log('✅ Slug depuis session:', slug);
    }
    // PRIORITÉ 2: Utiliser le referer pour déterminer la boutique
    else if (req.get('Referer')) {
      const referer = req.get('Referer');
      const boutiqueMatch = referer.match(/boutique\/([^\/\?]+)/);
      if (boutiqueMatch) {
        slug = boutiqueMatch[1];
        console.log('✅ Slug depuis referer:', slug);
        // Stocker pour usage futur
        req.session.boutiqueActuelle = slug;
      }
    }

    // Si panier vide, render maintenant
    if (panier.length === 0) {
      console.log('🛒 Panier vide, slug utilisé:', slug);
      return res.render('panier', { 
        panier: [],
        total: 0,
        slug: slug,
        user: user
      });
    }

    // Récupérer les produits depuis la BDD
    const produitsIds = panier.map(item => item.produitId);
    const produits = await Produit.find({ _id: { $in: produitsIds } })
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'slug nom');

    // PRIORITÉ 3: Utiliser la boutique du premier produit du panier SI slug toujours null
    if (!slug && produits.length > 0) {
      // Chercher le premier produit avec une boutique valide
      const produitAvecBoutique = produits.find(p => p.boutique && p.boutique.slug);
      if (produitAvecBoutique) {
        slug = produitAvecBoutique.boutique.slug;
        console.log('✅ Slug depuis premier produit:', slug);
        // Stocker pour usage futur
        req.session.boutiqueActuelle = slug;
      }
    }

    console.log('🎯 Slug final déterminé:', slug);

    // Fusionner infos produit + quantité et calculer le total
    let total = 0;
    const panierDetail = panier.map(item => {
      const produit = produits.find(p => p._id.toString() === item.produitId);
      const sousTotal = produit ? produit.prix * item.quantite : 0;
      total += sousTotal;
      
      return {
        produit,
        quantite: item.quantite,
        sousTotal: sousTotal
      };
    });

    res.render('panier', { 
      panier: panierDetail,
      total: total,
      slug: slug,
      user: user
    });
  } catch (err) {
    console.error('Erreur affichage panier :', err);
    res.status(500).send('Erreur serveur lors de l\'affichage du panier');
  }
});

// POST route pour ajouter un produit au panier
router.post('/ajouter/:id', async (req, res) => {
  try {
    const produitId = req.params.id;
    const quantite = parseInt(req.body.quantite) || 1;

    // Vérifier que le produit existe AVEC populate de la boutique
    const produit = await Produit.findById(produitId).populate('boutique', 'slug');
    if (!produit) {
      return res.status(404).send('Produit non trouvé');
    }

    // Initialiser le panier si inexistant
    if (!req.session.panier) {
      req.session.panier = [];
    }

    // Vérifier si produit déjà dans le panier
    const index = req.session.panier.findIndex(item => item.produitId === produitId);

    if (index !== -1) {
      // Incrémenter la quantité si déjà présent
      req.session.panier[index].quantite += quantite;
    } else {
      // Sinon, ajouter le produit
      req.session.panier.push({ 
        produitId, 
        quantite: quantite 
      });
    }

    // CORRECTION FORCÉE : TOUJOURS stocker la boutique actuelle dans la session
    if (produit.boutique && produit.boutique.slug) {
      req.session.boutiqueActuelle = produit.boutique.slug;
      console.log('💾 Slug stocké en session:', produit.boutique.slug);
    } else {
      console.log('⚠️ Produit sans boutique:', produitId);
    }

    // Sauvegarder explicitement la session
    req.session.save((err) => {
      if (err) {
        console.error('Erreur sauvegarde session:', err);
      }
      const referer = req.get('Referer') || '/panier';
      res.redirect(referer);
    });
    
  } catch (err) {
    console.error('Erreur ajout panier :', err);
    res.status(500).send('Erreur serveur lors de l\'ajout au panier');
  }
});

// Supprimer un produit du panier
router.post('/supprimer/:id', (req, res) => {
  try {
    const produitId = req.params.id;

    if (!req.session.panier) {
      req.session.panier = [];
    }

    req.session.panier = req.session.panier.filter(item => item.produitId !== produitId);

    // Sauvegarder la session après modification
    req.session.save((err) => {
      if (err) {
        console.error('Erreur sauvegarde session:', err);
      }
      res.redirect('/panier');
    });
  } catch (err) {
    console.error('Erreur suppression panier:', err);
    res.status(500).send('Erreur lors de la suppression');
  }
});

module.exports = router;