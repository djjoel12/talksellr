module.exports = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/connexion'); // ou afficher un message d'erreur
  }
  next();
};
