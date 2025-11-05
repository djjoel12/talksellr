const express = require('express');
const router = express.Router();
const { uploadMixed } = require('../config/multer-cloudinary'); // 👈 NOUVEAU
const path = require('path');
const fs = require('fs');
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');
const { analyzeImageComplet, geminiQueue } = require('../config/gemini');
const cloudinary = require('../config/cloudinary');
const estVendeur = require('../middlewares/estVendeur');

// GET : formulaire d'ajout produit
router.get('/ajouter', estVendeur, (req, res) => {
  res.render('produit_ajouter');
});

// POST : ajouter un produit avec image ET vidéo compressée - VERSION CORRIGÉE
router.post(
  '/ajouter',
  estVendeur,
  uploadMixed.fields([ // 👈 UTILISEZ uploadMixed
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
      if (!boutique) return res.send("Vous devez d'abord créer votre boutique.");

      const imageFile = req.files['image'] ? req.files['image'][0] : null;
      const videoFile = req.files['video'] ? req.files['video'][0] : null;

      // MAINTENANT les fichiers sont DÉJÀ sur Cloudinary !
      const produit = new Produit({
        nom: req.body.nom,
        description: req.body.description,
        prix: parseFloat(req.body.prix),
        devise: req.body.devise || 'EUR',
        image: imageFile ? imageFile.path : '', // URL Cloudinary directe
        cloudinary_id: imageFile ? imageFile.filename : '',
        videoUrl: videoFile ? videoFile.path : '', // URL Cloudinary directe
        boutique: boutique._id,
        vendeur: req.session.user.id
      });

      await produit.save();
      res.redirect('/produits/mes');
    } catch (err) {
      console.error('Erreur ajout produit:', err);
      res.status(500).send('Erreur ajout produit : ' + err.message);
    }
  }
);

// GET : mes produits (affiche numéro vendeur)
router.get('/mes', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) return res.send("Vous devez d'abord créer votre boutique.");

    const produits = await Produit.find({ boutique: boutique._id })
      .populate('vendeur', 'nom telephone')
      .sort({ dateCreation: -1 });

    res.render('produit_mes', { 
      produits: JSON.parse(JSON.stringify(produits))
    });
  } catch (err) {
    console.error('Erreur affichage produits :', err);
    res.status(500).send('Erreur affichage produits : ' + err.message);
  }
});

// GET : formulaire de modification
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

// POST : modification produit
router.post('/modifier/:id', estVendeur, uploadMixed.single('image'), async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).send('Produit non trouvé');

    const updates = {
      nom: req.body.nom,
      description: req.body.description,
      prix: parseFloat(req.body.prix),
      devise: req.body.devise,
    };

    if (req.file) {
      if (produit.cloudinary_id) {
        await cloudinary.uploader.destroy(produit.cloudinary_id);
      }

      updates.image = req.file.path;
      updates.cloudinary_id = req.file.filename;
    }

    await Produit.findByIdAndUpdate(req.params.id, updates);
    res.redirect('/produits/mes');
  } catch (err) {
    console.error('Erreur modification produit:', err);
    res.status(500).send('Erreur modification produit : ' + err.message);
  }
});

// POST : supprimer produit
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

// GET : Formulaire d'import en masse
router.get('/import-masse', estVendeur, (req, res) => {
  res.render('produit_import_masse');
});

