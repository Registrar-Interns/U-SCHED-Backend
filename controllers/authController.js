const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Import the MySQL pool

// Pull the secret from environment variables
const SECRET = process.env.SECRET || 'default_secret_key';

/**
 * POST /api/login
 */
exports.login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: 'Username and password are required.' });
  }

  const selectQuery = 'SELECT * FROM users WHERE email = ?';
  pool.query(selectQuery, [username], (err, results) => {
    if (err) {
      return res
        .status(500)
        .json({ message: 'Error retrieving user.', error: err.message });
    }
    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = results[0];
    // Verify password
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Generate a JWT token (valid for 1 hour)
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, {
      expiresIn: '1h',
    });
    res.json({ message: 'Login successful.', token });
  });
};

/**
 * GET /api/dashboard
 * Protected endpoint (requires valid JWT in Authorization header)
 */
exports.dashboard = (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    res.json({ message: 'Welcome to the Dashboard!', user: decoded });
  });
};

/**
 * POST /api/logout
 * JWT is stateless, so we just instruct the client to remove the token.
 */
exports.logout = (req, res) => {
  res.json({ message: 'Sign out successful.' });
};
