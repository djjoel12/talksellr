const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');
const Commande = require('../models/Commandes');
const Boutique = require('../models/Boutique');
const User = require('../models/User');
const estConnecte = require('../middlewares/estConnecte');
const estVendeur = require('../middlewares/estVendeur');

// ✅ Route : Valider commande d'un client
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
          produitId: produit._id,
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

    // Créer la commande
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
      produits: produitsCommande,
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
    console.log('👤 Type client:', req.session.user ? 'Connecté' : 'Invité');
    
    // Vider le panier
    req.session.panier = [];
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.redirect(`/commandes/whatsapp/${nouvelleCommande.numeroCommande}`);

  } catch (err) {
    console.error('❌ Erreur validation commande:', err);
    req.session.errorMessage = 'Erreur lors de la validation de la commande: ' + err.message;
    res.redirect('/panier');
  }
});

// ✅ Route : Commandes du vendeur - VERSION CORRIGÉE


// ✅ Route : Liste des commandes pour le client - VERSION CORRIGÉE
router.get('/mes-commandes', estConnecte, async (req, res) => {
  try {
    let commandes = [];
    
    // CAS 1 : Si l'utilisateur est un VENDEUR
    if (req.session.user.role === 'vendeur') {
      console.log('👨‍💼 Mode VENDEUR - Recherche toutes les commandes');
      
      // Trouver la boutique du vendeur
      const boutiqueVendeur = await Boutique.findOne({ 
        proprietaire: req.session.user.id 
      });
      
      if (boutiqueVendeur) {
        // Récupérer TOUTES les commandes de la boutique
        commandes = await Commande.find({ 
          'boutique.id': boutiqueVendeur._id 
        })
        .populate('produits.produitId', 'nom prix image vendeur')
        .populate('boutique.id', 'nom slug')
        .populate('client.id', 'nom email')
        .sort({ dateCreation: -1 });
        
        console.log(`🏪 Vendeur "${req.session.user.nom}" - ${commandes.length} commandes trouvées`);
      }
    }
    // CAS 2 : Si l'utilisateur est un CLIENT normal
    else {
      console.log('👤 Mode CLIENT - Recherche commandes personnelles');
      
      commandes = await Commande.find({ 
        'client.id': req.session.user.id 
      })
      .populate('boutique.id', 'nom slug')
      .sort({ dateCreation: -1 });
      
      console.log(`👤 Client "${req.session.user.nom}" - ${commandes.length} commandes personnelles`);
    }

    // Rendu du template
    res.render('commande_mes', {
      commandes,
      user: req.session.user,
      boutique: null,
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
    console.error('❌ Erreur liste commandes:', err);
    res.status(500).send('Erreur lors du chargement: ' + err.message);
  }
});

// ✅ Route : Mettre à jour le statut d'une commande (vendeur)
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
      return res.status(404).send('Commande non trouvée'); // ← CORRECTION
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
    res.status(500).send('Erreur lors du chargement: ' + err.message); // ← CORRECTION
  }
});

// ✅ Route : Page WhatsApp après commande
// ✅ Route : Page WhatsApp après commande AVEC LIEN SAAS
// Dans routes/commandes.js - MODIFIER la route WhatsApp
router.get('/whatsapp/:numero', async (req, res) => {
  try {
    const commande = await Commande.findOne({ numeroCommande: req.params.numero })
      .populate('boutique.id', 'nom slug')
      .populate('client.id', 'nom email')
      .populate('produits.produitId');

    if (!commande) {
      return res.status(404).send('Commande non trouvée');
    }

    // Récupérer le numéro du vendeur
    let numeroWhatsApp = "22961720032";
    
    if (commande.produits.length > 0 && commande.produits[0].produitId) {
      const premierProduit = await Produit.findById(commande.produits[0].produitId)
        .populate('vendeur', 'telephone');
      
      if (premierProduit && premierProduit.vendeur && premierProduit.vendeur.telephone) {
        numeroWhatsApp = premierProduit.vendeur.telephone.replace(/\D/g, '');
        console.log('📞 Numéro vendeur récupéré:', numeroWhatsApp);
      }
    }

    console.log('🔍 Numéro WhatsApp utilisé:', numeroWhatsApp);
    
    // ✅ LIEN INTELLIGENT POUR TOUS LES CAS
    const messageWhatsApp = encodeURIComponent(
      `🛍️ NOUVELLE COMMANDE !\n\n` +
      `Une nouvelle commande vient d'être passée sur votre boutique.\n\n` +
      `👤 Client: ${commande.client.nom}\n` +
      `📞 Téléphone: ${commande.client.telephone}\n` +
      `💰 Montant: ${commande.total.toFixed(2)} ${commande.produits[0]?.devise || 'EUR'}\n\n` +
      `📋 Gérer cette commande :\n` +
      `https://talksellr.onrender.com/auth/login?redirect=commandes\n\n` +
      `🎯 Merci de traiter rapidement !`
    );

    res.render('whatsapp_confirm', {
      numeroWhatsApp: numeroWhatsApp,
      messageWhatsApp: messageWhatsApp,
      slug: commande.boutique.slug,
      commandeId: commande._id,
      protocol: req.protocol,
      host: req.get('host')
    });

  } catch (err) {
    console.error('❌ Erreur page WhatsApp:', err);
    res.status(500).send('Erreur lors de la génération de la page WhatsApp');
  }
});
// ✅ Route GET panier (redirection)
router.get('/valider', (req, res) => {
  res.redirect('/panier');
});
// ✅ NOUVELLE ROUTE : Redirection lien court

// ✅ Route de débogage détaillée
router.get('/debug-vendeur', estVendeur, async (req, res) => {
  try {
    const boutiqueVendeur = await Boutique.findOne({ 
      proprietaire: req.session.user.id 
    });
    
    const mesProduits = await Produit.find({ vendeur: req.session.user.id });
    const mesProduitsIds = mesProduits.map(p => p._id.toString());

    const toutesCommandes = await Commande.find({})
      .populate('produits.produitId')
      .populate('boutique.id')
      .populate('client.id');

    const commandesFiltrees = toutesCommandes.filter(commande => {
      return commande.produits.some(produit => {
        if (!produit.produitId) return false;
        const produitIdStr = produit.produitId._id ? 
          produit.produitId._id.toString() : 
          produit.produitId.toString();
        return mesProduitsIds.includes(produitIdStr);
      });
    });

    res.json({
      vendeur: req.session.user.id,
      boutique: boutiqueVendeur ? boutiqueVendeur.nom : 'Aucune',
      mesProduitsCount: mesProduits.length,
      toutesCommandesCount: toutesCommandes.length,
      commandesFiltreesCount: commandesFiltrees.length,
      commandesFiltrees: commandesFiltrees.map(c => ({
        numero: c.numeroCommande,
        client: c.client.nom,
        clientId: c.client.id,
        produits: c.produits.length,
        statut: c.statut,
        type: c.client.id ? 'Connecté' : 'Invité'
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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