// POST : Import en masse avec galerie de photos - VERSION CLOUDINARY
router.post('/import-masse', estVendeur, uploadMixed.any(), async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) {
      return res.status(400).json({ 
        success: false, 
        message: "Vous devez d'abord créer votre boutique." 
      });
    }

    const produitsData = JSON.parse(req.body.produits);
    const fichiers = req.files || [];
    const produitsCrees = [];
    const erreurs = [];

    console.log(`🔄 Début import de ${produitsData.length} produits`);
    console.log(`📁 Total fichiers reçus: ${fichiers.length}`);

    // Grouper les fichiers par produit (DÉJÀ sur Cloudinary)
    const fichiersParProduit = {};
    
    fichiers.forEach(file => {
      const match = file.fieldname.match(/(photos|video)-(\d+)/);
      if (match) {
        const type = match[1];
        const productNumber = match[2];
        
        if (!fichiersParProduit[productNumber]) {
          fichiersParProduit[productNumber] = { photos: [], video: null };
        }
        
        if (type === 'photos') {
          // Fichier DÉJÀ sur Cloudinary
          fichiersParProduit[productNumber].photos.push({
            url: file.path, // URL Cloudinary
            cloudinary_id: file.filename,
            ordre: fichiersParProduit[productNumber].photos.length
          });
        } else if (type === 'video') {
          fichiersParProduit[productNumber].video = file.path; // URL Cloudinary
        }
      }
    });

    console.log('📊 Fichiers groupés par produit:', Object.keys(fichiersParProduit).length);

    for (let i = 0; i < produitsData.length; i++) {
      try {
        const produitData = produitsData[i];
        const productNumber = i + 1;
        
        if (!produitData.nom || !produitData.prix || !produitData.devise) {
          erreurs.push(`Produit ${productNumber}: Nom, prix et devise sont obligatoires`);
          continue;
        }

        const fichiersProduit = fichiersParProduit[productNumber] || { photos: [], video: null };
        const imagesGallery = fichiersProduit.photos || [];
        const videoUrl = fichiersProduit.video || '';

        console.log(`📸 Produit ${productNumber} "${produitData.nom}": ${imagesGallery.length} photos, ${videoUrl ? '1 vidéo' : '0 vidéo'}`);

        // Création du produit
        const imagePrincipale = imagesGallery.length > 0 ? imagesGallery[0].url : '';
        const cloudinaryIdPrincipal = imagesGallery.length > 0 ? imagesGallery[0].cloudinary_id : '';

        const produit = new Produit({
          nom: produitData.nom,
          description: produitData.description || '',
          prix: parseFloat(produitData.prix),
          devise: produitData.devise || 'EUR',
          image: imagePrincipale,
          cloudinary_id: cloudinaryIdPrincipal,
          imagesGallery: imagesGallery,
          videoUrl: videoUrl,
          categorie: produitData.categorie || '',
          stock: parseInt(produitData.stock) || 0,
          sku: produitData.sku || `SKU-${Date.now()}-${i}`,
          boutique: boutique._id,
          vendeur: req.session.user.id
        });

        await produit.save();
        produitsCrees.push(produit);
        console.log(`✅ Produit ${productNumber} créé: "${produitData.nom}" avec ${imagesGallery.length} photos`);

      } catch (error) {
        console.error(`❌ Erreur produit ${i+1}:`, error);
        erreurs.push(`Produit ${i+1}: ${error.message}`);
      }
    }

    // Réponse JSON
    const result = {
      success: true,
      message: `${produitsCrees.length} produit(s) créé(s) avec succès`,
      produitsCrees: produitsCrees.length,
      erreurs: erreurs
    };

    console.log('📊 Résultat import:', result);
    res.json(result);

  } catch (error) {
    console.error('💥 Erreur globale import:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'import: " + error.message
    });
  }
});

