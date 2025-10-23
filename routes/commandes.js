const path = require('path');
console.log('Chemin courant:', __dirname);
console.log('Chemin vers estConnecte:', path.resolve(__dirname, '../middlewares/estConnecte.js'));

const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');
const Commande = require('../models/Commandes');
const User = require('../models/User'); // <-- ajouté pour récupérer vendeur
const estConnecte = require('../middlewares/estConnecte');
const estVendeur = require('../middlewares/estVendeur');

// ✅ Route : Valider commande d’un client
// ✅ Route : Valider commande d'un client
// ✅ Route : Valider commande d'un client
router.post('/valider', async (req, res) => {
  try {
    console.log('🛒 Début validation commande');
    const { nom, telephone, adresse } = req.body;
    const panier = req.session.panier || [];

    console.log('📋 Panier:', panier);

    if (panier.length === 0) return res.send('Votre panier est vide.');

    // Récupérer les produits complets depuis la BDD
    const produitsIds = panier.map(item => item.produitId);
    const produits = await Produit.find({ _id: { $in: produitsIds } })
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'slug nom'); // <-- IMPORTANT: peupler la boutique

    console.log('📦 Produits trouvés:', produits.length);

    if (produits.length === 0) {
      return res.send('Aucun produit trouvé.');
    }

    // Calculer le total et préparer les produits pour la commande
    let total = 0;
    const produitsCommande = panier.map(item => {
      const produit = produits.find(p => p._id.toString() === item.produitId);
      if (produit) {
        const sousTotal = produit.prix * item.quantite;
        total += sousTotal;
        
        console.log('👤 Vendeur du produit:', produit.vendeur._id);
        console.log('🏪 Boutique du produit:', produit.boutique); // Debug
        
        return {
          produitId: produit._id,
          nom: produit.nom,
          prix: produit.prix,
          devise: produit.devise,
          quantite: item.quantite,
          vendeurId: produit.vendeur._id,
          boutiqueId: produit.boutique._id // <-- Ajouter l'ID de la boutique
        };
      }
      return null;
    }).filter(Boolean);

    console.log('📝 Produits commande:', produitsCommande);

    // Créer la commande
    const nouvelleCommande = new Commande({
      nom,
      telephone,
      adresse,
      produits: produitsCommande,
      total,
      date: new Date(),
    });

    await nouvelleCommande.save();
    
    console.log('✅ Commande sauvegardée ID:', nouvelleCommande._id);
    
    // Vider le panier après commande
    req.session.panier = [];

    // Récupérer le premier vendeur pour WhatsApp
    const premierVendeur = produits[0].vendeur;
    const numeroWhatsApp = premierVendeur.telephone || '225XXXXXXXXX';

    // Récupérer la boutique du premier produit pour le slug
    const premiereBoutique = produits[0].boutique;
    const slugBoutique = premiereBoutique ? premiereBoutique.slug : 'boutique';

    // Construction du message WhatsApp
    let message = `🛒 NOUVELLE COMMANDE 🛒\n\n`;
    message += `👤 Client: ${nom}\n`;
    message += `📞 Téléphone: ${telephone}\n`;
    message += `📍 Adresse: ${adresse}\n\n`;
    message += `📦 Produits commandés:\n`;
    
    produitsCommande.forEach(item => {
      message += `- ${item.nom} x${item.quantite} → ${item.prix * item.quantite} ${item.devise}\n`;
    });
    
    message += `\n💰 Total: ${total} ${produits[0].devise}\n`;
    message += `📅 Date: ${new Date().toLocaleString()}`;

    // CORRECTION : Utiliser nouvelleCommande au lieu de commande
    res.render('commande_confirmee', {
      numeroWhatsApp: numeroWhatsApp.replace(/\D/g, ''),
      messageWhatsApp: encodeURIComponent(message),
      slug: slugBoutique, // <-- CORRIGÉ : utiliser slugBoutique
      nom: nom,
      commande: nouvelleCommande // <-- CORRIGÉ : utiliser nouvelleCommande
    });

  } catch (err) {
    console.error('❌ Erreur validation commande:', err);
    res.status(500).send('Erreur lors de la validation de la commande: ' + err.message);
  }
});
// Route GET panier (affichage du panier)

// À la place, redirige vers /panier
router.get('/valider', (req, res) => {
  res.redirect('/panier');
});

// ✅ Route : Voir les commandes liées à mes produits (vendeur)
// ✅ Route : Mettre à jour le statut d'une commande
router.post('/:id/statut', estVendeur, async (req, res) => {
  try {
    const { statut } = req.body;
    const commandeId = req.params.id;

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

    // Mettre à jour le statut
    await Commande.findByIdAndUpdate(commandeId, { statut });

    res.json({ success: true, message: 'Statut mis à jour' });

  } catch (err) {
    console.error('❌ Erreur mise à jour statut:', err);
    res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour: ' + err.message });
  }
});
// ✅ Route : Voir les commandes liées à mes produits (vendeur)
// ✅ Route : Voir les commandes liées à mes produits (vendeur)
// ✅ Route : Voir les commandes liées à mes produits (vendeur) - VERSION CORRIGÉE
// ✅ Route : Voir les commandes liées à mes produits (vendeur) - VERSION AVEC IMAGES
router.get('/mes-commandes', estVendeur, async (req, res) => {
  try {
    console.log('🔍 Recherche des commandes pour vendeur:', req.session.user.id);
    
    // Récupère tous les produits du vendeur connecté
    const mesProduits = await Produit.find({ vendeur: req.session.user.id }).select('_id');
    const mesProduitsIds = mesProduits.map(p => p._id.toString());
    
    console.log('📦 IDs des produits du vendeur (string):', mesProduitsIds);

    if (mesProduitsIds.length === 0) {
      console.log('ℹ️ Le vendeur n\'a aucun produit');
      return res.render('commande_mes', { 
        commandes: [],
        user: req.session.user
      });
    }

    // Cherche toutes les commandes avec population des images
    const toutesCommandes = await Commande.find()
      .populate({
        path: 'produits.produitId',
        select: 'nom prix image imagesGallery',
        model: 'Product'
      })
      .populate('produits.vendeurId', 'nom telephone')
      .sort({ date: -1 });

    console.log('🛒 Toutes commandes trouvées:', toutesCommandes.length);

    // Filtre les commandes
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

    res.render('commande_mes', { 
      commandes: commandesFiltrees,
      user: req.session.user
    });

  } catch (err) {
    console.error('❌ Erreur affichage commandes :', err);
    res.status(500).send('Erreur serveur: ' + err.message);
  }
});
// ✅ Route : Mettre à jour le statut d'une commande

// Route temporaire de débogage - À SUPPRIMER après
router.get('/debug-all', async (req, res) => {
  try {
    const toutesCommandes = await Commande.find()
      .populate('produits.produitId')
      .populate('produits.vendeurId');
    
    const mesProduits = await Produit.find({ vendeur: req.session.user.id });
    
    res.json({
      toutesCommandes: toutesCommandes,
      mesProduits: mesProduits,
      userId: req.session.user.id,
      totalCommandes: toutesCommandes.length,
      mesProduitsCount: mesProduits.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
