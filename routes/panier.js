const express = require('express');
const router = express.Router();
const Produit = require('../models/Product');

// Middleware pour logger les requêtes POST
router.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log('📨 POST Request:', {
      url: req.url,
      body: req.body,
      params: req.params
    });
  }
  next();
});

// GET route pour afficher panier AVEC commandes
router.get('/', async (req, res) => {
  try {
    const panier = req.session.panier || [];
    const user = req.session.user;

    console.log('=== DEBUG PANIER AVEC COMMANDES ===');
    console.log('Utilisateur:', user ? user.id : 'Non connecté');
    console.log('Boutique en session:', req.session.boutiqueActuelle);

    let slug = req.session.boutiqueActuelle || null;
    
    // Si pas de slug en session, essayer de le trouver depuis le referer
    if (!slug && req.get('Referer')) {
      const referer = req.get('Referer');
      const boutiqueMatch = referer.match(/boutique\/([^\/\?]+)/);
      if (boutiqueMatch) {
        slug = boutiqueMatch[1];
        req.session.boutiqueActuelle = slug;
        console.log('📌 Slug trouvé depuis referer:', slug);
      }
    }

    // Récupérer les commandes de l'utilisateur s'il est connecté
    let commandes = [];
    if (user && user.id) {
      const Commande = require('../models/Commandes');
      commandes = await Commande.find({ 
        'client.id': user.id 
      })
      .sort({ dateCreation: -1 })
      .limit(5)
      .populate('boutique.id', 'nom slug');
      
      console.log(`📦 Commandes trouvées: ${commandes.length}`);
    }

    // Si panier vide, render avec les commandes
    if (panier.length === 0) {
      console.log('🛒 Panier vide, slug utilisé:', slug);
      
      const renderData = { 
        panier: [],
        total: 0,
        slug: slug,
        user: user,
        commandes: commandes,
        req: req,
        statuts: {
          'en_attente': 'En attente',
          'confirmee': 'Confirmée',
          'en_preparation': 'En préparation',
          'expediee': 'Expédiée',
          'livree': 'Livrée',
          'annulee': 'Annulée'
        }
      };
      
      return res.render('panier', renderData);
    }

    // Récupérer les produits depuis la BDD
    const produitsIds = panier.map(item => item.produitId);
    const produits = await Produit.find({ _id: { $in: produitsIds } })
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'slug nom');

    console.log('📋 Produits trouvés dans panier:', produits.length);

    // Déterminer le slug final depuis les produits si pas déjà défini
    if (!slug && produits.length > 0) {
      const produitAvecBoutique = produits.find(p => p.boutique && p.boutique.slug);
      if (produitAvecBoutique) {
        slug = produitAvecBoutique.boutique.slug;
        req.session.boutiqueActuelle = slug;
        console.log('📌 Slug défini depuis produits:', slug);
      }
    }

    // Fusionner infos produit + quantité et calculer le total
    let total = 0;
    const panierDetail = panier.map(item => {
      const produit = produits.find(p => p._id.toString() === item.produitId);
      const sousTotal = produit ? produit.prix * item.quantite : 0;
      total += sousTotal;
      
      return {
        produit,
        quantite: item.quantite,
        sousTotal: sousTotal
      };
    });

    const renderData = { 
      panier: panierDetail,
      total: total,
      slug: slug,
      user: user,
      commandes: commandes,
      req: req,
      statuts: {
        'en_attente': 'En attente',
        'confirmee': 'Confirmée',
        'en_preparation': 'En préparation',
        'expediee': 'Expédiée',
        'livree': 'Livrée',
        'annulee': 'Annulée'
      }
    };

    console.log('🎯 Données finales - Slug:', slug);
    
    res.render('panier', renderData);
    
  } catch (err) {
    console.error('Erreur affichage panier avec commandes :', err);
    res.status(500).send('Erreur serveur lors de l\'affichage du panier');
  }
});

