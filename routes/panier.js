const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');

// GET route pour afficher panier
router.get('/', async (req, res) => {
  try {
    const panier = req.session.panier || [];
    const user = req.session.user;

    console.log('=== PANIER SIMPLIFIÉ ===');
    console.log('Articles dans panier:', panier.length);

    let slug = req.session.boutiqueActuelle || null;
    
    // Récupérer les infos de la boutique
    let boutique = null;
    if (slug) {
      try {
        boutique = await Boutique.findOne({ slug: slug });
      } catch (err) {
        console.log('⚠️ Erreur recherche boutique:', err.message);
      }
    }

    // Si panier vide
    if (panier.length === 0) {
      return res.render('panier', { 
        panier: [],
        total: 0,
        slug: slug,
        boutique: boutique,
        user: user,
        req: req
      });
    }

    // Récupérer les produits depuis la BDD
    const produitsIds = panier.map(item => item.produitId);
    const produits = await Produit.find({ _id: { $in: produitsIds } })
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'slug nom');

    // Fusionner infos produit + quantité et calculer le total
    let total = 0;
    const panierDetail = panier.map(item => {
      // 🔥 CORRECTION : Vérifier que item existe
      if (!item) return null;
      
      const produit = produits.find(p => p._id.toString() === item.produitId);
      const quantite = item.quantite || 1; // Valeur par défaut
      const sousTotal = produit ? produit.prix * quantite : 0;
      total += sousTotal;
      
      return {
        produit,
        quantite: quantite,
        sousTotal: sousTotal
      };
    }).filter(item => item !== null); // 🔥 Filtrer les items null

    res.render('panier', { 
      panier: panierDetail,
      total: total,
      slug: slug,
      boutique: boutique,
      user: user,
      req: req
    });
    
  } catch (err) {
    console.error('Erreur affichage panier:', err);
    res.status(500).send('Erreur serveur lors de l\'affichage du panier');
  }
});

// POST route pour ajouter un produit au panier - VERSION CORRIGÉE
router.post('/ajouter/:id', async (req, res) => {
  try {
    const produitId = req.params.id;
    
    // 🔥 CORRECTION : Gestion robuste de la quantité
    let quantite = 1;
    if (req.body && typeof req.body === 'object') {
      if (req.body.quantite) {
        quantite = parseInt(req.body.quantite) || 1;
      }
    } else if (typeof req.body === 'string') {
      try {
        const bodyData = JSON.parse(req.body);
        quantite = parseInt(bodyData.quantite) || 1;
      } catch (e) {
        quantite = 1;
      }
    }

    console.log('🛒 AJOUT PANIER - Produit:', produitId, 'Quantité:', quantite);

    // Vérifier que l'ID est valide
    if (!produitId || produitId.length !== 24) {
      console.log('❌ ID produit invalide');
      return res.json({
        success: false,
        message: 'ID produit invalide'
      });
    }

    // Vérifier que le produit existe
    const produit = await Produit.findById(produitId).populate('boutique', 'slug nom');
    if (!produit) {
      console.log('❌ Produit non trouvé');
      return res.json({
        success: false,
        message: 'Produit non trouvé'
      });
    }

    // Vérifier le stock
    if (produit.stock < quantite) {
      console.log('❌ Stock insuffisant');
      return res.json({
        success: false,
        message: `Stock insuffisant. Il ne reste que ${produit.stock} unité(s) disponible(s).`
      });
    }

    // 🔥 CORRECTION : Initialiser le panier de manière sécurisée
    if (!req.session.panier) {
      req.session.panier = [];
    }

    // Vérifier si produit déjà dans le panier
    const index = req.session.panier.findIndex(item => {
      return item && item.produitId === produitId;
    });

    if (index !== -1) {
      // Produit déjà dans le panier - incrémenter la quantité
      if (req.session.panier[index]) {
        req.session.panier[index].quantite = (req.session.panier[index].quantite || 0) + quantite;
      }
    } else {
      // Nouveau produit - l'ajouter au panier
      req.session.panier.push({ 
        produitId: produitId, 
        quantite: quantite
      });
    }

    // 🔥 CORRECTION : Calcul sécurisé du total
    const panierCount = req.session.panier.reduce((total, item) => {
      return total + (item && item.quantite ? item.quantite : 1);
    }, 0);

    // Stocker la boutique actuelle
    if (produit.boutique && produit.boutique.slug) {
      req.session.boutiqueActuelle = produit.boutique.slug;
    }

    req.session.save((err) => {
      if (err) {
        console.error('❌ Erreur sauvegarde session:', err);
        return res.json({
          success: false,
          message: 'Erreur sauvegarde session'
        });
      }
      
      res.json({
        success: true,
        message: 'Produit ajouté au panier',
        panierCount: panierCount,
        boutiqueSlug: req.session.boutiqueActuelle
      });
    });
    
  } catch (err) {
    console.error('❌ Erreur ajout panier :', err);
    res.json({
      success: false,
      message: 'Erreur lors de l\'ajout au panier: ' + err.message
    });
  }
});

