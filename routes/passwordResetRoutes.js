const express = require('express');
const router = express.Router();
const { requestPasswordReset, resetPassword } = require('../controllers/passwordResetController');

// Endpoint to request a password reset email
router.post('/password-reset/request', requestPasswordReset);

// Endpoint to reset the password using the token
router.post('/password-reset/reset', resetPassword);

module.exports = router;