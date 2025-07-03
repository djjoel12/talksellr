const mongoose = require('mongoose');

const adresseSchema = new mongoose.Schema({
  rue: { type: String, trim: true },
  ville: { type: String, trim: true },
  codePostal: { type: String, trim: true },
  pays: { type: String, trim: true }
}, { _id: false }); // Pas d’_id pour sous-doc

const boutiqueSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, "Le nom de la boutique est obligatoire"],
    trim: true,
    minlength: [3, "Le nom doit faire au moins 3 caractères"],
    maxlength: [100, "Le nom ne peut dépasser 100 caractères"],
  },
  slug: { type: String, required: true, unique: true }, // le slug unique
  description: {
    type: String,
    trim: true,
    maxlength: [1000, "La description ne peut dépasser 1000 caractères"],
  },
  logoUrl: {
    type: String,
    trim: true,
    validate: {
      validator: v => !v || /^https?:\/\/.+\.(png|jpg|jpeg|gif|svg)$/i.test(v),
      message: props => `${props.value} n'est pas une URL valide pour une image`
    }
  },
  proprietaire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true, // Un vendeur a une seule boutique
  },
  adresse: adresseSchema,
  telephone: {
    type: String,
    trim: true,
    validate: {
      validator: v => !v || /^\+?[0-9\s\-]{7,15}$/.test(v),
      message: props => `${props.value} n'est pas un numéro de téléphone valide`
    }
  },
  statut: {
    type: String,
    enum: ["actif", "suspendu", "fermé"],
    default: "actif"
  },
  dateCreation: {
    type: Date,
    default: Date.now,
    immutable: true,
  }
}, { timestamps: true }); // ajoute createdAt & updatedAt

module.exports = mongoose.model("Boutique", boutiqueSchema);
