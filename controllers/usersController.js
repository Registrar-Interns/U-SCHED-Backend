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
    c.college_code AS department,
    p.faculty_type,
    p.position,
    u.role,
    u.status,
    u.password  -- <-- Also add password
  FROM users u
  JOIN professor p ON u.ref_id = p.professor_id
  LEFT JOIN college c ON p.college_id = c.college_id
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

// POST /api/users/deanchair
// Creates a new Dean/Chair by inserting into the professor table, then users table
exports.createDeanChairUser = async (req, res) => {
  try {
    const {
      first_name,
      middle_name,
      last_name,
      extended_name,
      email,
      password,
      college_id,
      faculty_type,
      position,
      bachelorsDegree,
      mastersDegree,
      doctorateDegree,
      specialization,
      status,
      time_availability
    } = req.body;

    // Basic validation
    if (
      !first_name ||
      !middle_name ||
      !last_name ||
      !email ||
      !password ||
      !college_id ||
      !faculty_type ||
      !position ||
      !bachelorsDegree ||
      !mastersDegree ||
      !doctorateDegree ||
      !specialization ||
      !status
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 1) Insert into professor table
    const insertProfessorQuery = `
      INSERT INTO professor (
        first_name,
        middle_name,
        last_name,
        extended_name,
        college_id,
        faculty_type,
        position,
        bachelorsDegree,
        mastersDegree,
        doctorateDegree,
        specialization,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    pool.query(
      insertProfessorQuery,
      [
        first_name,
        middle_name,
        last_name,
        extended_name || "",
        college_id,
        faculty_type,
        position,
        bachelorsDegree,
        mastersDegree,
        doctorateDegree,
        specialization,
        status
      ],
      (profErr, profResult) => {
        if (profErr) {
          console.error("Error inserting dean/chair:", profErr);
          return res.status(500).json({
            message: "Error inserting dean/chair",
            error: profErr.message
          });
        }

        // Get the newly inserted professor_id
        const newProfessorId = profResult.insertId;

        // 2) Insert time availability if provided
        if (time_availability) {
          const insertTimeAvailabilityQuery = `
            INSERT INTO time_availability (
              professor_id,
              monday,
              tuesday,
              wednesday,
              thursday,
              friday,
              saturday,
              sunday
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;

          pool.query(
            insertTimeAvailabilityQuery,
            [
              newProfessorId,
              time_availability.monday || null,
              time_availability.tuesday || null,
              time_availability.wednesday || null,
              time_availability.thursday || null,
              time_availability.friday || null,
              time_availability.saturday || null,
              time_availability.sunday || null
            ],
            (timeErr) => {
              if (timeErr) {
                console.error("Error inserting time availability:", timeErr);
                // Continue even if time availability insertion fails
              }
            }
          );
        }

        // 3) Now insert into users table, linking via ref_id = professor_id
        const insertUsersQuery = `
          INSERT INTO users (
            ref_id,
            user_type,
            email,
            password,
            role,
            status
          )
          VALUES (?, 'PROFESSOR', ?, ?, 'USER', ?)
        `;

        pool.query(
          insertUsersQuery,
          [newProfessorId, email, hashedPassword, status],
          (userErr, userResult) => {
            if (userErr) {
              console.error("Error inserting user:", userErr);
              return res.status(500).json({
                message: "Error inserting user",
                error: userErr.message
              });
            }

            // Optionally send password email
            try {
              sendNewPasswordEmail(email, first_name, last_name, password);
            } catch (emailErr) {
              console.error("Error sending email:", emailErr);
              // Continue even if email fails
            }

            return res
              .status(201)
              .json({ message: "Dean/Chair user created successfully" });
          }
        );
      }
    );
  } catch (err) {
    console.error("Error in createDeanChairUser:", err);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message
    });
  }
};

