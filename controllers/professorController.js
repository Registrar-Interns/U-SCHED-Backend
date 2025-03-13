const db = require("../../db"); // ✅ Ensure correct import

// Get all professors (FIXED)
// ✅ Fix Backend Query to Ensure Full Name is Generated Properly
exports.getAllProfessors = async (req, res) => {
    try {
        const [results] = await db.promise().query(`
            SELECT 
                professor_id,
                CASE 
                    WHEN first_name IS NULL OR first_name = '' 
                      OR last_name IS NULL OR last_name = '' THEN 'No Name Provided'
                    ELSE CONCAT(
                        last_name, ', ', first_name, 
                        IFNULL(CONCAT(' ', LEFT(middle_name, 1), '.'), ''), 
                        IFNULL(CONCAT(' ', extended_name), '')
                    ) 
                END AS full_name,
                department,
                faculty_type,
                position,
                time_availability,
                bachelorsDegree,
                mastersDegree,
                doctorateDegree,
                specialization,
                status
            FROM professor
            ORDER BY last_name, first_name;
        `);
        console.log("API Response:", results); // ✅ Debug API Output
        res.status(200).json(results);
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
                professor_id,
                CONCAT(
                    COALESCE(last_name, ''), ', ', 
                    COALESCE(first_name, ''), 
                    CASE WHEN middle_name IS NOT NULL AND middle_name <> '' THEN CONCAT(' ', LEFT(middle_name, 1), '.') ELSE '' END, 
                    CASE WHEN extended_name IS NOT NULL AND extended_name <> '' THEN CONCAT(' ', extended_name) ELSE '' END
                ) AS full_name,
                department,
                faculty_type,
                position,
                time_availability,
                bachelorsDegree,
                mastersDegree,
                doctorateDegree,
                specialization,
                status
            FROM professor 
            WHERE professor_id = ?
        `, [id]);

        if (results.length === 0) {
            return res.status(404).json({ message: "Professor not found" });
        }
        res.status(200).json(results[0]);
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Add a new professor
exports.addProfessor = async (req, res) => {
    try {
        const {
            first_name, middle_name, last_name, extended_name, department,
            faculty_type, position, time_availability, bachelorsDegree,
            mastersDegree, doctorateDegree, specialization, status
        } = req.body;

        if (!first_name || !last_name || !department || !faculty_type || !position || !status) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const sql = `
            INSERT INTO professor (
                first_name, middle_name, last_name, extended_name, department, 
                faculty_type, position, time_availability, bachelorsDegree, 
                mastersDegree, doctorateDegree, specialization, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.promise().query(sql, [
            first_name, middle_name || null, last_name, extended_name || null, department,
            faculty_type, position, time_availability || null, bachelorsDegree || null,
            mastersDegree || null, doctorateDegree || null, specialization || null, status
        ]);

        res.status(201).json({ message: "Professor added successfully!" });
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
            first_name, middle_name, last_name, extended_name, department,
            faculty_type, position, time_availability, bachelorsDegree,
            mastersDegree, doctorateDegree, specialization, status
        } = req.body;

        const sql = `
            UPDATE professor 
            SET first_name=?, middle_name=?, last_name=?, extended_name=?, department=?, 
                faculty_type=?, position=?, time_availability=?, bachelorsDegree=?, 
                mastersDegree=?, doctorateDegree=?, specialization=?, status=? 
            WHERE professor_id=?
        `;

        const [result] = await db.promise().query(sql, [
            first_name, middle_name || null, last_name, extended_name || null, department,
            faculty_type, position, time_availability || null, bachelorsDegree || null,
            mastersDegree || null, doctorateDegree || null, specialization || null, status, id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Professor not found" });
        }

        res.status(200).json({ message: "Professor updated successfully!" });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Delete a professor
exports.deleteProfessor = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query("DELETE FROM professor WHERE professor_id = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Professor not found" });
        }

        res.status(200).json({ message: "Professor deleted successfully!" });
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
