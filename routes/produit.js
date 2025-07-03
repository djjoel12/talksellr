const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');
const estVendeur = require('../middlewares/estVendeur');

// Configuration multer pour upload d'images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// GET : formulaire d’ajout produit
router.get('/ajouter', estVendeur, (req, res) => {
  res.render('produit_ajouter');
});

// POST ajouter produit
router.post('/ajouter', estVendeur, upload.single('image'), async (req, res) => {
  try {
    if (!req.session.user || !req.session.user.id) {
      return res.status(403).send('Accès refusé.');
    }
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) return res.send('Vous devez d’abord créer votre boutique.');

    const imagePath = req.file ? '/uploads/' + req.file.filename : null;

    const produit = new Produit({
      nom: req.body.nom,
      description: req.body.description,
      prix: parseFloat(req.body.prix),
      devise: req.body.devise || 'EUR',
      image: imagePath,
      boutique: boutique._id,
      vendeur: req.session.user.id  // <-- ici
    });

    await produit.save();
    res.redirect('/produits/mes');
  } catch (err) {
    console.error('Erreur lors de l’ajout du produit :', err);
    res.status(500).send('Erreur ajout produit : ' + err.message);
  }
});

// GET mes produits
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


// GET : formulaire de modification
router.get('/modifier/:id', estVendeur, async (req, res) => {
  const produit = await Produit.findById(req.params.id);
  if (!produit) return res.status(404).send('Produit non trouvé');
  res.render('produit_modifier', { produit });
});

// POST : traitement de modification
router.post('/modifier/:id', estVendeur, upload.single('image'), async (req, res) => {
  const updates = {
    nom: req.body.nom,
    description: req.body.description,
    prix: req.body.prix,
    devise: req.body.devise
  };
  if (req.file) {
    updates.image = '/uploads/' + req.file.filename;
  }

  await Produit.findByIdAndUpdate(req.params.id, updates);
  res.redirect('/produits/mes');
});

// POST : suppression d’un produit
router.post('/supprimer/:id', estVendeur, async (req, res) => {
  await Produit.findByIdAndDelete(req.params.id);
  res.redirect('/produits/mes');
});

module.exports = router;
