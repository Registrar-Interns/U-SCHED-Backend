const express = require('express');
const router = express.Router();

// Import the auth controller
const {
  login,
  dashboard,
  logout,
} = require('../controllers/authController');

// Define the routes
router.post('/login', login);
router.get('/dashboard', dashboard);
router.post('/logout', logout);

module.exports = router;