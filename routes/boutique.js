const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const slugify = require('slugify');
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');
const Template = require('../models/Template');

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

// Route POST création boutique
router.post('/creer', estConnecte, upload.single('logo'), async (req, res) => {
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

    res.redirect('/vendeur/dashboard');
  } catch (err) {
    res.status(500).send('Erreur création boutique : ' + err.message);
  }
});

// Route GET templates
router.get('/templates', estVendeur, async (req, res) => {
  try {
    const templates = await Template.find();
    res.render('templates_disponibles', { templates });
  } catch (err) {
    res.status(500).send('Erreur chargement templates : ' + err.message);
  }
});

// Route POST choisir template
router.post('/choisir-template', estVendeur, async (req, res) => {
  try {
    const { template } = req.body;
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });

    if (!boutique) {
      return res.redirect('/boutique/creer');
    }

    boutique.template = template;
    await boutique.save();

    res.redirect('/boutique/mon');
  } catch (error) {
    console.error('Erreur lors du choix du template :', error);
    res.status(500).send('Erreur serveur : ' + error.message);
  }
});

// Route POST création ou modification boutique avec logo
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

// Route GET : Affichage de la boutique du vendeur connecté
router.get('/mon', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    const templates = await Template.find();

    if (!boutique) {
      return res.render('boutique_mon', {
        boutique: null,
        produits: [],
        templates: templates,
        message: "Vous n'avez pas encore créé de boutique."
      });
    }

    const produits = await Produit.find({ boutique: boutique._id }).populate('vendeur', 'nom');

    res.render('boutique_mon', {
      boutique,
      produits,
      templates: templates,
      message: null
    });

  } catch (error) {
    console.error('Erreur affichage boutique :', error);
    res.status(500).send('Erreur serveur : ' + error.message);
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

    const produits = await Produit.find({ boutique: boutique._id });

    req.session.boutiqueActuelle = boutique.slug;
    
    console.log('💾 Boutique visitée stockée en session:', {
      slug: boutique.slug,
      nom: boutique.nom,
      action: 'simple visite'
    });

    req.session.save((err) => {
      if (err) console.error('Erreur sauvegarde session:', err);
      
      let templatePath;
      let templateData = {
        boutique, 
        produits,
        slug: boutique.slug,
        user: req.session.user
      };

      if (boutique.template && boutique.template !== 'standard') {
        templatePath = `boutiques_templates/${boutique.template}`;
      } else if (boutique.template === 'standard') {
        templatePath = 'boutiques_templates/standard';
      } else {
        templatePath = 'boutique_publique';
      }

      console.log('Template utilisé:', templatePath);
      res.render(templatePath, templateData);
    });

  } catch (error) {
    console.error('Erreur serveur:', error);
    res.status(500).send('Erreur serveur : ' + error.message);
  }
});

// Page d'accueil publique
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
      .populate('vendeur', 'nom email telephone')
      .populate('boutique', 'nom slug adresse');

    if (!produit) {
      return res.status(404).send('Produit non trouvé');
    }

    // Récupérer d'autres produits du même vendeur
    const produitsVendeur = await Produit.find({
      vendeur: produit.vendeur._id,
      _id: { $ne: produit._id }
    })
    .limit(8)
    .populate('boutique', 'nom slug');

    // Récupérer les produits du panier avec leurs détails
    const panier = req.session.panier || [];
    let panierDetail = [];
    let totalPanier = 0;
    let totalArticles = 0;

    if (panier.length > 0) {
      const produitsIds = panier.map(item => item.produitId);
      const produitsPanier = await Produit.find({ _id: { $in: produitsIds } })
        .populate('vendeur', 'nom telephone')
        .populate('boutique', 'slug nom');

      panierDetail = panier.map(item => {
        const produitPanier = produitsPanier.find(p => p._id.toString() === item.produitId);
        const sousTotal = produitPanier ? produitPanier.prix * item.quantite : 0;
        totalPanier += sousTotal;
        totalArticles += item.quantite;
        
        return {
          produit: produitPanier,
          quantite: item.quantite,
          sousTotal: sousTotal
        };
      });
    }

    console.log("📦 Panier détail:", panierDetail.length, "articles");

    res.render('produit_detail', { 
      produit,
      produitsVendeur,
      panier: panierDetail,
      totalPanier: totalPanier,
      totalArticles: totalArticles,
      session: req.session,
      boutique: produit.boutique
    });
  } catch (err) {
    next(err);
  }
});

// Route modification boutique
router.get('/mon/modifier', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) {
      return res.redirect('/boutique/creer');
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

    boutique.nom = req.body.nom;
    boutique.description = req.body.description;
    boutique.adresse.rue = req.body.rue;
    boutique.adresse.ville = req.body.ville;
    boutique.adresse.codePostal = req.body.codePostal;
    boutique.adresse.pays = req.body.pays;
    boutique.telephone = req.body.telephone;

    if (req.file) {
      boutique.logo = `/uploads/${req.file.filename}`;
    }

    await boutique.save();

    res.redirect('/boutique/mon');
  } catch (err) {
    res.status(500).send('Erreur mise à jour boutique : ' + err.message);
  }
});

module.exports = router;