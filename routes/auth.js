// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Assure-toi que ce fichier existe aussi

// Afficher formulaire inscription
router.get('/register', (req, res) => {
  res.render('register');
});

// Traiter inscription
router.post('/register', async (req, res) => {
  const { nom, email, motDePasse, role } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if(existingUser) return res.send('Email déjà utilisé');

    const user = new User({ nom, email, motDePasse, role: role || 'client' });
    await user.save();
    res.redirect('/auth/login');
  } catch (error) {
    res.send('Erreur inscription : ' + error.message);
  }
});
// Afficher formulaire connexion
router.get('/login', (req, res) => {
  res.render('login');
});

// Traiter connexion
router.post('/login', async (req, res) => {
  const { email, motDePasse } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.send('Utilisateur non trouvé');

    const valid = await user.comparePassword(motDePasse);
    if (!valid) return res.send('Mot de passe incorrect');

    req.session.user = { id: user._id, nom: user.nom, email: user.email, role: user.role };
    
    if(user.role === 'vendeur') return res.redirect('/vendeur/dashboard');
    else return res.redirect('/');
  } catch (error) {
    res.send('Erreur connexion : ' + error.message);


    req.session.user = { id: user._id, nom: user.nom, email: user.email, role: user.role };

      
    
    
  }
});








// Déconnexion
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