// Route pour l'import simple
router.post('/import-masse-simple', estVendeur, uploadMixed.any(), async (req, res) => {
  let fichiersASupprimer = [];
  let boutique = null;
  
  try {
    boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) {
      return res.status(400).json({ 
        success: false, 
        message: "Créez d'abord votre boutique." 
      });
    }

    const { prixProduits } = req.body;
    const fichiers = req.files || [];
    const produitsCrees = [];
    fichiersASupprimer = [];

    console.log(`\n🚀 IMPORT MASSIVE - DÉBUT (100+ IMAGES SUPPORT)`);
    console.log('💰 Prix reçus:', typeof prixProduits);
    console.log('📸 Fichiers reçus:', fichiers.length);

    // Grouper fichiers par produit
    const fichiersParProduit = {};
    fichiers.forEach(file => {
      const match = file.fieldname.match(/(photos)-(\d+)/);
      if (match) {
        const productNumber = match[2];
        if (!fichiersParProduit[productNumber]) {
          fichiersParProduit[productNumber] = { photos: [] };
        }
        fichiersParProduit[productNumber].photos.push(file);
      }
    });

    const totalProduits = Object.keys(fichiersParProduit).length;
    console.log('📊 Produits à traiter:', totalProduits);

    // Traitement PARALLÈLE avec Promises
    const traitementsProduits = [];

    for (let i = 0; i < totalProduits; i++) {
      const productNumber = i + 1;
      const fichiersProduit = fichiersParProduit[productNumber] || { photos: [] };
      
      const traitement = traiterProduit(
        productNumber, 
        fichiersProduit, 
        prixProduits, 
        boutique, 
        req.session.user.id
      ).then(produit => {
        if (produit) {
          produitsCrees.push(produit);
          console.log(`✅ Produit ${productNumber}/${totalProduits} terminé`);
        }
        return produit;
      }).catch(error => {
        console.error(`💥 Erreur produit ${productNumber}:`, error.message);
        return null;
      });

      traitementsProduits.push(traitement);
    }

    // Attendre que TOUS les traitements finissent
    console.log(`\n⏳ Attente de ${traitementsProduits.length} traitements...`);
    await Promise.all(traitementsProduits);

    const stats = geminiQueue ? geminiQueue.getStats() : { successful: 0, failed: 0, retries: 0, queueLength: 0 };
    
    const result = {
      success: true,
      message: `${produitsCrees.length}/${totalProduits} produits créés avec succès`,
      produitsCrees: produitsCrees.length,
      avecIA: produitsCrees.filter(p => p.nom_ia && p.nom_ia !== '').length,
      statsIA: {
        reussites: stats.successful,
        echecs: stats.failed,
        retrys: stats.retries,
        queueRestante: stats.queueLength
      }
    };

    console.log('\n📊 RÉSULTAT IMPORT MASSIVE:', result);
    res.json(result);

  } catch (err) {
    console.error('💥 ERREUR GLOBALE IMPORT:', err);
    
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur: ' + err.message 
    });
  }
});

