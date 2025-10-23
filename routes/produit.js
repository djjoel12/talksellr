const express = require('express');
const router = express.Router();
const upload = require('../config/storage'); // Multer + Cloudinary
const Produit = require('../models/Product');
const Boutique = require('../models/Boutique');
const cloudinary = require('../config/cloudinary');
const estVendeur = require('../middlewares/estVendeur');

// GET : formulaire d’ajout produit
router.get('/ajouter', estVendeur, (req, res) => {
  res.render('produit_ajouter');
});

// POST : ajouter un produit avec image ET vidéo compressée
router.post(
  '/ajouter',
  estVendeur,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
      if (!boutique) return res.send('Vous devez d’abord créer votre boutique.');

      const imageFile = req.files['image'] ? req.files['image'][0] : null;
      const videoFile = req.files['video'] ? req.files['video'][0] : null;

      let imageUrl = '';
      let imageId = '';
      let videoUrl = '';

      if (imageFile) {
        imageUrl = imageFile.path;
        imageId = imageFile.public_id;
      }

      if (videoFile) {
        // Compresser la vidéo automatiquement lors de l’upload sur Cloudinary
        const videoCompressed = await cloudinary.uploader.upload(videoFile.path, {
          resource_type: 'video',
          folder: 'produits/videos',
          transformation: [
            { width: 640, height: 360, crop: 'limit' },
            { quality: 'auto' }
          ]
        });
        videoUrl = videoCompressed.secure_url;
      }

      const produit = new Produit({
        nom: req.body.nom,
        description: req.body.description,
        prix: parseFloat(req.body.prix),
        devise: req.body.devise || 'EUR',
        image: imageUrl,
        cloudinary_id: imageId,
        videoUrl: videoUrl,
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
// GET : mes produits avec galerie
router.get('/mes', estVendeur, async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) return res.send('Vous devez d\'abord créer votre boutique.');

    const produits = await Produit.find({ boutique: boutique._id })
      .populate('vendeur', 'nom telephone')
      .sort({ dateCreation: -1 });

    res.render('produit_mes', { 
      produits: JSON.parse(JSON.stringify(produits)) // Pour sérialiser les données pour EJS
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
router.post('/modifier/:id', estVendeur, upload.single('image'), async (req, res) => {
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
      updates.cloudinary_id = req.file.public_id;
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

// POST : Import en masse avec plusieurs photos par produit
// POST : Import en masse avec plusieurs photos par produit
// POST : Import en masse avec galerie de photos
// POST : Import en masse avec galerie de photos - VERSION CORRIGÉE
// POST : Import en masse avec galerie de photos - VERSION CORRIGÉ
// POST : Import en masse avec gestion correcte des fichiers multiples
router.post('/import-masse', estVendeur, upload.any(), async (req, res) => {
  try {
    const boutique = await Boutique.findOne({ proprietaire: req.session.user.id });
    if (!boutique) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vous devez d\'abord créer votre boutique.' 
      });
    }

    const produitsData = JSON.parse(req.body.produits);
    const fichiers = req.files || [];
    const produitsCrees = [];
    const erreurs = [];

    console.log(`🔄 Début import de ${produitsData.length} produits`);
    console.log(`📁 Total fichiers reçus: ${fichiers.length}`);

    // Grouper les fichiers par produit
    const fichiersParProduit = {};
    
    fichiers.forEach(file => {
      // Extraire le numéro du produit du fieldname
      const match = file.fieldname.match(/(photos|video)-(\d+)/);
      if (match) {
        const type = match[1]; // 'photos' ou 'video'
        const productNumber = match[2];
        
        if (!fichiersParProduit[productNumber]) {
          fichiersParProduit[productNumber] = { photos: [], video: null };
        }
        
        if (type === 'photos') {
          fichiersParProduit[productNumber].photos.push(file);
        } else if (type === 'video') {
          fichiersParProduit[productNumber].video = file;
        }
      }
    });

    console.log('📊 Fichiers groupés par produit:', fichiersParProduit);

    for (let i = 0; i < produitsData.length; i++) {
      try {
        const produitData = produitsData[i];
        const productNumber = i + 1;
        
        if (!produitData.nom || !produitData.prix || !produitData.devise) {
          erreurs.push(`Produit ${productNumber}: Nom, prix et devise sont obligatoires`);
          continue;
        }

        const fichiersProduit = fichiersParProduit[productNumber] || { photos: [], video: null };
        const photosFiles = fichiersProduit.photos || [];
        const videoFile = fichiersProduit.video;

        console.log(`📸 Produit ${productNumber} "${produitData.nom}": ${photosFiles.length} photos, ${videoFile ? '1 vidéo' : '0 vidéo'}`);

        let imagesGallery = [];
        let videoUrl = '';

        // Traitement de la galerie de photos
        if (photosFiles.length > 0) {
          console.log(`🖼️ Traitement des ${photosFiles.length} photos pour produit ${productNumber}`);
          
          for (let j = 0; j < photosFiles.length; j++) {
            const photoFile = photosFiles[j];
            console.log(`📸 Photo ${j + 1}:`, photoFile.originalname);
            
            imagesGallery.push({
              url: photoFile.path,
              cloudinary_id: photoFile.public_id || `img-${Date.now()}-${productNumber}-${j}`,
              ordre: j
            });
          }
        } else {
          console.log(`⚠️ Aucune photo trouvée pour le produit ${productNumber}`);
        }

        // Traitement de la vidéo
        if (videoFile) {
          try {
            console.log(`🎥 Traitement vidéo pour produit ${productNumber}:`, videoFile.originalname);
            const videoCompressed = await cloudinary.uploader.upload(videoFile.path, {
              resource_type: 'video',
              folder: 'produits/videos',
              transformation: [
                { width: 640, height: 360, crop: 'limit' },
                { quality: 'auto' }
              ]
            });
            videoUrl = videoCompressed.secure_url;
            console.log(`✅ Vidéo uploadée pour le produit ${productNumber}`);
          } catch (videoError) {
            console.error(`❌ Erreur vidéo produit ${productNumber}:`, videoError);
            erreurs.push(`Produit ${productNumber}: Erreur vidéo - ${videoError.message}`);
          }
        }

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

    const result = {
      success: true,
      message: `${produitsCrees.length} produit(s) créé(s) avec succès sur ${produitsData.length} tentatives`,
      produitsCrees: produitsCrees.length,
      erreurs: erreurs
    };

    console.log('📊 Résultat import final:', result);
    res.json(result);

  } catch (err) {
    console.error('❌ Erreur import masse:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de l\'import: ' + err.message 
    });
  }
});
// POST : amélioration image Cloudinary
router.post('/ameliorer/:id', estVendeur, async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).json({ message: 'Produit non trouvé' });

    if (produit.cloudinary_id) {
      await cloudinary.uploader.destroy(produit.cloudinary_id);
    }

    const result = await cloudinary.uploader.upload(produit.image, {
      folder: 'produits',
      transformation: [
        { width: 1000, height: 1000, crop: 'pad', background: 'white' },
        { effect: 'flatten', background: 'white' },
        { effect: 'auto_color' },
        { effect: 'auto_contrast' },
        { effect: 'sharpen', radius: 200, sigma: 1 },
        { quality: 'auto' }
      ],
    });

    produit.image = result.secure_url;
    produit.cloudinary_id = result.public_id;
    await produit.save();

    res.json({ message: 'Image améliorée avec succès', imageUrl: result.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
