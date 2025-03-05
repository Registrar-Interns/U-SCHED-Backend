const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');

// GET /api/users
router.get('/', usersController.getAllUsers);

// POST /api/users
router.post('/', usersController.createAdminUser);

module.exports = router;