// PUT /api/users/deanchair/:userId
// Updates a Dean/Chair user in both professor and users tables
exports.updateDeanChairUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const {
      first_name,
      middle_name,
      last_name,
      extended_name,
      email,
      newPassword,
      college_id,
      faculty_type,
      position,
      bachelorsDegree,
      mastersDegree,
      doctorateDegree,
      specialization,
      status,
      time_availability
    } = req.body;

    // Basic validation
    if (
      !first_name ||
      !middle_name ||
      !last_name ||
      !email ||
      !college_id ||
      !faculty_type ||
      !position ||
      !bachelorsDegree ||
      !mastersDegree ||
      !doctorateDegree ||
      !specialization ||
      !status
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 1) Find the professor record (ref_id) linked to this user
    const findQuery = `SELECT ref_id, user_type, email FROM users WHERE user_id = ?`;
    pool.query(findQuery, [userId], async (findErr, findResults) => {
      if (findErr) {
        console.error("Error finding dean/chair user:", findErr);
        return res.status(500).json({ message: "Error finding user", error: findErr.message });
      }
      
      if (!findResults.length) {
        return res.status(404).json({ message: "User not found." });
      }
      
      const { ref_id, user_type } = findResults[0];
      
      if (user_type !== "PROFESSOR") {
        return res.status(400).json({ message: "Not a professor/dean/chair user." });
      }

      // 2) If a new password is provided, hash it
      let hashedPassword = "";
      let plainPassword = "";
      
      if (newPassword && newPassword.trim()) {
        plainPassword = newPassword.trim();
        const saltRounds = 10;
        hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
      }

      // 3) Update the professor table
      const updateProfessorQuery = `
        UPDATE professor
        SET 
          first_name = ?,
          middle_name = ?,
          last_name = ?,
          extended_name = ?,
          college_id = ?,
          faculty_type = ?,
          position = ?,
          bachelorsDegree = ?,
          mastersDegree = ?,
          doctorateDegree = ?,
          specialization = ?,
          status = ?
        WHERE professor_id = ?
      `;
      
      const professorValues = [
        first_name,
        middle_name,
        last_name,
        extended_name || "",
        college_id,
        faculty_type,
        position,
        bachelorsDegree,
        mastersDegree,
        doctorateDegree,
        specialization,
        status,
        ref_id
      ];

      pool.query(updateProfessorQuery, professorValues, (profErr) => {
        if (profErr) {
          console.error("Error updating dean/chair:", profErr);
          return res.status(500).json({ 
            message: "Error updating dean/chair", 
            error: profErr.message 
          });
        }

        // 4) Update time availability if provided
        if (time_availability) {
          // First check if time availability record exists
          const checkTimeAvailabilityQuery = `
            SELECT availability_id FROM time_availability WHERE professor_id = ?
          `;
          
          pool.query(checkTimeAvailabilityQuery, [ref_id], (checkErr, checkResults) => {
            if (checkErr) {
              console.error("Error checking time availability:", checkErr);
              // Continue even if time availability check fails
            } else {
              if (checkResults.length > 0) {
                // Update existing time availability record
                const updateTimeAvailabilityQuery = `
                  UPDATE time_availability
                  SET 
                    monday = ?,
                    tuesday = ?,
                    wednesday = ?,
                    thursday = ?,
                    friday = ?,
                    saturday = ?,
                    sunday = ?
                  WHERE professor_id = ?
                `;
                
                pool.query(
                  updateTimeAvailabilityQuery,
                  [
                    time_availability.monday || null,
                    time_availability.tuesday || null,
                    time_availability.wednesday || null,
                    time_availability.thursday || null,
                    time_availability.friday || null,
                    time_availability.saturday || null,
                    time_availability.sunday || null,
                    ref_id
                  ],
                  (updateTimeErr) => {
                    if (updateTimeErr) {
                      console.error("Error updating time availability:", updateTimeErr);
                      // Continue even if time availability update fails
                    }
                  }
                );
              } else {
                // Insert new time availability record
                const insertTimeAvailabilityQuery = `
                  INSERT INTO time_availability (
                    professor_id,
                    monday,
                    tuesday,
                    wednesday,
                    thursday,
                    friday,
                    saturday,
                    sunday
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                pool.query(
                  insertTimeAvailabilityQuery,
                  [
                    ref_id,
                    time_availability.monday || null,
                    time_availability.tuesday || null,
                    time_availability.wednesday || null,
                    time_availability.thursday || null,
                    time_availability.friday || null,
                    time_availability.saturday || null,
                    time_availability.sunday || null
                  ],
                  (insertTimeErr) => {
                    if (insertTimeErr) {
                      console.error("Error inserting time availability:", insertTimeErr);
                      // Continue even if time availability insertion fails
                    }
                  }
                );
              }
            }
          });
        }

        // 5) Update the users table (email, status, and optionally password)
        let updateUsersQuery = `
          UPDATE users
          SET 
            email = ?,
            status = ?
        `;
        
        let usersValues = [email, status];
        
        // Add password update if provided
        if (hashedPassword) {
          updateUsersQuery += `, password = ?`;
          usersValues.push(hashedPassword);
        }
        
        updateUsersQuery += ` WHERE user_id = ?`;
        usersValues.push(userId);

        pool.query(updateUsersQuery, usersValues, async (userErr) => {
          if (userErr) {
            console.error("Error updating dean/chair user record:", userErr);
            return res.status(500).json({ 
              message: "Error updating user record", 
              error: userErr.message 
            });
          }

          // 6) If a new password was provided, send it via email
          if (plainPassword) {
            try {
              await sendNewPasswordEmail(email, first_name, last_name, plainPassword);
            } catch (mailErr) {
              console.error("Error sending dean/chair password email:", mailErr);
              // Continue even if email fails
            }
          }

          return res.json({ message: "Dean/Chair updated successfully." });
        });
      });
    });
  } catch (err) {
    console.error("Error in updateDeanChairUser:", err);
    return res.status(500).json({ 
      message: "Internal server error", 
      error: err.message 
    });
  }
};

exports.getDeanChairById = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // First get the ref_id from users table
    const userQuery = "SELECT ref_id FROM users WHERE user_id = ? AND user_type = 'PROFESSOR'";
    
    pool.query(userQuery, [userId], (userErr, userResults) => {
      if (userErr) {
        return res.status(500).json({ message: "Error finding user", error: userErr.message });
      }
      
      if (!userResults.length) {
        return res.status(404).json({ message: "User not found." });
      }
      
      const professorId = userResults[0].ref_id;
      
      // Now get the full professor details
      const professorQuery = `
        SELECT p.*, c.college_name, c.college_code 
        FROM professor p
        LEFT JOIN college c ON p.college_id = c.college_id
        WHERE p.professor_id = ?
      `;
      
      pool.query(professorQuery, [professorId], (profErr, profResults) => {
        if (profErr) {
          return res.status(500).json({ message: "Error finding professor details", error: profErr.message });
        }
        
        if (!profResults.length) {
          return res.status(404).json({ message: "Professor details not found." });
        }
        
        // Get time availability data
        const timeAvailabilityQuery = `
          SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday
          FROM time_availability
          WHERE professor_id = ?
        `;
        
        pool.query(timeAvailabilityQuery, [professorId], (timeErr, timeResults) => {
          if (timeErr) {
            console.error("Error fetching time availability:", timeErr);
            // Continue even if time availability fetch fails
            return res.json(profResults[0]);
          }
          
          // Combine professor data with time availability
          const professorData = profResults[0];
          
          if (timeResults.length > 0) {
            professorData.time_availability = timeResults[0];
          } else {
            professorData.time_availability = {
              monday: "",
              tuesday: "",
              wednesday: "",
              thursday: "",
              friday: "",
              saturday: "",
              sunday: ""
            };
          }
          
          return res.json(professorData);
        });
      });
    });
  } catch (err) {
    console.error("Error in getDeanChairById:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// NEW: PUT /api/users/professor/:userId
// Updates professor details (in professor and users tables).
// If a new password is provided, update it and send the plain password via email.
exports.updateProfessorUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    // Expected fields: faculty_type, position, degrees, specialization, status, newPassword, time_availability
    // Note: department is removed as it's just an alias for college_code
    // Note: time_availability is now optional
    const { faculty_type, position, degrees, specialization, status, newPassword, time_availability } = req.body;
    
    // Validate required fields
    if (!faculty_type || !position || !specialization || !status) {
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
      // Remove department field from the query as it doesn't exist in the professor table
      const updateProfessorQuery = `
        UPDATE professor
        SET 
          faculty_type = ?,
          position = ?,
          bachelorsDegree = ?,  -- Assuming degrees are stored as a concatenated string or update as needed
          specialization = ?,
          status = ?
        WHERE professor_id = ?
      `;
      // Remove department from the values array
      const professorValues = [faculty_type, position, degrees, specialization, status, ref_id];

      pool.query(updateProfessorQuery, professorValues, (profErr) => {
        if (profErr) {
          console.error("Error updating professor:", profErr);
          return res.status(500).json({ message: "Error updating professor", error: profErr.message });
        }
        
        // 4) Update time availability if provided
        if (time_availability) {
          // First check if time availability record exists
          const checkTimeAvailabilityQuery = `
            SELECT availability_id FROM time_availability WHERE professor_id = ?
          `;
          
          pool.query(checkTimeAvailabilityQuery, [ref_id], (checkErr, checkResults) => {
            if (checkErr) {
              console.error("Error checking time availability:", checkErr);
              // Continue even if time availability check fails
            } else {
              if (checkResults.length > 0) {
                // Update existing time availability record
                const updateTimeAvailabilityQuery = `
                  UPDATE time_availability
                  SET 
                    monday = ?,
                    tuesday = ?,
                    wednesday = ?,
                    thursday = ?,
                    friday = ?,
                    saturday = ?,
                    sunday = ?
                  WHERE professor_id = ?
                `;
                
                pool.query(
                  updateTimeAvailabilityQuery,
                  [
                    time_availability.monday || null,
                    time_availability.tuesday || null,
                    time_availability.wednesday || null,
                    time_availability.thursday || null,
                    time_availability.friday || null,
                    time_availability.saturday || null,
                    time_availability.sunday || null,
                    ref_id
                  ],
                  (updateTimeErr) => {
                    if (updateTimeErr) {
                      console.error("Error updating time availability:", updateTimeErr);
                      // Continue even if time availability update fails
                    }
                  }
                );
              } else {
                // Insert new time availability record
                const insertTimeAvailabilityQuery = `
                  INSERT INTO time_availability (
                    professor_id,
                    monday,
                    tuesday,
                    wednesday,
                    thursday,
                    friday,
                    saturday,
                    sunday
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                pool.query(
                  insertTimeAvailabilityQuery,
                  [
                    ref_id,
                    time_availability.monday || null,
                    time_availability.tuesday || null,
                    time_availability.wednesday || null,
                    time_availability.thursday || null,
                    time_availability.friday || null,
                    time_availability.saturday || null,
                    time_availability.sunday || null
                  ],
                  (insertTimeErr) => {
                    if (insertTimeErr) {
                      console.error("Error inserting time availability:", insertTimeErr);
                      // Continue even if time availability insertion fails
                    }
                  }
                );
              }
            }
          });
        }
        
        // 5) Update the users table (for email, status, and optionally password)
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
          // 6) If a new password was provided, send it via email
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

//const authenticateToken = require("../middleware/authMiddleware"); // Ensure authentication middleware is used
exports.getCurrentUser = (req, res) => {
  const userId = req.user.id; // Extract user ID from token payload

  pool.query(
      `SELECT u.user_id, u.user_type, u.email, a.department 
       FROM users u 
       JOIN admin a ON u.ref_id = a.admin_id
       WHERE u.user_id = ?`,
      [userId],
      (err, results) => {
          if (err) {
              return res.status(500).json({ error: err.message });
          }
          if (results.length === 0) {
              return res.status(404).json({ message: "User not found" });
          }
          res.json(results[0]); // Return user details
      }
  );
};

// GET /api/users/professor/:userId
// Retrieves professor details including time availability
exports.getProfessorById = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // First get the ref_id from users table
    const userQuery = "SELECT ref_id FROM users WHERE user_id = ? AND user_type = 'PROFESSOR'";
    
    pool.query(userQuery, [userId], (userErr, userResults) => {
      if (userErr) {
        return res.status(500).json({ message: "Error finding user", error: userErr.message });
      }
      
      if (!userResults.length) {
        return res.status(404).json({ message: "User not found." });
      }
      
      const professorId = userResults[0].ref_id;
      
      // Now get the full professor details
      const professorQuery = `
        SELECT p.*, c.college_name, c.college_code 
        FROM professor p
        LEFT JOIN college c ON p.college_id = c.college_id
        WHERE p.professor_id = ?
      `;
      
      pool.query(professorQuery, [professorId], (profErr, profResults) => {
        if (profErr) {
          return res.status(500).json({ message: "Error finding professor details", error: profErr.message });
        }
        
        if (!profResults.length) {
          return res.status(404).json({ message: "Professor details not found." });
        }
        
        // Get time availability data
        const timeAvailabilityQuery = `
          SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday
          FROM time_availability
          WHERE professor_id = ?
        `;
        
        pool.query(timeAvailabilityQuery, [professorId], (timeErr, timeResults) => {
          if (timeErr) {
            console.error("Error fetching time availability:", timeErr);
            // Continue even if time availability fetch fails
            return res.json(profResults[0]);
          }
          
          // Combine professor data with time availability
          const professorData = profResults[0];
          
          if (timeResults.length > 0) {
            professorData.time_availability = timeResults[0];
          } else {
            professorData.time_availability = {
              monday: "",
              tuesday: "",
              wednesday: "",
              thursday: "",
              friday: "",
              saturday: "",
              sunday: ""
            };
          }
          
          return res.json(professorData);
        });
      });
    });
  } catch (err) {
    console.error("Error in getProfessorById:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};
