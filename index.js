require('dotenv').config();
const express = require('express');
const path = require('path');
const Produit = require('./models/Product');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("MONGODB_URI:", process.env.MONGODB_URI);
console.log("SESSION_SECRET:", process.env.SESSION_SECRET ? "Défini" : "Non défini");

// ⚠️ CORRECTION 1: Configuration EJS DOIT être au début
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ⚠️ CORRECTION 2: Middlewares de parsing DOIVENT être avant les routes
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static('public'));

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connecté à MongoDB'))
  .catch(err => console.error('❌ Erreur MongoDB:', err));

// ⚠️ CORRECTION 3: Configuration session AMÉLIORÉE
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_par_defaut',
  resave: true, // Changé à true pour plus de fiabilité
  saveUninitialized: true, // Changé à true
  rolling: true, // Renouvelle la session à chaque requête
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // 24 heures en secondes
    autoRemove: 'native'
  }),
  cookie: {
    secure: false, // Mettez à true en production avec HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 jour
  }
}));

// ⚠️ CORRECTION 4: Middleware de debug des sessions
app.use((req, res, next) => {
  console.log('🔍 Session - ID:', req.sessionID?.substring(0, 10) + '...');
  console.log('🔍 Session - boutiqueActuelle:', req.session.boutiqueActuelle);
  console.log('🔍 Session - panier count:', req.session.panier ? req.session.panier.length : 0);
  next();
});

// ⚠️ CORRECTION 5: Middleware pour sauvegarder automatiquement la session
app.use((req, res, next) => {
  // Sauvegarder la session après chaque requête
  const originalSend = res.send;
  res.send = function(data) {
    if (req.session && !req.session.saving) {
      req.session.saving = true;
      req.session.save((err) => {
        if (err) {
          console.error('❌ Erreur sauvegarde session automatique:', err);
        } else {
          console.log('💾 Session sauvegardée automatiquement');
        }
        delete req.session.saving;
        originalSend.call(this, data);
      });
    } else {
      originalSend.call(this, data);
    }
  };
  next();
});

// Import des routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const boutiqueRoutes = require('./routes/boutique');
const vendeurRoutes = require('./routes/vendeur');
const produitRoutes = require('./routes/produit'); // ⚠️ CORRECTION: 'produit' -> 'produits'
const panierRouter = require('./routes/panier');
const commandesRoutes = require('./routes/commandes');
const templateRoutes = require('./routes/templates');

// ⚠️ CORRECTION 6: Ordre des routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/boutique', boutiqueRoutes);
app.use('/vendeur', vendeurRoutes);
app.use('/produits', produitRoutes);
app.use('/panier', panierRouter);
app.use('/commandes', commandesRoutes);
app.use('/templates', templateRoutes);

// ⚠️ CORRECTION 7: Route de test pour vérifier que tout fonctionne
app.get('/test-session', (req, res) => {
  req.session.testValue = 'Test réussi ' + Date.now();
  res.json({
    sessionID: req.sessionID,
    session: req.session,
    message: 'Test de session réussi'
  });
});

// Middleware global de gestion des erreurs (DOIT être en dernier)
app.use((err, req, res, next) => {
  console.error('❌ Erreur globale:', err);
  res.status(500).render('erreur', { 
    message: 'Erreur serveur',
    erreur: err.message 
  });
});

// Route 404 (DOIT être après toutes les routes)
app.use((req, res) => {
  res.status(404).render('404', { 
    message: 'Page non trouvée' 
  });
});

// ⚠️ CORRECTION 8: Un seul app.listen()
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
  console.log(`🔧 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Dossier views: ${path.join(__dirname, 'views')}`);
});