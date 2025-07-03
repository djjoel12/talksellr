// middlewares/estVendeur.js

module.exports = function estVendeur(req, res, next) {
  if (req.session.user && req.session.user.role === 'vendeur') {
    return next();
  }
  res.redirect('/auth/login'); // Rediriger si non vendeur
};
