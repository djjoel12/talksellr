const express = require('express');
const router = express.Router();
const upload = require('../config/storage'); // Multer + Cloudinary
const path = require('path');
const fs = require('fs');
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');
const estVendeur = require('../middlewares/estVendeur');
const cloudinary = require('../config/cloudinary'); // Config Cloudinary

// GET : formulaire d’ajout produit
router.get('/ajouter', estVendeur, (req, res) => {
  res.render('produit_ajouter');
});

// POST : ajouter produit avec upload image (Cloudinary)
router.post('/ajouter', estVendeur, upload.single('image'), async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) return res.send('Vous devez d’abord créer votre boutique.');

    // req.file est renseigné par multer-storage-cloudinary
    const produit = new Produit({
      nom: req.body.nom,
      description: req.body.description,
      prix: parseFloat(req.body.prix),
      devise: req.body.devise || 'EUR',
      image: req.file?.path || '',             // URL Cloudinary stockée ici
      cloudinary_id: req.file?.filename || '', // public_id Cloudinary
      boutique: boutique._id,
      vendeur: req.session.user.id,
    });

    await produit.save();
    res.redirect('/produits/mes');
  } catch (err) {
    console.error('Erreur ajout produit:', err);
    res.status(500).send('Erreur ajout produit : ' + err.message);
  }
});

// GET : liste des produits du vendeur
router.get('/mes', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) return res.send('Vous devez d’abord créer votre boutique.');

    const produits = await Produit.find({ boutique: boutique._id }).populate('vendeur', 'nom telephone');
    res.render('produit_mes', { produits });
  } catch (err) {
    console.error('Erreur affichage produits :', err);
    res.status(500).send('Erreur affichage produits : ' + err.message);
  }
});

// GET : formulaire de modification produit
router.get('/modifier/:id', estVendeur, async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).send('Produit non trouvé');
    res.render('produit_modifier', { produit });
  } catch (err) {
    console.error('Erreur récupération produit:', err);
    res.status(500).send('Erreur serveur');
  }
});

// POST : traitement modification produit + upload nouvelle image
router.post('/modifier/:id', estVendeur, upload.single('image'), async (req, res) => {
  try {
    const updates = {
      nom: req.body.nom,
      description: req.body.description,
      prix: parseFloat(req.body.prix),
      devise: req.body.devise,
    };

    if (req.file) {
      updates.image = req.file.path;           // Nouvelle URL Cloudinary
      updates.cloudinary_id = req.file.filename; // Nouveau public_id Cloudinary
    }

    await Produit.findByIdAndUpdate(req.params.id, updates);
    res.redirect('/produits/mes');
  } catch (err) {
    console.error('Erreur modification produit:', err);
    res.status(500).send('Erreur modification produit : ' + err.message);
  }
});

// POST : suppression produit + image Cloudinary
router.post('/supprimer/:id', estVendeur, async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).send('Produit non trouvé');

    if (produit.cloudinary_id) {
      await cloudinary.uploader.destroy(produit.cloudinary_id);
    }

    await Produit.findByIdAndDelete(req.params.id);
    res.redirect('/produits/mes');
  } catch (err) {
    console.error('Erreur lors de la suppression :', err);
    res.status(500).send('Erreur lors de la suppression : ' + err.message);
  }
});

module.exports = router;
