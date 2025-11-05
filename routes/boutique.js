const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadTemp = require('../config/storage-temp'); // 👈 NOUVEAU
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
// Dans votre fichier de routes (boutique.js ou produit.js)
// 🔥 DÉPLACER CES FONCTIONS AVANT LA ROUTE

// 🔥 NOUVELLE FONCTION : Catégorisation IA des produits
async function categoriserProduitsParIA(produits) {
  const produitsAvecCategories = [];
  
  for (const produit of produits) {
    try {
      let categorieIA = produit.categorie_ia;
      
      // Si pas de catégorie IA, analyser le nom et description
      if (!categorieIA || categorieIA === 'Divers' || categorieIA === 'Équipement professionnel') {
        categorieIA = await analyserCategorieProduit(produit);
        
        // Mettre à jour le produit en base de données
        await Produit.findByIdAndUpdate(produit._id, {
          categorie_ia: categorieIA,
          categorie: categorieIA // Mettre aussi dans la catégorie principale
        });
      }
      
      produitsAvecCategories.push({
        ...produit.toObject(),
        categorie_finale: categorieIA,
        sous_categorie: produit.sous_categorie_ia || 'Collection'
      });
      
    } catch (error) {
      console.error(`Erreur catégorisation produit ${produit.nom}:`, error);
      // Fallback : utiliser la catégorie existante
      produitsAvecCategories.push({
        ...produit.toObject(),
        categorie_finale: produit.categorie || 'Collection Exclusive',
        sous_categorie: 'Collection'
      });
    }
  }
  
  return produitsAvecCategories;
}

// 🔥 NOUVELLE FONCTION : Analyse IA pour déterminer la catégorie
async function analyserCategorieProduit(produit) {
  try {
    const texteAAnalyser = `${produit.nom} ${produit.description || ''} ${produit.tags_ia ? produit.tags_ia.join(' ') : ''}`.toLowerCase();
    
    // Règles de catégorisation basées sur le contenu
    if (texteAAnalyser.includes('pomp') || texteAAnalyser.includes('motor') || 
        texteAAnalyser.includes('pump') || texteAAnalyser.includes('moteur')) {
      return 'Outillage Industriel';
    }
    
    if (texteAAnalyser.includes('zara') || texteAAnalyser.includes('fashion') || 
        texteAAnalyser.includes('cloth') || texteAAnalyser.includes('vetement') ||
        texteAAnalyser.includes('mode') || texteAAnalyser.includes('style')) {
      return 'Mode & Vêtements';
    }
    
    if (texteAAnalyser.includes('basket') || texteAAnalyser.includes('chaussure') ||
        texteAAnalyser.includes('shoe') || texteAAnalyser.includes('sneaker')) {
      return 'Chaussures';
    }
    
    if (texteAAnalyser.includes('tech') || texteAAnalyser.includes('electronique') ||
        texteAAnalyser.includes('smart') || texteAAnalyser.includes('digital')) {
      return 'Électronique';
    }
    
    if (texteAAnalyser.includes('maquillage') || texteAAnalyser.includes('beauté') ||
        texteAAnalyser.includes('cosmétique') || texteAAnalyser.includes('parfum')) {
      return 'Beauté & Cosmétiques';
    }
    
    if (texteAAnalyser.includes('maison') || texteAAnalyser.includes('déco') ||
        texteAAnalyser.includes('meuble') || texteAAnalyser.includes('décoration')) {
      return 'Maison & Déco';
    }
    
    if (texteAAnalyser.includes('sport') || texteAAnalyser.includes('fitness') ||
        texteAAnalyser.includes('training') || texteAAnalyser.includes('gym')) {
      return 'Sport & Fitness';
    }
    
    // Fallback basé sur le prix
    if (produit.prix > 500) {
      return 'Luxe & Premium';
    }
    
    if (produit.prix < 100) {
      return 'Accessoires';
    }
    
    return 'Collection Exclusive';
    
  } catch (error) {
    console.error('Erreur analyse catégorie:', error);
    return 'Collection Exclusive';
  }
}

// 🔥 NOUVELLE FONCTION : Organiser les produits par catégories
function organiserParCategories(produits) {
  const categories = {};
  
  produits.forEach(produit => {
    const categorie = produit.categorie_finale || 'Collection Exclusive';
    
    if (!categories[categorie]) {
      categories[categorie] = {
        nom: categorie,
        produits: [],
        icone: getIconeCategorie(categorie)
      };
    }
    
    categories[categorie].produits.push(produit);
  });
  
  return categories;
}

// 🔥 NOUVELLE FONCTION : Icônes pour chaque catégorie
function getIconeCategorie(categorie) {
  const icones = {
    'Mode & Vêtements': '👕',
    'Chaussures': '👟',
    'Accessoires': '👜',
    'Beauté & Cosmétiques': '💄',
    'Maison & Déco': '🏠',
    'Électronique': '📱',
    'Sport & Fitness': '⚽',
    'Outillage Industriel': '🔧',
    'Luxe & Premium': '💎',
    'Collection Exclusive': '⭐'
  };
  
  return icones[categorie] || '📦';
}

