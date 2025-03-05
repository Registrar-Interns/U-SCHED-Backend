const pool = require('../db');
const bcrypt = require('bcrypt');

// GET /api/users
exports.getAllUsers = (req, res) => {
  const query = `
    SELECT 
      CONCAT(first_name, ' ', middle_name, ' ', last_name) AS full_name,
      email,
      department,
      faculty_type,
      position,
      role,
      status
    FROM users
    ORDER BY user_id ASC
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("Error retrieving users:", err);
      return res
        .status(500)
        .json({ message: 'Error retrieving users.', error: err.message });
    }

    res.json(results);
  });
};

// POST /api/users
// Creates a new Admin user in the database with a hashed password
exports.createAdminUser = async (req, res) => {
    try {
      const {
        first_name,
        middle_name,
        last_name,
        extended_name,
        email,
        password,
        status
      } = req.body;
  
      // Basic validation
      if (!first_name || !middle_name || !last_name || !email || !password || !status) {
        return res.status(400).json({ message: "Missing required fields" });
      }
  
      // Hash the password using bcrypt
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      const query = `
        INSERT INTO users (
          first_name,
          middle_name,
          last_name,
          extended_name,
          email,
          password,
          role,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'Admin', ?)
      `;
  
      // Insert the new admin user, storing the hashed password
      pool.query(
        query,
        [
          first_name,
          middle_name,
          last_name,
          extended_name || "",
          email,
          hashedPassword,
          status
        ],
        (err, result) => {
          if (err) {
            console.error("Error creating admin user:", err);
            return res.status(500).json({
              message: "Error creating admin user",
              error: err.message
            });
          }
          return res.status(201).json({ message: "Admin user created successfully" });
        }
      );
    } catch (err) {
      console.error("Error in createAdminUser:", err);
      return res.status(500).json({
        message: "Internal server error",
        error: err.message
      });
    }
};