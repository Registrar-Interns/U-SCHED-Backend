const express = require('express');
const router = express.Router();
const sectionController = require('../controllers/sectionController'); // Adjust path as needed

// Programs routes
router.get('/programs', sectionController.getProgramsByCollege);

// Sections routes
router.get('/', sectionController.getSectionsByCollege);
router.post('/', sectionController.addSection);
router.put('/:id', sectionController.updateSection);




module.exports = router;