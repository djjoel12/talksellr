const express = require('express');
const router = express.Router();
const upload = require('../config/storage'); // ✅ Pour uploader vers Cloudinary
const path = require('path');
const fs = require('fs');
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');
const estVendeur = require('../middlewares/estVendeur');
const cloudinary = require('../config/cloudinary'); // Assure-toi que ce chemin est correct


// Configuration multer pour upload d'images (sur disque local dans public/uploads)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});


// GET : formulaire d’ajout produit
router.get('/ajouter', estVendeur, (req, res) => {
  res.render('produit_ajouter');
});

// POST : ajouter produit avec upload image

router.post('/ajouter', estVendeur, upload.single('image'), async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) return res.send('Vous devez d’abord créer votre boutique.');

    // ✅ L’image est automatiquement envoyée sur Cloudinary via Multer
    const produit = new Produit({
      nom: req.body.nom,
      description: req.body.description,
      prix: parseFloat(req.body.prix),
      devise: req.body.devise || 'EUR',
      image: req.file.path,           // ✅ URL de l’image Cloudinary
      cloudinary_id: req.file.filename, // ✅ public_id utile si tu veux supprimer
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

// POST : traitement modification produit
router.post('/modifier/:id', estVendeur, upload.single('image'), async (req, res) => {
  try {
    const updates = {
      nom: req.body.nom,
      description: req.body.description,
      prix: req.body.prix,
      devise: req.body.devise,
    };
    if (req.file) {
      updates.image = '/uploads/' + req.file.filename;
    }

    await Produit.findByIdAndUpdate(req.params.id, updates);
    res.redirect('/produits/mes');
  } catch (err) {
    console.error('Erreur modification produit:', err);
    res.status(500).send('Erreur modification produit : ' + err.message);
  }
});

// fonction pour extraire le public_id à partir de l'URL
function getPublicIdFromUrl(url) {
  const parts = url.split('/');
  const filename = parts[parts.length - 1]; // "nom_image.jpg"
  const publicId = filename.split('.')[0]; // "nom_image"
  return publicId;
}

// Exemple de route suppression produit (routes/produit.js)
router.post('/supprimer/:id', estVendeur, async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).send('Produit non trouvé');

    // Si tu utilises Cloudinary et que tu stockes le public_id dans produit.cloudinary_id par exemple
    if(produit.cloudinary_id) {
      const cloudinary = require('cloudinary').v2;
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
