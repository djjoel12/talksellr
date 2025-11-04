// middlewares/estConnecte.js
module.exports = (req, res, next) => {
  if (!req.session.user) {
    console.log('🔐 Accès refusé - Utilisateur non connecté');
    console.log('🔗 URL demandée:', req.originalUrl);
    
    // ✅ CORRECTION : Rediriger vers la bonne route /auth/login
    return res.redirect('/auth/login');
  }
  next();
};