// FONCTION DE TRAITEMENT D'UN PRODUIT - VERSION CLOUDINARY
async function traiterProduit(productNumber, fichiersProduit, prixProduits, boutique, userId) {
  console.log(`\n--- DÉBUT PRODUIT ${productNumber} ---`);
  
  try {
    // RÉCUPÉRATION PRIX
    let prix = null;
    if (typeof prixProduits === 'string') {
      try {
        const prixObj = JSON.parse(prixProduits);
        prix = prixObj[productNumber];
      } catch (parseError) {
        console.log(`❌ Erreur parsing prix ${productNumber}:`, parseError.message);
      }
    } else if (typeof prixProduits === 'object') {
      prix = prixProduits[productNumber];
    }
    
    if (!prix || isNaN(parseFloat(prix))) {
      console.log(`❌ Prix invalide produit ${productNumber}:`, prix);
      return null;
    }

    const prixNumber = parseFloat(prix);
    console.log(`✅ Prix ${productNumber} validé: ${prixNumber}€`);

    let donneesIA = null;
    const imagesGallery = [];

    // ANALYSE IA AVEC QUEUE INTELLIGENTE - VERSION CORRIGÉE
if (fichiersProduit.photos.length > 0) {
  const premierePhoto = fichiersProduit.photos[0];
  
  try {
    console.log(`🧠 Ajout à la queue IA: Produit ${productNumber}`);
    console.log(`📸 URL Cloudinary: ${premierePhoto.path}`);
    
    // OPTION 1: Utiliser directement l'URL Cloudinary pour l'analyse
    // L'IA Gemini peut analyser les images via URL
    donneesIA = await analyzeImageComplet(null, {
      imageUrl: premierePhoto.path, // On passe l'URL Cloudinary
      fileName: premierePhoto.originalname,
      productNumber: productNumber
    });
    
    if (donneesIA && donneesIA.nom) {
      console.log(`✅ IA ${productNumber} réussie: ${donneesIA.nom}`);
    } else {
      console.log(`🔄 IA ${productNumber} - utilisation fallback`);
    }
    
  } catch (iaError) {
    console.error(`❌ Erreur IA ${productNumber}:`, iaError.message);
  }

  // UTILISER DIRECTEMENT LES URLS CLOUDINARY
  fichiersProduit.photos.forEach((photoFile, index) => {
    imagesGallery.push({
      url: photoFile.path, // URL Cloudinary
      cloudinary_id: photoFile.filename,
      ordre: index
    });
  });
}

    // DÉTERMINER LES DONNÉES FINALES
    let nomProduit, descriptionProduit, categorieProduit;

    if (donneesIA && donneesIA.nom) {
      nomProduit = donneesIA.nom;
      descriptionProduit = donneesIA.description || 'Produit de qualité professionnelle avec design soigné.';
      categorieProduit = donneesIA.categorie || 'Équipement professionnel';
      console.log(`🎯 Produit ${productNumber} - Données IA utilisées`);
    } else {
      const nomFichier = fichiersProduit.photos[0]?.originalname.toLowerCase() || '';
      console.log(`🆘 Produit ${productNumber} - Mode secours: ${nomFichier}`);
      
      // Fallback intelligent basé sur le nom de fichier
      if (nomFichier.includes('pomp') || nomFichier.includes('motor') || nomFichier.includes('pump')) {
        nomProduit = 'Pompe motorisée ZARA professionnelle';
        descriptionProduit = 'Pompe motorisée ZARA haute performance. Débit élevé, moteur puissant et silencieux.';
        categorieProduit = 'Outillage industriel';
      } else if (nomFichier.includes('zara') || nomFichier.includes('fashion') || nomFichier.includes('cloth')) {
        nomProduit = 'Vêtement ZARA collection premium';
        descriptionProduit = 'Vêtement ZARA de la dernière collection. Style moderne et tendance.';
        categorieProduit = 'Mode et Vêtements';
      } else {
        nomProduit = 'Équipement professionnel de qualité';
        descriptionProduit = 'Produit professionnel robuste et fiable.';
        categorieProduit = 'Équipement professionnel';
      }
    }

    // STOCK EXPLICITE
    const stockProduit = 10;
    console.log(`📦 Stock produit ${productNumber}: ${stockProduit}`);

    // CRÉATION DU PRODUIT
    const produit = new Produit({
      prix: prixNumber,
      devise: 'EUR',
      nom: nomProduit,
      description: descriptionProduit,
      categorie: categorieProduit,
      stock: stockProduit,
      
      // Données IA
      nom_ia: donneesIA ? donneesIA.nom : '',
      description_ia: donneesIA ? donneesIA.description : '',
      categorie_ia: donneesIA ? donneesIA.categorie : '',
      sous_categorie_ia: donneesIA ? donneesIA.sous_categorie : '',
      tags_ia: donneesIA ? donneesIA.tags : ['professionnel', 'qualité', 'robuste'],
      couleurs_ia: donneesIA ? donneesIA.couleurs : ['Noir', 'Gris métallisé'],
      style_ia: donneesIA ? donneesIA.style : 'Professionnel',
      materiau_ia: donneesIA ? donneesIA.materiau : 'Métal haute résistance',
      etat_ia: donneesIA ? donneesIA.etat : 'Neuf',
      marque_ia: donneesIA ? donneesIA.marque : 'ZARA',
      
      // Gallery
      image: imagesGallery.length > 0 ? imagesGallery[0].url : '',
      cloudinary_id: imagesGallery.length > 0 ? imagesGallery[0].cloudinary_id : '',
      imagesGallery: imagesGallery,
      
      // Références
      boutique: boutique._id,
      vendeur: userId,
      sku: `SKU-${Date.now()}-${productNumber}`
    });

    await produit.save();
    console.log(`🎉 PRODUIT ${productNumber} CRÉÉ: "${produit.nom}" - ${prixNumber}€`);
    
    return produit;

  } catch (error) {
    console.error(`💥 ERREUR CRITIQUE produit ${productNumber}:`, error.message);
    throw error;
  }
}

module.exports = router;