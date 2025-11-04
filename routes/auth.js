// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Afficher formulaire inscription
router.get('/register', (req, res) => {
  res.render('register');
});

// Traiter inscription
router.post('/register', async (req, res) => {
  const { nom, email, motDePasse, telephone, role } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.send('Email déjà utilisé');

    const user = new User({ nom, email, motDePasse, telephone, role: role || 'client' });
    await user.save();
    res.redirect('/auth/login');
  } catch (error) {
    res.send('Erreur inscription : ' + error.message);
  }
});

// Afficher formulaire connexion
router.get('/login', (req, res) => {
  // ✅ GESTION UTILISATEUR DÉJÀ CONNECTÉ
  if (req.session.user && req.session.user.role === 'vendeur') {
    const redirectTo = req.query.redirect;
    
    if (redirectTo === 'commandes') {
      console.log('✅ Vendeur déjà connecté, redirection vers commandes');
      return res.redirect('/commandes/mes-commandes');
    } else {
      console.log('✅ Vendeur déjà connecté, redirection vers dashboard');
      return res.redirect('/vendeur/dashboard');
    }
  }
  
  res.render('login', { redirect: req.query.redirect });
});

// Traiter connexion
router.post('/login', async (req, res) => {
  const { email, motDePasse } = req.body;
  
  try {
    const user = await User.findOne({ email });
    if (!user) return res.send('Utilisateur non trouvé');

    const valid = await user.comparePassword(motDePasse);
    if (!valid) return res.send('Mot de passe incorrect');

    req.session.user = { 
      id: user._id, 
      nom: user.nom, 
      email: user.email, 
      role: user.role,
      telephone: user.telephone 
    };

    console.log('✅ Login réussi:', user.nom);
    
    // ✅ REDIRECTION INTELLIGENTE
    const redirectTo = req.query.redirect || req.body.redirect;
    
    if (user.role === 'vendeur') {
      if (redirectTo === 'commandes') {
        console.log('🔗 Redirection vers commandes (lien WhatsApp)');
        return res.redirect('/commandes/mes-commandes');
      } else {
        console.log('🏠 Redirection vers dashboard (connexion normale)');
        return res.redirect('/vendeur/dashboard');
      }
    } else {
      return res.redirect('/');
    }
    
  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.send('Erreur connexion : ' + error.message);
  }
});

// Déconnexion
router.get('/logout', (req, res) => {
  console.log('🚪 Déconnexion utilisateur:', req.session.user?.nom);
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Erreur déconnexion:', err);
    }
    res.redirect('/');
  });
});

module.exports = router;