
const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');

// GET route pour afficher panier
// GET route pour afficher panier AVEC commandes
router.get('/', async (req, res) => {
  try {
    const panier = req.session.panier || [];
    const user = req.session.user;

    console.log('=== DEBUG PANIER AVEC COMMANDES ===');
    console.log('Utilisateur:', user ? user.id : 'Non connecté');

    let slug = null;
    
    // Récupérer le slug de la boutique
    if (req.session.boutiqueActuelle) {
      slug = req.session.boutiqueActuelle;
    } else if (req.get('Referer')) {
      const referer = req.get('Referer');
      const boutiqueMatch = referer.match(/boutique\/([^\/\?]+)/);
      if (boutiqueMatch) {
        slug = boutiqueMatch[1];
        req.session.boutiqueActuelle = slug;
      }
    }

    // Récupérer les commandes de l'utilisateur s'il est connecté
    let commandes = [];
    if (user && user.id) {
      const Commande = require('../models/Commandes');
      commandes = await Commande.find({ 
        'client.id': user.id 
      })
      .sort({ dateCreation: -1 })
      .limit(5) // 5 dernières commandes
      .populate('boutique.id', 'nom slug');
      
      console.log(`📦 Commandes trouvées: ${commandes.length}`);
    }

    // Si panier vide, render avec les commandes
    if (panier.length === 0) {
      return res.render('panier', { 
        panier: [],
        total: 0,
        slug: slug,
        user: user,
        commandes: commandes,
        statuts: {
          'en_attente': 'En attente',
          'confirmee': 'Confirmée',
          'en_preparation': 'En préparation',
          'expediee': 'Expédiée',
          'livree': 'Livrée',
          'annulee': 'Annulée'
        }
      });
    }

    // Récupérer les produits depuis la BDD
    const produitsIds = panier.map(item => item.produitId);
    const produits = await Produit.find({ _id: { $in: produitsIds } })
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'slug nom');

    // Déterminer le slug final
    if (!slug && produits.length > 0) {
      const produitAvecBoutique = produits.find(p => p.boutique && p.boutique.slug);
      if (produitAvecBoutique) {
        slug = produitAvecBoutique.boutique.slug;
        req.session.boutiqueActuelle = slug;
      }
    }

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
      user: user,
      commandes: commandes,
      statuts: {
        'en_attente': 'En attente',
        'confirmee': 'Confirmée',
        'en_preparation': 'En préparation',
        'expediee': 'Expédiée',
        'livree': 'Livrée',
        'annulee': 'Annulée'
      }
    });
  } catch (err) {
    console.error('Erreur affichage panier avec commandes :', err);
    res.status(500).send('Erreur serveur lors de l\'affichage du panier');
  }
});

// POST route pour ajouter un produit au panier
// POST route pour ajouter un produit au panier - VERSION CORRIGÉE
router.post('/ajouter/:id', async (req, res) => {
  try {
    const produitId = req.params.id;
    const quantite = parseInt(req.body.quantite) || 1; // S'assurer que la quantité est définie

    console.log('🛒 Ajout au panier:', { produitId, quantite });

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
      // Sinon, ajouter le produit avec une quantité définie
      req.session.panier.push({ 
        produitId, 
        quantite: quantite 
      });
    }

    // Stocker la boutique actuelle dans la session
    if (produit.boutique && produit.boutique.slug) {
      req.session.boutiqueActuelle = produit.boutique.slug;
      console.log('💾 Slug stocké en session:', produit.boutique.slug);
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