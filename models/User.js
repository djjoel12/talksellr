const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  motDePasse: { type: String, required: true },
  telephone: { type: String, required: true },  // <-- Ajout ici
  role: { type: String, enum: ['client', 'vendeur', 'admin'], default: 'client' },
  dateInscription: { type: Date, default: Date.now }
});

// Avant d'enregistrer, hasher le mot de passe si modifié
userSchema.pre('save', async function(next) {
  if (!this.isModified('motDePasse')) return next();
  this.motDePasse = await bcrypt.hash(this.motDePasse, 12);
  next();
});

// Méthode pour comparer mot de passe
userSchema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.motDePasse);
}

module.exports = mongoose.model('User', userSchema);
