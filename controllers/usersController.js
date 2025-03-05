const pool = require('../db');
const bcrypt = require('bcrypt');

// GET /api/users
// Retrieves both Admin and Professor users in one UNION query
exports.getAllUsers = (req, res) => {
  const query = `
    SELECT
      u.user_id,
      CONCAT(a.first_name, ' ', COALESCE(a.middle_name, ''), ' ', a.last_name) AS full_name,
      u.email,
      NULL AS department,
      NULL AS faculty_type,
      NULL AS position,
      u.role,
      u.status
    FROM users u
    JOIN admin a ON u.ref_id = a.admin_id
    WHERE u.user_type = 'ADMIN'

    UNION

    SELECT
      u.user_id,
      CONCAT(p.first_name, ' ', COALESCE(p.middle_name, ''), ' ', p.last_name) AS full_name,
      u.email,
      p.department,
      p.faculty_type,
      p.position,
      u.role,
      u.status
    FROM users u
    JOIN professor p ON u.ref_id = p.professor_id
    WHERE u.user_type = 'PROFESSOR'
    ORDER BY user_id ASC
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("Error retrieving users:", err);
      return res.status(500).json({
        message: 'Error retrieving users.',
        error: err.message
      });
    }
    res.json(results);
  });
};

// POST /api/users
// Creates a new Admin by inserting into the admin table, then users table
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
    if (
      !first_name ||
      !middle_name ||
      !last_name ||
      !email ||
      !password ||
      !status
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Hash the password using bcrypt (or use your own saltRounds)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 1) Insert into admin table
    const insertAdminQuery = `
      INSERT INTO admin (
        first_name,
        middle_name,
        last_name,
        extended_name,
        email,
        password,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    pool.query(
      insertAdminQuery,
      [
        first_name,
        middle_name,
        last_name,
        extended_name || "",
        email,
        hashedPassword,
        status
      ],
      (adminErr, adminResult) => {
        if (adminErr) {
          console.error("Error inserting admin:", adminErr);
          return res.status(500).json({
            message: "Error inserting admin",
            error: adminErr.message
          });
        }

        // 2) Now insert into users table, linking via ref_id = admin_id
        const newAdminId = adminResult.insertId; // newly inserted admin_id

        const insertUsersQuery = `
          INSERT INTO users (
            ref_id,
            user_type,
            email,
            password,
            role,
            status
          )
          VALUES (?, 'ADMIN', ?, ?, 'ADMIN', ?)
        `;

        pool.query(
          insertUsersQuery,
          [newAdminId, email, hashedPassword, status],
          (userErr, userResult) => {
            if (userErr) {
              console.error("Error inserting user:", userErr);
              return res.status(500).json({
                message: "Error inserting user",
                error: userErr.message
              });
            }

            return res
              .status(201)
              .json({ message: "Admin user created successfully" });
          }
        );
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