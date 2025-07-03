const express = require('express');
const router = express.Router();
const Boutique = require('../models/Boutique');
const multer = require('multer');
const path = require('path');

// Middleware : vérifie si l'utilisateur est un vendeur
function estVendeur(req, res, next) {
  if (req.session.user && req.session.user.role === 'vendeur') return next();
  res.status(403).send('Accès refusé');
}

// 📌 Dashboard vendeur
router.get('/dashboard', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    res.render('vendeur_dashboard', {
      user: req.session.user,
      boutique: boutique || null
    });
  } catch (error) {
    res.status(500).send('Erreur serveur');
  }
});

// 📌 Formulaire pour créer ou modifier une boutique
router.get('/boutique', estVendeur, async (req, res) => {
  const boutique = await Boutique.findOne({ vendeur: req.session.user.id });
  res.render('boutique_form', { user: req.session.user, boutique });
});

// 📌 Traitement du formulaire boutique
router.post('/boutique', estVendeur, async (req, res) => {
  const { nom, description, logo, pays } = req.body;

  let boutique = await Boutique.findOne({ vendeur: req.session.user.id });

  if (boutique) {
    // Modifier la boutique existante
    boutique.nom = nom;
    boutique.description = description;
    boutique.logo = logo;
    boutique.pays = pays;
    await boutique.save();
  } else {
    // Créer une nouvelle boutique
    await Boutique.create({
      nom,
      description,
      logo,
      pays,
      vendeur: req.session.user.id
    });
  }

  res.redirect('/vendeur/dashboard');
});

// 📌 Configuration Multer pour uploader les logos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// (Tu pourras utiliser `upload.single('logo')` dans la route POST si tu ajoutes l'envoi de fichier)

module.exports = router;
