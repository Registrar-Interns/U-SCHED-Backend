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

  /**
   * We build a CASE expression to produce a 'fullName' by concatenating
   * first_name, middle_name, last_name, and extended_name. 
   * If the user is ADMIN, we pull from the admin table; if PROFESSOR, from the professor table.
   *
   * Also note:
   * - If user is ADMIN, department/position might be NULL. 
   * - If user is PROFESSOR, admin fields might be NULL.
   */
  const selectQuery = `
    SELECT
      u.user_id,
      u.user_type,
      u.ref_id,
      u.email,
      u.password,
      u.role,
      u.status,
      
      -- If user_type=ADMIN, get admin's name fields
      -- If user_type=PROFESSOR, get professor's name fields
      CASE
        WHEN u.user_type = 'ADMIN' THEN CONCAT(a.first_name, 
          CASE WHEN a.middle_name IS NOT NULL AND a.middle_name <> '' THEN CONCAT(' ', a.middle_name) ELSE '' END,
          ' ', a.last_name,
          CASE WHEN a.extended_name IS NOT NULL AND a.extended_name <> '' THEN CONCAT(' ', a.extended_name) ELSE '' END
        )
        WHEN u.user_type = 'PROFESSOR' THEN CONCAT(p.first_name,
          CASE WHEN p.middle_name IS NOT NULL AND p.middle_name <> '' THEN CONCAT(' ', p.middle_name) ELSE '' END,
          ' ', p.last_name,
          CASE WHEN p.extended_name IS NOT NULL AND p.extended_name <> '' THEN CONCAT(' ', p.extended_name) ELSE '' END
        )
        ELSE 'User'
      END AS fullName,
      
      -- If user_type=PROFESSOR, get position/department; if ADMIN, might be NULL
      p.position,
      p.department
      
    FROM users u
    LEFT JOIN professor p 
      ON (u.ref_id = p.professor_id AND u.user_type = 'PROFESSOR')
    LEFT JOIN admin a 
      ON (u.ref_id = a.admin_id AND u.user_type = 'ADMIN')
    WHERE u.email = ?
    LIMIT 1
  `;

  pool.query(selectQuery, [username], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: 'Error retrieving user.',
        error: err.message
      });
    }
    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = results[0];

    // Check password
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Build a JWT payload that includes user_type, position, etc.
    const payload = {
      user_id: user.user_id,
      email: user.email,
      user_type: user.user_type,
      position: user.position,    // might be null if user is ADMIN
      department: user.department // might be null if user is ADMIN
      // Add anything else you need in the front-end
    };

    // Generate a JWT token (valid for 1 hour)
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });

    // Return all fields needed by the frontend
    res.json({
      message: 'Login successful.',
      token,
      user: {
        user_id: user.user_id,
        user_type: user.user_type,
        position: user.position,
        department: user.department,
        role: user.role,
        fullName: user.fullName,    // The concatenated name
        email: user.email,          // So the dropdown can show the actual email
      }
    });
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