const db = require("../db"); // ✅ Ensure correct import

// Get all professors (FIXED)
// ✅ Fix Backend Query to Ensure Full Name is Generated Properly
exports.getAllProfessors = async (req, res) => {
    try {
        // First get all professors
        const [professors] = await db.promise().query(`
            SELECT 
                p.professor_id,
                CASE 
                    WHEN p.first_name IS NULL OR p.first_name = '' 
                      OR p.last_name IS NULL OR p.last_name = '' THEN 'No Name Provided'
                    ELSE CONCAT(
                        p.last_name, ', ', p.first_name, 
                        IFNULL(CONCAT(' ', LEFT(p.middle_name, 1), '.'), ''), 
                        IFNULL(CONCAT(' ', p.extended_name), '')
                    ) 
                END AS full_name,
                c.college_code as department,
                p.faculty_type,
                p.position,
                p.bachelorsDegree,
                p.mastersDegree,
                p.doctorateDegree,
                p.specialization,
                p.status
            FROM professor p
            LEFT JOIN college c ON p.college_id = c.college_id
            ORDER BY p.last_name, p.first_name;
        `);
        
        // For each professor, get their time availability
        const professorsWithTimeAvailability = await Promise.all(
            professors.map(async (professor) => {
                const [timeAvailability] = await db.promise().query(
                    `SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday 
                     FROM time_availability 
                     WHERE professor_id = ?`,
                    [professor.professor_id]
                );
                
                return {
                    ...professor,
                    time_availability: timeAvailability.length > 0 ? timeAvailability[0] : {
                        monday: "",
                        tuesday: "",
                        wednesday: "",
                        thursday: "",
                        friday: "",
                        saturday: "",
                        sunday: ""
                    }
                };
            })
        );
        
        console.log("API Response:", professorsWithTimeAvailability); // ✅ Debug API Output
        res.status(200).json(professorsWithTimeAvailability);
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Get a single professor by ID
exports.getProfessorById = async (req, res) => {
    try {
        const { id } = req.params;
        const [results] = await db.promise().query(`
            SELECT 
                p.professor_id,
                p.first_name,
                p.middle_name,
                p.last_name,
                p.extended_name,
                p.college_id,
                c.college_code as department,
                p.faculty_type,
                p.position,
                p.bachelorsDegree,
                p.mastersDegree,
                p.doctorateDegree,
                p.specialization,
                p.status
            FROM professor p
            LEFT JOIN college c ON p.college_id = c.college_id
            WHERE p.professor_id = ?
        `, [id]);

        if (results.length === 0) {
            return res.status(404).json({ message: "Professor not found" });
        }
        
        // Get time availability
        const [timeAvailability] = await db.promise().query(
            `SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday 
             FROM time_availability 
             WHERE professor_id = ?`,
            [id]
        );
        
        // Get email from users table
        const [userInfo] = await db.promise().query(
            `SELECT email 
             FROM users 
             WHERE ref_id = ? AND user_type = 'PROFESSOR'`,
            [id]
        );
        
        const professorData = {
            ...results[0],
            email: userInfo.length > 0 ? userInfo[0].email : "",
            time_availability: timeAvailability.length > 0 ? timeAvailability[0] : {
                monday: "",
                tuesday: "",
                wednesday: "",
                thursday: "",
                friday: "",
                saturday: "",
                sunday: ""
            }
        };
        
        res.status(200).json(professorData);
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Add a new professor
exports.addProfessor = async (req, res) => {
    try {
        const {
            first_name, middle_name, last_name, extended_name, college_id,
            faculty_type, position, time_availability, bachelorsDegree,
            mastersDegree, doctorateDegree, specialization, status, email
        } = req.body;

        // Debug log
        console.log("Adding professor with data:", { 
            first_name, last_name, college_id, faculty_type, position, status 
        });
        console.log("College ID type:", typeof college_id);
        console.log("Full request body:", req.body);
        
        // Detailed validation logging
        console.log("Validation check:");
        console.log("- first_name:", first_name, Boolean(first_name));
        console.log("- last_name:", last_name, Boolean(last_name));
        console.log("- college_id:", college_id, Boolean(college_id));
        console.log("- faculty_type:", faculty_type, Boolean(faculty_type));
        console.log("- position:", position, Boolean(position));
        console.log("- status:", status, Boolean(status));

        // Check if any required fields are missing
        const missingFields = [];
        if (!first_name) missingFields.push("first_name");
        if (!last_name) missingFields.push("last_name");
        if (!college_id && college_id !== 0) missingFields.push("college_id");
        if (!faculty_type) missingFields.push("faculty_type");
        if (!position) missingFields.push("position");
        if (!status) missingFields.push("status");
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: "Missing required fields",
                details: `The following fields are required: ${missingFields.join(", ")}`,
                receivedData: {
                    first_name, last_name, college_id, faculty_type, position, status
                }
            });
        }

        // Ensure college_id is a number
        let collegeIdNum;
        if (typeof college_id === 'number') {
            collegeIdNum = college_id;
        } else {
            collegeIdNum = parseInt(college_id);
            if (isNaN(collegeIdNum)) {
                return res.status(400).json({ 
                    error: "Invalid college ID", 
                    details: `College ID must be a number. Received: ${college_id} (${typeof college_id})` 
                });
            }
        }

        // Start a transaction
        const connection = await db.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Verify that the college_id exists in the college table
            const [collegeResult] = await connection.query(
                "SELECT college_id FROM college WHERE college_id = ?",
                [collegeIdNum]
            );
            
            if (collegeResult.length === 0) {
                await connection.rollback();
                return res.status(400).json({ 
                    error: "Invalid college ID", 
                    details: `College ID ${collegeIdNum} does not exist in the database.` 
                });
            }
            
            // 1. Insert into professor table
            const [professorResult] = await connection.query(`
                INSERT INTO professor (
                    first_name, middle_name, last_name, extended_name, college_id, 
                    faculty_type, position, bachelorsDegree, 
                    mastersDegree, doctorateDegree, specialization, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                first_name, middle_name || null, last_name, extended_name || null, collegeIdNum,
                faculty_type, position, bachelorsDegree || null,
                mastersDegree || null, doctorateDegree || null, 
                Array.isArray(specialization) ? specialization.join(", ") : specialization, 
                status
            ]);
            
            const professorId = professorResult.insertId;
            
            // 2. Insert time availability if provided
            if (time_availability) {
                await connection.query(`
                    INSERT INTO time_availability (
                        professor_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    professorId,
                    time_availability.monday || "",
                    time_availability.tuesday || "",
                    time_availability.wednesday || "",
                    time_availability.thursday || "",
                    time_availability.friday || "",
                    time_availability.saturday || "",
                    time_availability.sunday || ""
                ]);
            }
            
            // 3. If email is provided, create a user account
            if (email) {
                // Generate a random password (or implement your own logic)
                const defaultPassword = Math.random().toString(36).slice(-8);
                
                await connection.query(`
                    INSERT INTO users (
                        ref_id, user_type, email, password, role, status
                    ) VALUES (?, 'PROFESSOR', ?, ?, 'USER', ?)
                `, [
                    professorId, email, defaultPassword, status
                ]);
            }
            
            await connection.commit();
            res.status(201).json({ 
                message: "Professor added successfully!",
                professor_id: professorId
            });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Update professor details
exports.updateProfessor = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            first_name, middle_name, last_name, extended_name, college_id,
            faculty_type, position, time_availability, bachelorsDegree,
            mastersDegree, doctorateDegree, specialization, status, email
        } = req.body;

        // Debug log
        console.log("Updating professor ID:", id, "with data:", { 
            first_name, last_name, college_id, faculty_type, position, status 
        });
        console.log("College ID type:", typeof college_id);
        console.log("Full request body:", req.body);
        
        // Detailed validation logging
        console.log("Validation check:");
        console.log("- first_name:", first_name, Boolean(first_name));
        console.log("- last_name:", last_name, Boolean(last_name));
        console.log("- college_id:", college_id, Boolean(college_id));
        console.log("- faculty_type:", faculty_type, Boolean(faculty_type));
        console.log("- position:", position, Boolean(position));
        console.log("- status:", status, Boolean(status));

        // Check if any required fields are missing
        const missingFields = [];
        if (!first_name) missingFields.push("first_name");
        if (!last_name) missingFields.push("last_name");
        if (!college_id && college_id !== 0) missingFields.push("college_id");
        if (!faculty_type) missingFields.push("faculty_type");
        if (!position) missingFields.push("position");
        if (!status) missingFields.push("status");
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: "Missing required fields", 
                details: `The following fields are required: ${missingFields.join(", ")}`,
                receivedData: {
                    first_name, last_name, college_id, faculty_type, position, status
                }
            });
        }

        // Ensure college_id is a number
        let collegeIdNum;
        if (typeof college_id === 'number') {
            collegeIdNum = college_id;
        } else {
            collegeIdNum = parseInt(college_id);
            if (isNaN(collegeIdNum)) {
                return res.status(400).json({ 
                    error: "Invalid college ID", 
                    details: `College ID must be a number. Received: ${college_id} (${typeof college_id})` 
                });
            }
        }

        // Start a transaction
        const connection = await db.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Verify that the college_id exists in the college table
            const [collegeResult] = await connection.query(
                "SELECT college_id FROM college WHERE college_id = ?",
                [collegeIdNum]
            );
            
            if (collegeResult.length === 0) {
                await connection.rollback();
                return res.status(400).json({ 
                    error: "Invalid college ID", 
                    details: `College ID ${collegeIdNum} does not exist in the database.` 
                });
            }
            
            // 1. Update professor table
            const [professorResult] = await connection.query(`
                UPDATE professor 
                SET first_name=?, middle_name=?, last_name=?, extended_name=?, college_id=?, 
                    faculty_type=?, position=?, bachelorsDegree=?, 
                    mastersDegree=?, doctorateDegree=?, specialization=?, status=? 
                WHERE professor_id=?
            `, [
                first_name, middle_name || null, last_name, extended_name || null, collegeIdNum,
                faculty_type, position, bachelorsDegree || null,
                mastersDegree || null, doctorateDegree || null, 
                Array.isArray(specialization) ? specialization.join(", ") : specialization, 
                status, id
            ]);

            if (professorResult.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "Professor not found" });
            }
            
            // 2. Update time availability if provided
            if (time_availability) {
                // Check if time availability record exists
                const [existingTimeAvailability] = await connection.query(
                    `SELECT availability_id FROM time_availability WHERE professor_id = ?`,
                    [id]
                );
                
                if (existingTimeAvailability.length > 0) {
                    // Update existing record
                    await connection.query(`
                        UPDATE time_availability
                        SET monday=?, tuesday=?, wednesday=?, thursday=?, friday=?, saturday=?, sunday=?
                        WHERE professor_id=?
                    `, [
                        time_availability.monday || "",
                        time_availability.tuesday || "",
                        time_availability.wednesday || "",
                        time_availability.thursday || "",
                        time_availability.friday || "",
                        time_availability.saturday || "",
                        time_availability.sunday || "",
                        id
                    ]);
                } else {
                    // Insert new record
                    await connection.query(`
                        INSERT INTO time_availability (
                            professor_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        id,
                        time_availability.monday || "",
                        time_availability.tuesday || "",
                        time_availability.wednesday || "",
                        time_availability.thursday || "",
                        time_availability.friday || "",
                        time_availability.saturday || "",
                        time_availability.sunday || ""
                    ]);
                }
            }
            
            // 3. Update user account if email is provided
            if (email) {
                // Check if user account exists
                const [existingUser] = await connection.query(
                    `SELECT user_id FROM users WHERE ref_id = ? AND user_type = 'PROFESSOR'`,
                    [id]
                );
                
                if (existingUser.length > 0) {
                    // Update existing user
                    await connection.query(`
                        UPDATE users
                        SET email=?, status=?
                        WHERE ref_id=? AND user_type='PROFESSOR'
                    `, [email, status, id]);
                } else {
                    // Create new user
                    const defaultPassword = Math.random().toString(36).slice(-8);
                    
                    await connection.query(`
                        INSERT INTO users (
                            ref_id, user_type, email, password, role, status
                        ) VALUES (?, 'PROFESSOR', ?, ?, 'USER', ?)
                    `, [id, email, defaultPassword, status]);
                }
            }
            
            await connection.commit();
            res.status(200).json({ message: "Professor updated successfully!" });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Delete a professor
exports.deleteProfessor = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Start a transaction
        const connection = await db.promise().getConnection();
        await connection.beginTransaction();
        
        try {
            // 1. Delete time availability
            await connection.query("DELETE FROM time_availability WHERE professor_id = ?", [id]);
            
            // 2. Delete user account if exists
            await connection.query("DELETE FROM users WHERE ref_id = ? AND user_type = 'PROFESSOR'", [id]);
            
            // 3. Delete professor
            const [result] = await connection.query("DELETE FROM professor WHERE professor_id = ?", [id]);
            
            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "Professor not found" });
            }
            
            await connection.commit();
            res.status(200).json({ message: "Professor deleted successfully!" });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Fetch all curriculum subjects for specialization dropdown
exports.getAllSubjects = async (req, res) => {
    try {
        const [results] = await db.promise().query("SELECT id, subject_name AS name FROM curriculum_courses");
        res.status(200).json(results);
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Get professor time availability
exports.getProfessorTimeAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [results] = await db.promise().query(
            `SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday 
             FROM time_availability 
             WHERE professor_id = ?`,
            [id]
        );
        
        if (results.length === 0) {
            return res.status(200).json({
                monday: "",
                tuesday: "",
                wednesday: "",
                thursday: "",
                friday: "",
                saturday: "",
                sunday: ""
            });
        }
        
        res.status(200).json(results[0]);
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Update professor time availability
exports.updateProfessorTimeAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const { monday, tuesday, wednesday, thursday, friday, saturday, sunday } = req.body;
        
        // Check if time availability record exists
        const [existingRecord] = await db.promise().query(
            "SELECT availability_id FROM time_availability WHERE professor_id = ?",
            [id]
        );
        
        if (existingRecord.length > 0) {
            // Update existing record
            await db.promise().query(
                `UPDATE time_availability 
                 SET monday = ?, tuesday = ?, wednesday = ?, thursday = ?, friday = ?, saturday = ?, sunday = ? 
                 WHERE professor_id = ?`,
                [
                    monday || "",
                    tuesday || "",
                    wednesday || "",
                    thursday || "",
                    friday || "",
                    saturday || "",
                    sunday || "",
                    id
                ]
            );
        } else {
            // Insert new record
            await db.promise().query(
                `INSERT INTO time_availability (professor_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    monday || "",
                    tuesday || "",
                    wednesday || "",
                    thursday || "",
                    friday || "",
                    saturday || "",
                    sunday || ""
                ]
            );
        }
        
        res.status(200).json({ message: "Time availability updated successfully" });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Get all colleges (for debugging and reference)
exports.getAllColleges = async (req, res) => {
    try {
        const [results] = await db.promise().query("SELECT college_id, college_name, college_code FROM college");
        res.status(200).json(results);
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
