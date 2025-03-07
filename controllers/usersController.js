const pool = require('../db');
const bcrypt = require('bcrypt');
const nodemailer = require("nodemailer");

// Helper: send an email with the new plain password
const sendNewPasswordEmail = async (email, firstName, lastName, plainPassword) => {
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: "U-SCHED <carlaarongalang@gmail.com>",
    to: email,
    subject: "Your New U-SCHED Account Password",
    html: `
      <p>Hello ${firstName} ${lastName},</p>
      <p>Your new password is: <b>${plainPassword}</b></p>
      <p>Please keep it safe and secure.</p>
      <p>Regards,<br/>U-SCHED Team</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};

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
    u.status,
    u.password  -- <-- Add password so the frontend can check if empty
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
    u.status,
    u.password  -- <-- Also add password
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

// PUT /api/users/admin/:userId
// Updates an admin user. If a new password is provided, it is hashed, saved, and then the plain password is emailed.
exports.updateAdminUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { first_name, middle_name, last_name, extended_name, email, password, status } = req.body;
    if (!first_name || !middle_name || !last_name || !email || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const findUserQuery = `SELECT ref_id, user_type FROM users WHERE user_id = ?`;
    pool.query(findUserQuery, [userId], async (findErr, findResults) => {
      if (findErr) {
        console.error("Error finding user:", findErr);
        return res.status(500).json({ message: "Error finding user", error: findErr.message });
      }
      if (!findResults.length) {
        return res.status(404).json({ message: "User not found." });
      }
      const { ref_id, user_type } = findResults[0];
      if (user_type !== "ADMIN") {
        return res.status(400).json({ message: "Not an admin user." });
      }

      let hashedPassword = "";
      const plainPassword = password && password.trim() ? password.trim() : "";
      if (plainPassword) {
        const saltRounds = 10;
        hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
      }

      const updateAdminQuery = `
        UPDATE admin
        SET 
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          extended_name = ?,
          email = ?,
          ${hashedPassword ? "password = ?," : ""}
          status = ?
        WHERE admin_id = ?
      `;
      const adminValues = [first_name, middle_name, last_name, extended_name || "", email];
      if (hashedPassword) {
        adminValues.push(hashedPassword);
      }
      adminValues.push(status, ref_id);

      pool.query(updateAdminQuery, adminValues, (adminErr) => {
        if (adminErr) {
          console.error("Error updating admin:", adminErr);
          return res.status(500).json({ message: "Error updating admin", error: adminErr.message });
        }
        const updateUsersQuery = `
          UPDATE users
          SET 
            email = ?,
            ${hashedPassword ? "password = ?," : ""}
            status = ?
          WHERE user_id = ?
        `;
        const usersValues = [email];
        if (hashedPassword) {
          usersValues.push(hashedPassword);
        }
        usersValues.push(status, userId);

        pool.query(updateUsersQuery, usersValues, async (userErr) => {
          if (userErr) {
            console.error("Error updating user record:", userErr);
            return res.status(500).json({ message: "Error updating user record", error: userErr.message });
          }
          // If a new password was provided, send the plain password via email
          if (plainPassword) {
            try {
              await sendNewPasswordEmail(email, first_name, last_name, plainPassword);
            } catch (mailErr) {
              console.error("Error sending admin password email:", mailErr);
              return res.status(500).json({ message: "Error sending password email", error: mailErr.message });
            }
          }
          return res.json({ message: "Admin user updated successfully." });
        });
      });
    });
  } catch (err) {
    console.error("Error in updateAdminUser:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// NEW: PUT /api/users/professor/:userId
// Updates professor details (in professor and users tables).
// If a new password is provided, update it and send the plain password via email.
exports.updateProfessorUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    // Expected fields: department, faculty_type, position, degrees, specialization, status, newPassword
    const { department, faculty_type, position, degrees, specialization, status, newPassword } = req.body;
    if (!department || !faculty_type || !position || !degrees || !specialization || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 1) Find the professor record (ref_id) linked to this user
    const findQuery = `SELECT ref_id, user_type, email FROM users WHERE user_id = ?`;
    pool.query(findQuery, [userId], async (findErr, findResults) => {
      if (findErr) {
        console.error("Error finding professor user:", findErr);
        return res.status(500).json({ message: "Error finding user", error: findErr.message });
      }
      if (!findResults.length) {
        return res.status(404).json({ message: "User not found." });
      }
      const { ref_id, user_type, email } = findResults[0];
      if (user_type !== "PROFESSOR") {
        return res.status(400).json({ message: "Not a professor user." });
      }

      // 2) If a new password is provided, hash it
      let hashedPassword = "";
      const plainPassword = newPassword && newPassword.trim() ? newPassword.trim() : "";
      if (plainPassword) {
        const saltRounds = 10;
        hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
      }

      // 3) Update the professor table
      const updateProfessorQuery = `
        UPDATE professor
        SET 
          department = ?,
          faculty_type = ?,
          position = ?,
          bachelorsDegree = ?,  -- Assuming degrees are stored as a concatenated string or update as needed
          specialization = ?,
          status = ?
        WHERE professor_id = ?
      `;
      // Here, we assume 'degrees' holds the combined degrees. Adjust as needed.
      const professorValues = [department, faculty_type, position, degrees, specialization, status, ref_id];

      pool.query(updateProfessorQuery, professorValues, (profErr) => {
        if (profErr) {
          console.error("Error updating professor:", profErr);
          return res.status(500).json({ message: "Error updating professor", error: profErr.message });
        }
        // 4) Update the users table (for email, status, and optionally password)
        const updateUsersQuery = `
          UPDATE users
          SET 
            email = ?,
            ${hashedPassword ? "password = ?," : ""}
            status = ?
          WHERE user_id = ?
        `;
        const usersValues = [email];
        if (hashedPassword) {
          usersValues.push(hashedPassword);
        }
        usersValues.push(status, userId);

        pool.query(updateUsersQuery, usersValues, async (userErr) => {
          if (userErr) {
            console.error("Error updating professor user record:", userErr);
            return res.status(500).json({ message: "Error updating user record", error: userErr.message });
          }
          // 5) If a new password was provided, send it via email
          if (plainPassword) {
            try {
              // For professor, we assume first and last names can be derived from the professor table.
              // For simplicity, we use the email as the recipient.
              await sendNewPasswordEmail(email, "", "Professor", plainPassword);
            } catch (mailErr) {
              console.error("Error sending professor password email:", mailErr);
              return res.status(500).json({ message: "Error sending password email", error: mailErr.message });
            }
          }
          return res.json({ message: "Professor updated successfully." });
        });
      });
    });
  } catch (err) {
    console.error("Error in updateProfessorUser:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

exports.sendProfessorPassword = async (req, res) => {
  try {
    const userId = req.params.userId; // /api/users/professor/:userId/send-password
    const { plainPassword } = req.body; // plaintext password from the frontend

    if (!plainPassword) {
      return res.status(400).json({ message: "Password is required." });
    }

    // 1) Find the user
    const findQuery = `
      SELECT u.*, p.first_name, p.middle_name, p.last_name
      FROM users u
      JOIN professor p ON u.ref_id = p.professor_id
      WHERE u.user_id = ? AND u.user_type = 'PROFESSOR'
    `;
    pool.query(findQuery, [userId], async (err, results) => {
      if (err) {
        console.error("Error finding professor user:", err);
        return res
          .status(500)
          .json({ message: "DB error", error: err.message });
      }
      if (!results.length) {
        return res.status(404).json({ message: "Professor user not found." });
      }

      const user = results[0];
      const { email, user_id } = user;

      // 2) Hash the password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(plainPassword.trim(), saltRounds);

      // 3) Update the user's password
      const updateUserQuery = `
        UPDATE users
        SET password = ?
        WHERE user_id = ?
      `;
      pool.query(updateUserQuery, [hashedPassword, user_id], async (updateErr) => {
        if (updateErr) {
          console.error("Error updating user password:", updateErr);
          return res.status(500).json({
            message: "Error updating user password",
            error: updateErr.message,
          });
        }

        // 4) Send the plain password via email
        try {
          const transporter = nodemailer.createTransport({
            host: "smtp-relay.brevo.com",
            port: 587,
            secure: false,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          const mailOptions = {
            from: "U-SCHED <carlaarongalang@gmail.com>",
            to: email,
            subject: "Your New U-SCHED Account Password",
            html: `
              <p>Hello ${user.first_name} ${user.last_name},</p>
              <p>Your new password is: <b>${plainPassword}</b></p>
              <p>Please keep it safe and secure.</p>
              <p>Regards,<br/>U-SCHED Team</p>
            `,
          };

          await transporter.sendMail(mailOptions);

          return res.json({
            message: `Plaintext password sent to ${email}`,
          });
        } catch (mailErr) {
          console.error("Error sending email:", mailErr);
          return res
            .status(500)
            .json({ message: "Error sending email", error: mailErr.message });
        }
      });
    });
  } catch (err) {
    console.error("Error in sendProfessorPassword:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};