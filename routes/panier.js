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

// GET route pour afficher panier
router.get('/', async (req, res) => {
  try {
    const panier = req.session.panier || [];
    const user = req.session.user;

    console.log('=== PANIER SIMPLIFIÉ ===');
    console.log('Utilisateur:', user ? 'Connecté' : 'Non connecté');
    console.log('Boutique en session:', req.session.boutiqueActuelle);

    let slug = req.session.boutiqueActuelle || null;
    
    // Si pas de slug en session, essayer de le trouver depuis le referer
    if (!slug && req.get('Referer')) {
      const referer = req.get('Referer');
      const boutiqueMatch = referer.match(/boutique\/([^\/\?]+)/);
      if (boutiqueMatch) {
        slug = boutiqueMatch[1];
        req.session.boutiqueActuelle = slug;
      }
    }

    // Si panier vide
    if (panier.length === 0) {
      return res.render('panier', { 
        panier: [],
        total: 0,
        slug: slug,
        user: user,
        req: req
      });
    }

    // Récupérer les produits depuis la BDD
    const produitsIds = panier.map(item => item.produitId);
    const produits = await Produit.find({ _id: { $in: produitsIds } })
      .populate('vendeur', 'nom telephone')
      .populate('boutique', 'slug nom');

    // Déterminer le slug final depuis les produits si pas déjà défini
    if (!slug && produits.length > 0) {
      const produitAvecBoutique = produits.find(p => p.boutique && p.boutique.slug);
      if (produitAvecBoutique) {
        slug = produitAvecBoutique.boutique.slug;
        req.session.boutiqueActuelle = slug;
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

    res.render('panier', { 
      panier: panierDetail,
      total: total,
      slug: slug,
      user: user,
      req: req
    });
    
  } catch (err) {
    console.error('Erreur affichage panier:', err);
    res.status(500).send('Erreur serveur lors de l\'affichage du panier');
  }
});

// POST route pour ajouter un produit au panier - VERSION CORRIGÉE
router.post('/ajouter/:id', async (req, res) => {
  try {
    const produitId = req.params.id;
    
    console.log('🛒 DÉBUT Ajout au panier');
    console.log('📦 Produit ID:', produitId);
    console.log('📝 Body reçu:', req.body);
    console.log('📝 Headers:', req.headers);
    
    // CORRECTION : Toujours utiliser 1 comme quantité
    const quantite = 1;

    // Vérifier que l'ID est valide
    if (!produitId || produitId.length !== 24) {
      console.log('❌ ID produit invalide');
      return res.json({ // TOUJOURS JSON pour AJAX
        success: false,
        message: 'ID produit invalide'
      });
    }

    // Vérifier que le produit existe AVEC populate de la boutique
    const produit = await Produit.findById(produitId).populate('boutique', 'slug nom');
    if (!produit) {
      console.log('❌ Produit non trouvé');
      return res.json({ // TOUJOURS JSON pour AJAX
        success: false,
        message: 'Produit non trouvé'
      });
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
    const index = req.session.panier.findIndex(item => item.produitId === produitId);

    console.log('📌 Index trouvé:', index);

    if (index !== -1) {
      // Produit déjà dans le panier - incrémenter la quantité
      if (!req.session.panier[index].quantite) {
        req.session.panier[index].quantite = 0;
      }
      req.session.panier[index].quantite += quantite;
      console.log('📈 Quantité incrémentée:', req.session.panier[index].quantite);
    } else {
      // Nouveau produit - l'ajouter au panier
      req.session.panier.push({ 
        produitId, 
        quantite: quantite 
      });
      console.log('🆕 Nouveau produit ajouté');
    }

    // CORRECTION : Calculer le TOTAL des articles (quantité totale)
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
        return res.json({ // TOUJOURS JSON même en cas d'erreur
          success: false,
          message: 'Erreur sauvegarde session'
        });
      }
      
      console.log('✅ Session sauvegardée avec succès');
      
      // CORRECTION : TOUJOURS renvoyer du JSON pour les requêtes AJAX
      // Ne pas faire de redirection HTML dans cette route
      console.log('📨 Réponse JSON envoyée');
      res.json({
        success: true,
        message: 'Produit ajouté au panier',
        panierCount: panierCount,
        boutiqueSlug: req.session.boutiqueActuelle
      });
    });
    
  } catch (err) {
    console.error('❌ Erreur ajout panier :', err);
    console.error('❌ Stack trace:', err.stack);
    
    // CORRECTION : TOUJOURS renvoyer du JSON même en cas d'erreur
    res.json({
      success: false,
      message: 'Erreur lors de l\'ajout au panier: ' + err.message
    });
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
          <h3>Test AJAX</h3>
          <button onclick="testAjax()">Tester AJAX</button>
          <div id="ajax-result"></div>
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

        <script>
          async function testAjax() {
            try {
              const resultDiv = document.getElementById('ajax-result');
              resultDiv.innerHTML = 'Envoi en cours...';
              
              const response = await fetch('/panier/ajouter/${produit._id}', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'X-Requested-With': 'XMLHttpRequest'
                },
                body: 'quantite=1'
              });
              
              const data = await response.json();
              resultDiv.innerHTML = '✅ Réponse: ' + JSON.stringify(data, null, 2);
            } catch (error) {
              document.getElementById('ajax-result').innerHTML = '❌ Erreur: ' + error.message;
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

module.exports = router;