// 🔥 FONCTION : Descriptions pour chaque catégorie
function getDescriptionCategorie(nomCategorie) {
  const descriptions = {
    'Mode & Vêtements': 'Découvrez notre collection de vêtements tendance et élégants',
    'Chaussures': 'Des chaussures confortables et stylées pour toutes les occasions',
    'Accessoires': 'Complétez votre look avec nos accessoires sélectionnés',
    'Beauté & Cosmétiques': 'Produits de beauté et cosmétiques pour sublimer votre routine',
    'Maison & Déco': 'Élégance et design pour votre intérieur',
    'Électronique': 'Technologie innovante et design moderne',
    'Sport & Fitness': 'Équipement sportif pour performance et style',
    'Outillage Industriel': 'Outils professionnels de qualité supérieure',
    'Luxe & Premium': 'Pièces exclusives et raffinées',
    'Collection Exclusive': 'Nos créations les plus prestigieuses'
  };
  return descriptions[nomCategorie] || 'Découvrez notre sélection de produits soigneusement choisis';
}

// MAINTENANT LA ROUTE
router.get('/:slug', async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ slug: req.params.slug });
    if (!boutique) {
      return res.status(404).render('boutiques_templates/standard', { 
        title: 'Boutique non trouvée',
        message: 'Cette boutique n\'existe pas'
      });
    }

    const produits = await Produit.find({ boutique: boutique._id })
      .sort({ dateCreation: -1 });

    const produitsAvecCategories = await categoriserProduitsParIA(produits);
    const produitsParCategorie = organiserParCategories(produitsAvecCategories);

    // CHOISIR LE TEMPLATE SELON LE NOM/STYLE DE LA BOUTIQUE
    let template = 'boutiques_templates/standard'; // template par défaut
    
    // Mapping des templates selon le nom de la boutique
    const nomBoutique = boutique.nom.toLowerCase();
    
    if (nomBoutique.includes('dior') || nomBoutique.includes('luxe') || nomBoutique.includes('premium')) {
      template = 'boutiques_templates/dior';
    } else if (nomBoutique.includes('nike') || nomBoutique.includes('sport') || nomBoutique.includes('athletic')) {
      template = 'boutiques_templates/nike';
    } else if (nomBoutique.includes('zara') || nomBoutique.includes('fashion') || nomBoutique.includes('mode')) {
      template = 'boutiques_templates/zara';
    }

    console.log(`🎨 Utilisation du template: ${template} pour la boutique: ${boutique.nom}`);

    res.render(template, {
      title: boutique.nom,
      boutique,
      produits: produitsAvecCategories,
      produitsParCategorie,
      user: req.session.user,
      panierCount: req.session.panier ? req.session.panier.length : 0,
      getDescriptionCategorie // 🔥 AJOUTER LA FONCTION AU TEMPLATE
    });

  } catch (error) {
    console.error('Erreur chargement boutique:', error);
    // 🔥 CORRECTION : Ne pas utiliser boutique dans le rendu d'erreur
    res.status(500).render('boutiques_templates/standard', {
      title: 'Erreur',
      message: 'Une erreur est survenue lors du chargement de la boutique'
    });
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
// Route : afficher un produit par ID
// Route : afficher un produit par ID
router.get('/produit/:id', async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id)
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'nom slug');

    if (!produit) {
      return res.status(404).render('404', {
        title: 'Produit non trouvé',
        message: 'Le produit que vous recherchez n\'existe pas.'
      });
    }

    // Récupérer d'autres produits du même vendeur
    const produitsVendeur = await Produit.find({ 
      vendeur: produit.vendeur._id,
      _id: { $ne: produit._id } // Exclure le produit actuel
    }).limit(4);

    // Récupérer le panier depuis la session
    const panier = req.session.panier || [];
    let totalPanier = 0;
    let totalArticles = 0;

    // Calculer le total du panier et le nombre total d'articles
    if (panier.length > 0) {
      const produitsIds = panier.map(item => item.produitId);
      const produitsPanier = await Produit.find({ _id: { $in: produitsIds } });
      
      totalPanier = panier.reduce((total, item) => {
        const produit = produitsPanier.find(p => p._id.toString() === item.produitId);
        return total + (produit ? produit.prix * item.quantite : 0);
      }, 0);

      // Calcul du nombre total d'articles (somme des quantités)
      totalArticles = panier.reduce((total, item) => total + item.quantite, 0);
    }

    res.render('produit_detail', {
      produit,
      produitsVendeur,
      boutique: produit.boutique,
      panier: panier,
      totalPanier: totalPanier,
      totalArticles: totalArticles, // <-- N'oublions pas de passer cette variable
      user: req.session.user
    });

  } catch (error) {
    console.error('❌ Erreur affichage produit:', error);
    res.status(500).render('error', {
      title: 'Erreur serveur',
      message: 'Une erreur est survenue lors du chargement du produit.'
    });
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