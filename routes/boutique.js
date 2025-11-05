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
// POST route pour ajouter un produit au panier - VERSION CORRIGÉE
router.post('/ajouter/:id', async (req, res) => {
  try {
    const produitId = req.params.id;
    
    console.log('🛒 DÉBUT Ajout au panier');
    console.log('📦 Produit ID:', produitId);
    console.log('📝 Body reçu:', req.body);
    console.log('📝 Headers:', req.headers);
    
    // CORRECTION : Utiliser la quantité envoyée par le formulaire
    const quantite = parseInt(req.body.quantite) || 1; // ← CORRECTION ICI

    // Vérifier que l'ID est valide
    if (!produitId || produitId.length !== 24) {
      console.log('❌ ID produit invalide');
      return res.json({
        success: false,
        message: 'ID produit invalide'
      });
    }

    // Vérifier que le produit existe AVEC populate de la boutique
    const produit = await Produit.findById(produitId).populate('boutique', 'slug nom');
    if (!produit) {
      console.log('❌ Produit non trouvé');
      return res.json({
        success: false,
        message: 'Produit non trouvé'
      });
    }

    // Vérifier le stock disponible
    if (produit.stock < quantite) {
      console.log('❌ Stock insuffisant');
      return res.json({
        success: false,
        message: `Stock insuffisant. Il ne reste que ${produit.stock} unité(s) disponible(s).`
      });
    }

    console.log('🏪 Produit trouvé:', produit.nom);
    console.log('🏪 Boutique:', produit.boutique);
    console.log('📦 Quantité demandée:', quantite);

    // Initialiser le panier si inexistant
    if (!req.session.panier) {
      console.log('🆕 Initialisation du panier');
      req.session.panier = [];
    }

    console.log('📊 Panier avant ajout:', req.session.panier);

    // Vérifier si produit déjà dans le panier
    const index = req.session.panier.findIndex(item => item.produitId === produitId);

    console.log('📌 Index trouvé:', index);

    if (index !== -1) {
      // Produit déjà dans le panier - incrémenter la quantité
      if (!req.session.panier[index].quantite) {
        req.session.panier[index].quantite = 0;
      }
      req.session.panier[index].quantite += quantite; // ← AJOUTE LA QUANTITÉ SÉLECTIONNÉE
      console.log('📈 Quantité incrémentée:', req.session.panier[index].quantite);
    } else {
      // Nouveau produit - l'ajouter au panier
      req.session.panier.push({ 
        produitId, 
        quantite: quantite // ← UTILISE LA QUANTITÉ SÉLECTIONNÉE
      });
      console.log('🆕 Nouveau produit ajouté avec quantité:', quantite);
    }

    // Calculer le TOTAL des articles (quantité totale)
    const panierCount = req.session.panier.reduce((total, item) => {
      return total + (item.quantite || 1);
    }, 0);

    console.log('🧮 TOTAL articles dans panier:', panierCount);

    // Stocker la boutique actuelle dans la session
    if (produit.boutique && produit.boutique.slug) {
      req.session.boutiqueActuelle = produit.boutique.slug;
      console.log('💾 Slug stocké en session:', produit.boutique.slug);
    } else {
      console.log('⚠️ Aucune boutique trouvée pour le produit');
    }

    console.log('📊 Panier après ajout:', req.session.panier);
    console.log('📍 Boutique actuelle:', req.session.boutiqueActuelle);

    // Sauvegarder explicitement la session
    req.session.save((err) => {
      if (err) {
        console.error('❌ Erreur sauvegarde session:', err);
        return res.json({
          success: false,
          message: 'Erreur sauvegarde session'
        });
      }
      
      console.log('✅ Session sauvegardée avec succès');
      
      // Réponse JSON pour les requêtes AJAX
      console.log('📨 Réponse JSON envoyée');
      res.json({
        success: true,
        message: 'Produit ajouté au panier',
        panierCount: panierCount,
        boutiqueSlug: req.session.boutiqueActuelle,
        quantiteAjoutee: quantite // ← INFORMATION SUPPLEMENTAIRE
      });
    });
    
  } catch (err) {
    console.error('❌ Erreur ajout panier :', err);
    console.error('❌ Stack trace:', err.stack);
    
    res.json({
      success: false,
      message: 'Erreur lors de l\'ajout au panier: ' + err.message
    });
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