// Route pour modifier la quantité - VERSION CORRIGÉE
router.post('/modifier-quantite/:id', async (req, res) => {
  try {
    const produitId = req.params.id;
    const nouvelleQuantite = parseInt(req.body.quantite);

    console.log('🔄 MODIFICATION QUANTITÉ - Produit:', produitId, 'Nouvelle quantité:', nouvelleQuantite);

    if (!req.session.panier) {
      return res.json({ success: false, message: 'Panier vide' });
    }

    // 🔥 CORRECTION : Trouver le produit avec vérification
    const panierItem = req.session.panier.find(item => {
      return item && item.produitId === produitId;
    });
    
    if (!panierItem) {
      return res.json({ success: false, message: 'Produit non trouvé dans le panier' });
    }

    // Vérifier le stock
    const produit = await Produit.findById(produitId);
    if (!produit) {
      return res.json({ success: false, message: 'Produit non trouvé' });
    }

    if (nouvelleQuantite > produit.stock) {
      return res.json({ 
        success: false, 
        message: `Stock insuffisant. Il ne reste que ${produit.stock} unité(s) disponible(s).`,
        stockRestant: produit.stock
      });
    }

    if (nouvelleQuantite < 1) {
      return res.json({ 
        success: false, 
        message: 'La quantité doit être au moins de 1'
      });
    }

    // Mettre à jour la quantité
    panierItem.quantite = nouvelleQuantite;

    // 🔥 CORRECTION : Calcul sécurisé des totaux
    const panierCount = req.session.panier.reduce((total, item) => {
      return total + (item && item.quantite ? item.quantite : 1);
    }, 0);
    
    // Récupérer tous les produits pour calculer le total
    const produitsIds = req.session.panier.map(item => item && item.produitId).filter(id => id);
    const produits = await Produit.find({ _id: { $in: produitsIds } });
    
    const totalPanier = req.session.panier.reduce((total, item) => {
      if (!item) return total;
      const produit = produits.find(p => p._id.toString() === item.produitId);
      return total + (produit ? produit.prix * (item.quantite || 1) : 0);
    }, 0);

    const sousTotal = produit.prix * nouvelleQuantite;

    req.session.save((err) => {
      if (err) {
        return res.json({ success: false, message: 'Erreur sauvegarde session' });
      }
      
      res.json({
        success: true,
        quantite: nouvelleQuantite,
        sousTotal: sousTotal,
        totalPanier: totalPanier,
        totalArticles: panierCount,
        stockRestant: produit.stock,
        devise: produit.devise
      });
    });

  } catch (err) {
    console.error('Erreur modification quantité:', err);
    res.json({ success: false, message: 'Erreur serveur: ' + err.message });
  }
});

// Route pour supprimer un produit du panier - VERSION CORRIGÉE
router.post('/supprimer/:id', async (req, res) => {
  try {
    const produitId = req.params.id;

    console.log('🗑️ SUPPRESSION PANIER - Produit:', produitId);

    if (!req.session.panier) {
      req.session.panier = [];
    }

    // 🔥 CORRECTION : Filtrer avec vérification
    req.session.panier = req.session.panier.filter(item => {
      return item && item.produitId !== produitId;
    });

    req.session.save((err) => {
      if (err) {
        console.error('Erreur sauvegarde session:', err);
        return res.json({ success: false, message: 'Erreur lors de la suppression' });
      }
      
      res.json({
        success: true,
        message: 'Produit supprimé du panier'
      });
    });
  } catch (err) {
    console.error('Erreur suppression panier:', err);
    res.json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

module.exports = router;