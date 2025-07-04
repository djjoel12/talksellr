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
console.log("SESSION_SECRET:", process.env.SESSION_SECRET);

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connecté à MongoDB'))
  .catch(err => console.error('❌ Erreur MongoDB:', err));

// Middleware pour parser les données POST (formulaires)
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // utile si tu envoies du JSON

// Middleware global de gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Middleware erreur:', err);
  res.status(500).send(`<pre>${err.stack}</pre>`);
});

// Configuration session avec stockage MongoDB
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_par_defaut',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 1 jour
  }
}));

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static('public'));

// Import des routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const boutiqueRoutes = require('./routes/boutique');
const vendeurRoutes = require('./routes/vendeur');
const produitRoutes = require('./routes/produit');
const panierRouter = require('./routes/panier');
const commandeRoutes = require('./routes/commandes');
const cloudinary = require('./config/cloudinary');


app.use('/produits', produitRoutes);
app.use('/vendeur', vendeurRoutes);
app.use('/boutique', boutiqueRoutes);
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/panier', panierRouter);
app.use('/commandes', commandeRoutes);

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});






app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
