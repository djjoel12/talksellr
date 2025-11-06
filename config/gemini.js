// geminiAPI.js - VERSION AMÉLIORÉE AVEC CATÉGORIE BIJOUX
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class IntelligentGeminiQueue {
  constructor() {
    this.queue = [];
    this.processing = 0;
    this.maxConcurrent = 2;
    this.requestDelay = 1500;
    this.lastRequestTime = 0;
    
    this.stats = {
      successful: 0,
      failed: 0,
      retries: 0,
      queueLength: 0,
      processing: 0
    };

    // 🔥 CATÉGORIES PRÉDÉFINIES AMÉLIORÉES - AVEC CATÉGORIE BIJOUX
    this.categoriesPredefinies = {
      "Vêtements": ["Chemises", "Pantalons", "Robes", "Vestes", "Sous-vêtements", "Sport", "Maillots de bain"],
      "Chaussures": ["Baskets", "Sandales", "Bottes", "Talons", "Chaussures de sport", "Chaussures de ville"],
      "Bijoux": ["Colliers", "Bagues", "Bracelets", "Boucles d'oreilles", "Montres", "Chaînes", "Pendentifs"],
      "Électronique": ["Téléphones", "Ordinateurs", "Audio", "Gaming", "Accessoires", "Photo", "TV"],
      "Maison": ["Décoration", "Meubles", "Cuisine", "Jardin", "Électroménager", "Luminaire"],
      "Sport": ["Fitness", "Football", "Running", "Yoga", "Vélo", "Randonnée", "Natation"],
      "Beauté": ["Cosmétiques", "Soins", "Parfums", "Maquillage", "Cheveux", "Hygiène"],
      "Automobile": ["Pièces", "Accessoires", "Entretien", "Équipement"],
      "Livres": ["Roman", "Éducation", "BD", "Professionnel", "Enfant"],
      "Jouets": ["Éducatif", "Jeux société", "Poupées", "Véhicules", "Construction"],
      "Animaux": ["Chiens", "Chats", "Oiseaux", "Aquariophilie", "Équitation"],
     "Art": ["Tableaux", "Sculptures", "Artisanat", "Collections"], // ← VIRGULE AJOUTÉE ICI
  "Sacs": ["Sacs a dos", "Sacs pour femmes", "Sacs à main", "Sacs de voyage"]
      

    };
  }

  async addToQueue(imageBuffer, metadata = {}) {
    return new Promise((resolve) => {
      const queueItem = {
        imageBuffer,
        metadata,
        resolve,
        retryCount: 0,
        maxRetries: 3,
        status: 'pending'
      };
      
      this.queue.push(queueItem);
      this.stats.queueLength = this.queue.length;
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) return;
    
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.requestDelay) {
      setTimeout(() => this.processQueue(), this.requestDelay - timeSinceLast);
      return;
    }

    this.processing++;
    this.stats.processing = this.processing;
    const item = this.queue.shift();
    this.stats.queueLength = this.queue.length;
    item.status = 'processing';

    try {
      this.lastRequestTime = Date.now();
      const result = await this.processWithRetry(item);
      this.stats.successful++;
      item.resolve(result);
    } catch (error) {
      console.error(`❌ Échec après ${item.retryCount} retrys:`, error.message);
      this.stats.failed++;
      item.resolve(this.getFallbackData(item.metadata));
    } finally {
      this.processing--;
      this.stats.processing = this.processing;
      this.processQueue();
    }
  }

  async downloadImageFromCloudinary(imageUrl) {
    try {
      console.log(`📥 Téléchargement depuis Cloudinary: ${imageUrl}`);
      
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      console.log(`✅ Image téléchargée: ${response.data.length} bytes`);
      return Buffer.from(response.data);
      
    } catch (error) {
      console.error(`❌ Erreur téléchargement Cloudinary:`, error.message);
      throw new Error(`Impossible de télécharger l'image: ${error.message}`);
    }
  }

  async processWithRetry(item, modelType = 'primary') {
    try {
      const modelName = "gemini-2.5-flash";
      console.log(`🔄 Analyse IA avec ${modelName} (retry ${item.retryCount})`);
      
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const prompt = `ANALYSE D'IMAGE POUR E-COMMERCE

Tu es un expert en analyse d'images pour site e-commerce. Analyse cette image et retourne UNIQUEMENT un JSON valide.

🔥 CATÉGORIES AUTORISÉES (choisir la plus pertinente):
- "Vêtements" (vêtements, accessoires mode - SANS CHAUSSURES, SANS BIJOUX, SANS SACS)
- "Chaussures" (tous types de chaussures, baskets, sandales, bottes)
- "Bijoux" (colliers, bagues, bracelets, boucles d'oreilles, ceintures, montres, chaînes, pendentifs)
- "Électronique" (appareils électroniques, tech)
- "Maison" (décoration, meubles, cuisine)
- "Sport" (équipement sportif, fitness)
- "Beauté" (cosmétiques, soins, parfums)
- "Automobile" (pièces auto, accessoires voiture)
- "Livres" (livres, magazines)
- "Jouets" (jeux, jouets)
- "Animaux" (produits pour animaux, équitation)
- "Art" (œuvres d'art, artisanat)
- "Sacs" (Sacs, tout types de sacs je siq tout types de sacs )

🚨 RÈGLES IMPORTANTES:
- Les BIJOUX (colliers, bagues, bracelets) vont dans la catégorie "Bijoux" et pas dans "Vêtements"
- Les CHAUSSURES vont dans "Chaussures", PAS dans "Vêtements"
- Les Sacs (sacs, ) vont dans "Sacs"
- Les MONTRES vont dans "Bijoux"

INSTRUCTIONS:
- Sois PRÉCIS dans la catégorie et sous-catégorie
- Le NOM doit être court et vendeur (max 4-5 mots)
- La DESCRIPTION doit être commerciale (3 phrases séduisantes pour pousser à acheter)
- Les COULEURS doivent être les couleurs dominantes
- Utilise "Générique" si la marque n'est pas visible

FORMAT JSON STRICT:
{
  "nom": "string",
  "description": "string", 
  "categorie": "string",
  "sous_categorie": "string",
  "marque": "string",
  "couleurs": ["string"],
  "style": "string",
  "materiau": "string",
  "etat": "string",
  "tags": ["string"]
}

IMPORTANT: Réponds UNIQUEMENT avec le JSON, sans \`\`\`json ni commentaires.`;

      let imageBuffer = item.imageBuffer;

      if (item.metadata && item.metadata.imageUrl) {
        console.log(`🌐 Téléchargement depuis Cloudinary: ${item.metadata.imageUrl}`);
        imageBuffer = await this.downloadImageFromCloudinary(item.metadata.imageUrl);
      }

      if (!imageBuffer) {
        console.log(`⚠️ Aucune image disponible, utilisation du fallback`);
        return this.getFallbackData(item.metadata);
      }

      console.log(`📸 Analyse de l'image (${imageBuffer.length} bytes)`);

      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: "image/jpeg"
              }
            },
            { text: prompt }
          ]
        }]
      });

      const text = result.response.text();
      console.log(`📝 Réponse brute IA:`, text);
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('JSON non trouvé dans la réponse');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // VALIDATION RENFORCÉE DES CATÉGORIES
      const donneesValidees = this.validerEtCorrigerCategories(parsed, item.metadata);
      
      console.log(`✅ IA réussie:`, {
        nom: donneesValidees.nom,
        categorie: donneesValidees.categorie,
        sous_categorie: donneesValidees.sous_categorie
      });
      
      return donneesValidees;

    } catch (error) {
      console.log(`❌ Erreur ${modelType}:`, error.message);
      
      if (item.retryCount < item.maxRetries) {
        item.retryCount++;
        this.stats.retries++;
        const delay = Math.min(1000 * Math.pow(2, item.retryCount), 10000);
        console.log(`⏳ Retry dans ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.processWithRetry(item, 'primary');
      }
      
      throw error;
    }
  }

  validerEtCorrigerCategories(donnees, metadata) {
    let categorie = (donnees.categorie || 'Autre').trim().replace(/"/g, '');
    let sousCategorie = (donnees.sous_categorie || '').trim().replace(/"/g, '');
    
    console.log(`🔍 Validation catégorie: "${categorie}" -> "${sousCategorie}"`);

    // CORRECTION INTELLIGENTE DES CATÉGORIES
    if (categorie === 'Autre' || !this.categoriesPredefinies[categorie]) {
      const texteAnalyse = (donnees.nom + ' ' + donnees.description).toLowerCase();
      categorie = this.devinerCategorie(texteAnalyse, metadata);
      console.log(`🔧 Catégorie corrigée: "${categorie}"`);
    }
    
    // Valider la sous-catégorie
    if (!sousCategorie || sousCategorie === 'null' || sousCategorie === 'undefined') {
      sousCategorie = this.genererSousCategorie(categorie, donnees.nom);
    }

    // S'assurer que la sous-catégorie est valide
    const sousCategoriesValides = this.categoriesPredefinies[categorie];
    if (sousCategoriesValides && !sousCategoriesValides.includes(sousCategorie)) {
      sousCategorie = sousCategoriesValides[0] || 'Divers';
    }
    
    return {
      ...donnees,
      nom: donnees.nom || 'Produit sans nom',
      description: donnees.description || 'Description à compléter',
      categorie: categorie,
      sous_categorie: sousCategorie,
      marque: donnees.marque || 'Générique',
      couleurs: Array.isArray(donnees.couleurs) ? donnees.couleurs.slice(0, 3) : [donnees.couleurs || 'Multicolor'],
      style: donnees.style || 'Standard',
      materiau: donnees.materiau || 'Non spécifié',
      etat: donnees.etat || 'Neuf',
      tags: Array.isArray(donnees.tags) ? donnees.tags.slice(0, 5) : [donnees.tags || 'produit']
    };
  }

  devinerCategorie(texte, metadata) {
    const texteLower = texte.toLowerCase();
    const fileName = (metadata.fileName || '').toLowerCase();
    
    const correspondances = {
      'Vêtements': ['chemise', 'pantalon', 'robe', 'veste', 't-shirt', 'vêtement', 'habillement', 'mode', 'fashion', 'vetement', 'tenue', 'habit', 'costume', 'uniforme', 'sweat', 'pull', 'hoodie'],
      'Chaussures': ['chaussure', 'basket', 'sneaker', 'sandale', 'botte', 'talon', 'escarpin', 'soulier', 'running', 'football', 'sport', 'ville', 'cuir'],
      'Bijoux': ['collier', 'bague', 'bracelet', 'boucle', 'oreille', 'bijou', 'bijoux', 'montre', 'chaîne', 'chaîne', 'pendentif', 'or', 'argent', 'pierre précieuse', 'diamant'],
      'Électronique': ['phone', 'téléphone', 'smartphone', 'ordinateur', 'laptop', 'tablette', 'écran', 'audio', 'casque', 'tech', 'électronique', 'electronique', 'camera'],
      'Maison': ['maison', 'décoration', 'meuble', 'table', 'chaise', 'canapé', 'lit', 'cuisine', 'ustensile', 'déco', 'luminaire', 'rideau'],
      'Sport': ['sport', 'fitness', 'football', 'basket', 'tennis', 'running', 'course', 'yoga', 'vélo', 'cyclisme', 'équitation', 'cheval', 'cavalier'],
      'Beauté': ['beauté', 'cosmétique', 'maquillage', 'parfum', 'soin', 'crème', 'shampoing', 'beaute', 'cosmetique'],
      'Animaux': ['animal', 'chien', 'chat', 'oiseau', 'aquarium', 'nourriture', 'jouet', 'équitation', 'cheval', 'cavalier', 'équestre'],
      
// APRÈS :
'Art': ['art', 'tableau', 'peinture', 'sculpture', 'photo', 'tableau', 'affiche', 'poster'],
'Sac': ['sac', 'sacs', 'sac à dos', 'sac pour femmes', 'sac à main']
    };

    for (const [categorie, mots] of Object.entries(correspondances)) {
      for (const mot of mots) {
        if (texteLower.includes(mot) || fileName.includes(mot)) {
          console.log(`🎯 Catégorie devinée: ${categorie} (mot-clé: ${mot})`);
          return categorie;
        }
      }
    }

    return 'Autre';
  }

  genererSousCategorie(categorie, nomProduit) {
    const sousCategoriesParDefaut = {
      'Vêtements': 'Vêtements divers',
      'Chaussures': 'Chaussures de ville',
      'Bijoux': 'Bijoux divers',
      'Électronique': 'Électronique générale', 
      'Maison': 'Décoration',
      'Sport': 'Équipement sportif',
      'Beauté': 'Soins',
      'Automobile': 'Accessoires',
      'Livres': 'Général',
      'Jouets': 'Jeux',
      'Animaux': 'Accessoires',
      'Art': 'Œuvres',
      // APRÈS :
'Autre': 'Divers',
'Sacs': 'Sacs'
    };
    
    return sousCategoriesParDefaut[categorie] || 'Divers';
  }

  getFallbackData(metadata) {
    const fileName = metadata.fileName || '';
    const imageUrl = metadata.imageUrl || '';
    
    console.log(`🔄 Utilisation fallback pour: ${fileName || imageUrl}`);
    
    // 🔥 DÉTECTION AMÉLIORÉE POUR LES BIJOUX
    if (fileName.includes('collier') || fileName.includes('bague') || fileName.includes('bracelet') || 
        fileName.includes('bijou') || fileName.includes('montre') || fileName.includes('chaîne') ||
        imageUrl.includes('collier') || imageUrl.includes('bague') || imageUrl.includes('bracelet') ||
        imageUrl.includes('bijou') || imageUrl.includes('montre')) {
      return {
        nom: "Bijou élégant et raffiné",
        description: "Bijou de qualité supérieure, parfait pour toutes les occasions",
        categorie: "Bijoux",
        sous_categorie: "Bijoux divers",
        marque: "Générique",
        couleurs: ["Or", "Argent", "Doré"],
        style: "Élégant",
        materiau: "Métal précieux",
        etat: "Neuf",
        tags: ["bijou", "élégant", "raffiné", "accessoire"]
      };
    }
    
    // Détection pour les chaussures
    if (fileName.includes('chaussure') || fileName.includes('basket') || fileName.includes('sneaker') || 
        fileName.includes('sandale') || fileName.includes('botte') || fileName.includes('talon') ||
        imageUrl.includes('chaussure') || imageUrl.includes('basket') || imageUrl.includes('sneaker')) {
      return {
        nom: "Chaussures de qualité supérieure",
        description: "Chaussures confortables et stylées pour un usage quotidien",
        categorie: "Chaussures",
        sous_categorie: "Chaussures de ville",
        marque: "Générique",
        couleurs: ["Noir", "Blanc", "Marron"],
        style: "Moderne",
        materiau: "Cuir et textile",
        etat: "Neuf",
        tags: ["chaussures", "confort", "style", "qualité"]
      };
    }
    
    if (fileName.includes('cheval') || fileName.includes('cavalier') || fileName.includes('equestre') ||
        imageUrl.includes('cheval') || imageUrl.includes('cavalier')) {
      return {
        nom: "Tenue équestre traditionnelle",
        description: "Tenue complète pour cavalier, style traditionnel et élégant",
        categorie: "Animaux",
        sous_categorie: "Équitation",
        marque: "Générique",
        couleurs: ["Noir", "Blanc", "Marron"],
        style: "Traditionnel",
        materiau: "Tissu et cuir",
        etat: "Neuf",
        tags: ["équitation", "cheval", "cavalier", "traditionnel"]
      };
    }
    
    // Détection par URL Cloudinary
    if (imageUrl.includes('zara') || fileName.includes('zara')) {
      return {
        nom: "Vêtement ZARA collection premium",
        description: "Vêtement ZARA de la dernière collection, style moderne et tendance",
        categorie: "Vêtements",
        sous_categorie: "Prêt-à-porter",
        marque: "ZARA",
        couleurs: ["Noir", "Blanc", "Bleu"],
        style: "Moderne",
        materiau: "Coton et élasthanne",
        etat: "Neuf",
        tags: ["zara", "mode", "fashion", "tendance"]
      };
    }
    
    return {
      nom: "Produit de qualité professionnelle",
      description: "Produit fiable et robuste pour un usage professionnel",
      categorie: "Équipement professionnel",
      sous_categorie: "Outillage",
      marque: "Générique",
      couleurs: ["Noir", "Gris métallisé"],
      style: "Professionnel",
      materiau: "Métal haute résistance",
      etat: "Neuf",
      tags: ["professionnel", "qualité", "robuste", "fiable"]
    };
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing: this.processing
    };
  }
}

const geminiQueue = new IntelligentGeminiQueue();

const analyzeImageComplet = async (imageBuffer, metadata = {}) => {
  return geminiQueue.addToQueue(imageBuffer, metadata);
};

module.exports = { 
  analyzeImageComplet,
  geminiQueue
};