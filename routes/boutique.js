const express = require('express');
const router = express.Router();
const Boutique = require('../models/Boutique');
const multer = require('multer');
const path = require('path');
const slugify = require('slugify');
const Produit = require('../models/Product'); // <-- IMPORT essentiel

// 📁 Configuration Multer pour logos
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

// 🔒 Middleware sécurité
function estConnecte(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/auth/login');
}


function estVendeur(req, res, next) {
  if (req.session.user && req.session.user.role === 'vendeur') return next();
  res.redirect('/auth/login');
}

// Route GET formulaire création boutique
router.get('/creer', estConnecte, (req, res) => {
  res.render('boutique_creer');
});

// Route POST création boutique (avec fermeture try/catch correcte)
router.post('/creer', estConnecte,  upload.single('logo'),async (req, res) => {
  try {
    const { nom, description, rue, ville, codePostal, pays, telephone } = req.body;

    // Génération du slug à partir du nom
    let slug = slugify(nom, { lower: true, strict: true });

    // Vérifier si un slug identique existe déjà
    let slugExist = await Boutique.findOne({ slug });
    let suffix = 1;
    while (slugExist) {
      slug = slugify(nom, { lower: true, strict: true }) + '-' + suffix;
      slugExist = await Boutique.findOne({ slug });
      suffix++;
    }

    // Vérifier si boutique existe déjà pour ce propriétaire
    const exist = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (exist) {
      return res.send('Vous avez déjà une boutique.');
    }

    // Création boutique
    const boutique = new Boutique({
      nom,
      description,
      adresse: { rue, ville, codePostal, pays },
      telephone,
      slug,
      proprietaire: req.session.user.id
    });
    await boutique.save();

    res.redirect('/boutique/mon');
  } catch (err) {
    res.status(500).send('Erreur création boutique : ' + err.message);
  }
});

// Route POST création ou modification boutique avec logo (upload)
router.post('/boutique', estVendeur, upload.single('logo'), async (req, res) => {
  const { nom, description, pays, telephone, rue, ville, codePostal } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    let boutique = await Boutique.findOne({ proprietaire: req.session.user.id });

    if (boutique) {
      // Mise à jour boutique
      boutique.nom = nom;
      boutique.description = description;
      boutique.telephone = telephone;
      boutique.pays = pays;
      boutique.adresse = { rue, ville, codePostal, pays };
      if (logoPath) boutique.logo = logoPath;
      await boutique.save();
    } else {
      // Création boutique
      boutique = new Boutique({
        nom,
        description,
        logo: logoPath,
        pays,
        telephone,
        adresse: { rue, ville, codePostal, pays },
        proprietaire: req.session.user.id
      });
      await boutique.save();
    }

    res.redirect('/vendeur/dashboard');
  } catch (err) {
    res.status(500).send('Erreur création/modification boutique : ' + err.message);
  }
});

// Route GET affichage boutique du vendeur
router.get('/mon', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) {
      return res.render('boutique_mon', { boutique: null, produits: [] });
      return res.status(404).send('Vous n\'avez pas encore de boutique.');
    }

    const produits = await Produit.find({ boutique: boutique._id }).populate('vendeur', 'nom');

    console.log('Produits récupérés:', produits); // Ajoute ça pour debug

    res.render('boutique_mon', { boutique, produits });
  } catch (error) {
    console.error('Erreur affichage boutique :', error);
    res.status(500).send('Erreur affichage boutique : ' + error.message);
  }
});



// Dashboard vendeur
router.get('/vendeur/dashboard', estVendeur, async (req, res) => {
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

// Route publique boutique par slug
router.get('/:slug', async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ slug: req.params.slug });
    if (!boutique) {
      return res.status(404).send('Boutique non trouvée');
    }

    const produits = await Produit.find({ boutique: boutique._id }).populate('vendeur', 'nom');

    res.render('boutique_publique', { boutique, produits });
  } catch (error) {
    console.error('Erreur serveur:', error);
    res.status(500).send('Erreur serveur : ' + error.message);
  }
});

// Page d'accueil publique (liste des produits)
router.get('/', async (req, res) => {
  try {
    const produits = await Produit.find().populate('boutique');
    res.render('boutique_accueil', { produits });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur chargement produits');
  }
});

// Route : afficher un produit par ID
router.get('/produit/:id', async (req, res, next) => {
  try {
    const produit = await Produit.findById(req.params.id)
   .populate('vendeur', 'nom email')       // charge les champs nom et email du vendeur
    .populate('boutique', 'nom adresse');    // charge les champs nom et adresse de la boutique


    
    if (!produit) {
      return res.status(404).send('Produit non trouvé');
    }
    console.log("Produit trouvé :", produit);
    res.render('produit_detail', { produit }); // Assure-toi d’avoir une vue `produit_detail.ejs`
  } catch (err) {
     next(err); // passe l’erreur au middleware erreur
    
  }
});
// Dans routes/boutique.js (ou fichier routes principal)
router.get('/mon/modifier', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) {
      return res.redirect('/boutique/creer'); // S’il n’y a pas encore de boutique, on invite à créer
    }
    res.render('boutique_modifier', { boutique });
  } catch (err) {
    res.status(500).send('Erreur chargement boutique : ' + err.message);
  }
});
router.post('/mon/modifier', estVendeur, upload.single('logo'), async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) {
      return res.redirect('/boutique/creer');
    }

    // Mise à jour des champs
    boutique.nom = req.body.nom;
    boutique.description = req.body.description;
    boutique.adresse.rue = req.body.rue;
    boutique.adresse.ville = req.body.ville;
    boutique.adresse.codePostal = req.body.codePostal;
    boutique.adresse.pays = req.body.pays;
    boutique.telephone = req.body.telephone;

    // Mise à jour du logo uniquement si un nouveau fichier a été uploadé
    if (req.file) {
      boutique.logo = `/uploads/${req.file.filename}`;
    }

    await boutique.save();

    res.redirect('/boutique/mon');
  } catch (err) {
    res.status(500).send('Erreur mise à jour boutique : ' + err.message);
  }
});
// Exporter le router
module.exports = router;
