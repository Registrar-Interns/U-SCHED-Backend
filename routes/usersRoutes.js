const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');

// GET all users
router.get('/', usersController.getAllUsers);

// POST create admin
router.post('/', usersController.createAdminUser);

// POST create dean/chair
router.post('/deanchair', usersController.createDeanChairUser);

// PUT update admin (edit admin fields)
router.put('/admin/:userId', usersController.updateAdminUser);

// PUT update dean/chair (edit dean/chair fields)
router.put('/deanchair/:userId', usersController.updateDeanChairUser);

// PUT update professor (edit professor fields)
router.put('/professor/:userId', usersController.updateProfessorUser);

// PUT send professor password (for create professor account modal)
router.put('/professor/:userId/send-password', usersController.sendProfessorPassword);

module.exports = router;