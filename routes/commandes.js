const path = require('path');
console.log('Chemin courant:', __dirname);
console.log('Chemin vers estConnecte:', path.resolve(__dirname, '../middlewares/estConnecte.js'));

const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');
const Commande = require('../models/Commandes'); // Corrigé le nom du modèle
const User = require('../models/User');
const estConnecte = require('../middlewares/estConnecte');
const estVendeur = require('../middlewares/estVendeur');

// ✅ Route : Valider commande d'un client
// ✅ Route : Valider commande d'un client - VERSION CORRIGÉE
// ✅ Route : Valider commande d'un client - VERSION CORRIGÉE
router.post('/valider', async (req, res) => {
  try {
    console.log('🛒 Début validation commande');
    const { nom, telephone, adresse } = req.body;
    const panier = req.session.panier || [];

    console.log('📋 Panier:', panier);

    if (panier.length === 0) {
      req.session.errorMessage = 'Votre panier est vide. Ajoutez des produits avant de commander.';
      return res.redirect('/panier');
    }

    // Récupérer les produits complets depuis la BDD
    const produitsIds = panier.map(item => item.produitId);
    const produits = await Produit.find({ _id: { $in: produitsIds } })
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'slug nom');

    console.log('📦 Produits trouvés:', produits.length);

    if (produits.length === 0) {
      req.session.errorMessage = 'Les produits de votre panier ne sont plus disponibles.';
      return res.redirect('/panier');
    }

    // Calculer le total et préparer les produits pour la commande
    let total = 0;
    const produitsCommande = panier.map(item => {
      const produit = produits.find(p => p._id.toString() === item.produitId);
      if (produit) {
        const sousTotal = produit.prix * item.quantite;
        total += sousTotal;
        
        return {
          produitId: produit._id, // CORRIGÉ : doit correspondre au modèle
          nom: produit.nom,
          prix: produit.prix,
          devise: produit.devise,
          quantite: item.quantite,
          image: produit.image,
          vendeurId: produit.vendeur._id,
          boutiqueId: produit.boutique._id
        };
      }
      return null;
    }).filter(Boolean);

    console.log('📝 Produits commande:', produitsCommande);

    // Générer un numéro de commande unique
    const date = new Date();
    const numeroCommande = `CMD-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Créer la commande avec la structure CORRECTE
    const nouvelleCommande = new Commande({
      numeroCommande: numeroCommande,
      client: {
        id: req.session.user ? req.session.user.id : null,
        nom: nom,
        telephone: telephone,
        adresse: adresse
      },
      boutique: {
        id: produits[0].boutique._id,
        nom: produits[0].boutique.nom,
        slug: produits[0].boutique.slug
      },
      produits: produitsCommande, // Utilise la structure avec produitId
      total: total,
      statut: 'en_attente',
      etapesSuivi: [{
        etape: 'commande_creée',
        description: 'Votre commande a été créée avec succès',
        lieu: 'Système'
      }]
    });

    await nouvelleCommande.save();
    
    console.log('✅ Commande sauvegardée:', nouvelleCommande.numeroCommande);
    
    // Vider le panier après commande
    req.session.panier = [];
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Rediriger vers la page de suivi
    res.redirect(`/commandes/suivi/${nouvelleCommande.numeroCommande}`);

  } catch (err) {
    console.error('❌ Erreur validation commande:', err);
    req.session.errorMessage = 'Erreur lors de la validation de la commande: ' + err.message;
    res.redirect('/panier');
  }
});
// ✅ Route : Liste des commandes pour le client
router.get('/mes-commandes', estConnecte, async (req, res) => {
  try {
    const commandes = await Commande.find({ 
      'client.id': req.session.user.id 
    })
    .populate('boutique.id', 'nom slug')
    .sort({ dateCreation: -1 });

    res.render('commande_mes', {
      commandes,
      statuts: {
        'en_attente': 'En attente',
        'confirmee': 'Confirmée',
        'en_preparation': 'En préparation',
        'expediee': 'Expédiée',
        'livree': 'Livrée',
        'annulee': 'Annulée'
      },
      user: req.session.user
    });
  } catch (err) {
    console.error('❌ Erreur liste commandes client:', err);
    res.status(500).render('erreur', {
      message: 'Erreur lors du chargement',
      erreur: err.message
    });
  }
});

// ✅ Route : Commandes du vendeur
// ✅ Route : Commandes du vendeur - VERSION CORRIGÉE
router.get('/vendeur/mes-commandes', estVendeur, async (req, res) => {
  try {
    console.log('🔍 Recherche des commandes pour vendeur:', req.session.user.id);
    
    // Récupère tous les produits du vendeur connecté
    const mesProduits = await Produit.find({ vendeur: req.session.user.id }).select('_id');
    const mesProduitsIds = mesProduits.map(p => p._id.toString());
    
    console.log('📦 IDs des produits du vendeur:', mesProduitsIds.length);

    if (mesProduitsIds.length === 0) {
      return res.render('commande_mes', {
        commandes: [],
        user: req.session.user,
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

    // Cherche toutes les commandes AVEC POPULATE CORRECT
    const toutesCommandes = await Commande.find()
      .populate({
        path: 'produits.produitId',
        select: 'nom prix image imagesGallery sku vendeur',
        model: 'Product'
      })
      .populate('produits.vendeurId', 'nom telephone') // Populate vendeurId
      .populate('boutique.id', 'nom slug')
      .populate('client.id', 'nom email') // Populate client si connecté
      .sort({ dateCreation: -1 });

    // Filtre les commandes contenant les produits du vendeur
    const commandesFiltrees = toutesCommandes.filter(commande => {
      return commande.produits.some(produit => {
        if (!produit.produitId) return false;
        const produitIdStr = produit.produitId._id ? 
          produit.produitId._id.toString() : 
          produit.produitId.toString();
        return mesProduitsIds.includes(produitIdStr);
      });
    });

    console.log('🎯 Commandes après filtrage:', commandesFiltrees.length);

    // Debug: Vérifier les données d'une commande
    if (commandesFiltrees.length > 0) {
      console.log('📋 Exemple commande:', {
        id: commandesFiltrees[0]._id,
        client: commandesFiltrees[0].client,
        produits: commandesFiltrees[0].produits.length,
        premierProduit: commandesFiltrees[0].produits[0] ? {
          nom: commandesFiltrees[0].produits[0].nom,
          produitId: commandesFiltrees[0].produits[0].produitId ? {
            nom: commandesFiltrees[0].produits[0].produitId.nom,
            image: commandesFiltrees[0].produits[0].produitId.image ? 'OUI' : 'NON'
          } : 'NULL'
        } : 'AUCUN'
      });
    }

    res.render('commande_mes', {
      commandes: commandesFiltrees,
      user: req.session.user,
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
    console.error('❌ Erreur commandes vendeur:', err);
    res.status(500).render('erreur', {
      message: 'Erreur lors du chargement',
      erreur: err.message
    });
  }
});

// ✅ Route : Mettre à jour le statut d'une commande (vendeur)
// ✅ Route : Mettre à jour le statut d'une commande (vendeur) - VERSION CORRIGÉE
router.post('/:id/statut', estVendeur, async (req, res) => {
  try {
    let { statut, description, lieu } = req.body;
    const commandeId = req.params.id;

    // CORRECTION : Convertir les statuts français en codes
    const statutsMap = {
      'En attente': 'en_attente',
      'Confirmée': 'confirmee', 
      'En préparation': 'en_preparation',
      'Expédiée': 'expediee',
      'Livrée': 'livree',
      'Annulée': 'annulee'
    };

    // Si c'est un statut en français, le convertir
    if (statutsMap[statut]) {
      statut = statutsMap[statut];
    }

    console.log('🔄 Mise à jour statut commande:', commandeId, '→', statut);

    // Vérifier que la commande existe
    const commande = await Commande.findById(commandeId);
    if (!commande) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    // Vérifier que la commande contient des produits du vendeur
    const mesProduits = await Produit.find({ vendeur: req.session.user.id });
    const mesProduitsIds = mesProduits.map(p => p._id.toString());

    const produitDuVendeur = commande.produits.some(produit => {
      if (!produit.produitId) return false;
      const produitIdStr = produit.produitId._id ? 
        produit.produitId._id.toString() : 
        produit.produitId.toString();
      return mesProduitsIds.includes(produitIdStr);
    });

    if (!produitDuVendeur) {
      return res.status(403).json({ success: false, error: 'Non autorisé à modifier cette commande' });
    }

    // Mettre à jour le statut et ajouter une étape de suivi
    commande.statut = statut;
    commande.etapesSuivi.push({
      etape: statut,
      description: description || `Statut mis à jour: ${statut}`,
      lieu: lieu || 'Boutique'
    });
    commande.dateModification = new Date();

    await commande.save();

    res.json({
      success: true,
      message: 'Statut mis à jour avec succès',
      commande: commande
    });

  } catch (err) {
    console.error('❌ Erreur mise à jour statut:', err);
    res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour: ' + err.message });
  }
});

// ✅ Route : Détails d'une commande pour vendeur
router.get('/vendeur/:id', estVendeur, async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id)
      .populate('produits.produitId', 'nom prix image description')
      .populate('boutique.id', 'nom slug adresse')
      .populate('client.id', 'nom email');

    if (!commande) {
      return res.status(404).render('erreur', {
        message: 'Commande non trouvée',
        erreur: 'Cette commande n\'existe pas'
      });
    }

    res.render('commande_details_vendeur', {
      commande,
      statuts: {
        'en_attente': 'En attente',
        'confirmee': 'Confirmée',
        'en_preparation': 'En préparation',
        'expediee': 'Expédiée',
        'livree': 'Livrée',
        'annulee': 'Annulée'
      },
      user: req.session.user
    });
  } catch (err) {
    console.error('❌ Erreur détails commande:', err);
    res.status(500).render('erreur', {
      message: 'Erreur lors du chargement',
      erreur: err.message
    });
  }
});

// ✅ Route GET panier (redirection)
router.get('/valider', (req, res) => {
  res.redirect('/panier');
});

// ✅ Route de débogage (à supprimer en production)
router.get('/debug-all', async (req, res) => {
  try {
    const toutesCommandes = await Commande.find()
      .populate('produits.produitId')
      .populate('boutique.id')
      .populate('client.id');

    const mesProduits = await Produit.find({ vendeur: req.session.user.id });

    res.json({
      toutesCommandes: toutesCommandes,
      mesProduits: mesProduits,
      userId: req.session.user ? req.session.user.id : 'Non connecté',
      totalCommandes: toutesCommandes.length,
      mesProduitsCount: mesProduits.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;