// POST route pour ajouter un produit au panier - VERSION ULTRA SIMPLIFIÉE
router.post('/ajouter/:id', async (req, res) => {
  try {
    const produitId = req.params.id;
    
    console.log('🛒 DÉBUT Ajout au panier');
    console.log('📦 Produit ID:', produitId);
    console.log('📝 Body reçu:', req.body);
    console.log('📝 Query reçu:', req.query);
    
    // CORRECTION SIMPLIFIÉE : Toujours utiliser 1 comme quantité
    const quantite = 1;
    console.log('🔢 Quantité utilisée:', quantite);

    // Vérifier que le produit existe AVEC populate de la boutique
    const produit = await Produit.findById(produitId).populate('boutique', 'slug nom');
    if (!produit) {
      console.log('❌ Produit non trouvé');
      return res.status(404).send('Produit non trouvé');
    }

    console.log('🏪 Produit trouvé:', produit.nom);
    console.log('🏪 Boutique:', produit.boutique);

    // Initialiser le panier si inexistant
    if (!req.session.panier) {
      console.log('🆕 Initialisation du panier');
      req.session.panier = [];
    }

    console.log('📊 Panier avant ajout:', req.session.panier);

    // Vérifier si produit déjà dans le panier
    const index = req.session.panier.findIndex(item => {
      console.log('🔍 Comparaison:', item.produitId, '===', produitId);
      return item.produitId === produitId;
    });

    console.log('📌 Index trouvé:', index);

    if (index !== -1) {
      // CORRECTION : Vérifier que l'item existe avant d'incrémenter
      if (req.session.panier[index]) {
        // Initialiser la quantité si elle n'existe pas
        if (!req.session.panier[index].quantite) {
          req.session.panier[index].quantite = 0;
        }
        // Incrémenter la quantité
        req.session.panier[index].quantite += quantite;
        console.log('📈 Quantité incrémentée:', req.session.panier[index].quantite);
      } else {
        console.log('⚠️ Item à l\'index', index, 'est undefined');
        // Ajouter comme nouvel item
        req.session.panier.push({ 
          produitId, 
          quantite: quantite 
        });
      }
    } else {
      // Ajouter comme nouvel item
      req.session.panier.push({ 
        produitId, 
        quantite: quantite 
      });
      console.log('🆕 Nouveau produit ajouté');
    }

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
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
          return res.json({
            success: false,
            message: 'Erreur sauvegarde session'
          });
        } else {
          return res.status(500).send('Erreur sauvegarde session');
        }
      }
      
      console.log('✅ Session sauvegardée avec succès');
      
      // Réponse JSON pour AJAX ou redirection normale
      if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
        console.log('📨 Réponse AJAX envoyée');
        res.json({
          success: true,
          message: 'Produit ajouté au panier',
          panierCount: req.session.panier.length,
          boutiqueSlug: req.session.boutiqueActuelle
        });
      } else {
        console.log('🔄 Redirection vers:', req.get('Referer') || '/panier');
        const referer = req.get('Referer') || '/panier';
        res.redirect(referer);
      }
    });
    
  } catch (err) {
    console.error('❌ Erreur ajout panier :', err);
    console.error('❌ Stack trace:', err.stack);
    
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({
        success: false,
        message: 'Erreur lors de l\'ajout au panier: ' + err.message
      });
    } else {
      res.status(500).send('Erreur serveur lors de l\'ajout au panier: ' + err.message);
    }
  }
});

// Supprimer un produit du panier
router.post('/supprimer/:id', (req, res) => {
  try {
    const produitId = req.params.id;

    console.log('🗑️ Suppression du produit:', produitId);

    if (!req.session.panier) {
      req.session.panier = [];
    }

    req.session.panier = req.session.panier.filter(item => item.produitId !== produitId);

    console.log('📊 Panier après suppression:', req.session.panier);

    // Sauvegarder la session après modification
    req.session.save((err) => {
      if (err) {
        console.error('Erreur sauvegarde session:', err);
      }
      res.redirect('/panier');
    });
  } catch (err) {
    console.error('Erreur suppression panier:', err);
    res.status(500).send('Erreur lors de la suppression');
  }
});

// Route de debug des sessions
router.get('/debug-session', (req, res) => {
  const sessionData = {
    sessionID: req.sessionID,
    boutiqueActuelle: req.session.boutiqueActuelle,
    panier: req.session.panier,
    user: req.session.user,
    sessionKeys: Object.keys(req.session)
  };
  
  console.log('🔍 Session debug:', sessionData);
  res.json(sessionData);
});

// Route pour reset la session (développement seulement)
router.get('/reset-session', (req, res) => {
  req.session.panier = [];
  req.session.boutiqueActuelle = null;
  req.session.save((err) => {
    if (err) {
      console.error('Erreur reset session:', err);
      return res.status(500).send('Erreur reset session');
    }
    res.send('Session resetée - Panier: [] - Boutique: null');
  });
});

// Route test d'ajout
router.get('/test-ajout/:id', async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) {
      return res.status(404).send('Produit non trouvé');
    }
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Ajout Panier</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ccc; }
          button { padding: 10px 15px; margin: 5px; }
        </style>
      </head>
      <body>
        <h1>Test d'ajout au panier</h1>
        <div class="test-section">
          <h3>Produit: ${produit.nom}</h3>
          <p>Prix: ${produit.prix} ${produit.devise}</p>
          <p>ID: ${produit._id}</p>
        </div>
        
        <div class="test-section">
          <h3>Formulaire normal POST</h3>
          <form action="/panier/ajouter/${produit._id}" method="POST">
            <input type="hidden" name="quantite" value="1">
            <button type="submit">Tester l'ajout (POST normal)</button>
          </form>
        </div>
        
        <div class="test-section">
          <h3>Liens de test</h3>
          <a href="/panier/debug-session" target="_blank">Voir la session</a><br>
          <a href="/panier">Voir le panier</a><br>
          <a href="/panier/reset-session">Reset session</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

module.exports = router;