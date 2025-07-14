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
