const express = require('express');
const router = express.Router();
const Template = require('../models/Template');

// Liste de tous les templates
router.get('/', async (req, res) => {
  const templates = await Template.find();
  res.render('templates/index', { templates });
});

// Détail d’un template
router.get('/:id', async (req, res) => {
  const template = await Template.findById(req.params.id);
  if (!template) return res.status(404).send('Template introuvable');
  res.render('templates/detail', { template });
});

module.exports = router;
