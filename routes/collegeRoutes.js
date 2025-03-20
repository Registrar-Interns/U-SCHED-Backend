const express = require('express');
const router = express.Router();
const collegeController = require('../controllers/collegeController');

router.get('/', collegeController.getAllColleges);
router.get('/:college_id/programs', collegeController.getProgramsByCollege);
router.post('/', collegeController.addCollege);
router.put('/:id', collegeController.updateCollege); //  Update College & Programs
router.delete('/:id', collegeController.deleteCollege);
router.delete('/programs/:id', collegeController.deleteProgram); //  Delete a Single Programv


module.exports = router;