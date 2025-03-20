const db = require("../db");

exports.getSectionsByCollege = async (req, res) => {
  try {
    const { college_code } = req.query;

    if (!college_code) {
      console.warn("Missing college_code in request.");
      return res.status(400).json({ error: "College code is required" });
    }

    console.log("Received college_code query:", college_code);

    const [sections] = await db.promise().query(
      `SELECT 
          s.year_id, s.year_level, s.section, s.class_size, s.adviser, 
          p.program_name, p.program_id
       FROM section s
       JOIN program p ON s.program_id = p.program_id
       JOIN college c ON p.college_id = c.college_id
       WHERE c.college_code = ?`,
      [college_code]
    );

    console.log("Fetched sections:", sections.length ? sections : "No sections found");
    res.status(200).json(sections);
  } catch (error) {
    console.error("Error fetching sections:", error.message);
    res.status(500).json({ error: "Failed to fetch sections", details: error.sqlMessage || error.message });
  }
};

// Get Programs by College Code
exports.getProgramsByCollege = async (req, res) => {
  try {
    const { college_code } = req.query;
    console.log("Fetching programs for college_code:", college_code);

    if (!college_code) {
      return res.status(400).json({ error: "College code is required" });
    }

    const [programs] = await db.promise().query(
      `SELECT program_id, program_name 
       FROM program 
       JOIN college c ON program.college_id = c.college_id
       WHERE c.college_code = ?`,
      [college_code]
    );

    console.log("Fetched programs:", programs);
    res.status(200).json(programs);
  } catch (error) {
    console.error("Error fetching programs:", error);
    res.status(500).json({ error: "Failed to fetch programs", details: error.message });
  }
};


// Modify the addSection function
exports.addSection = async (req, res) => {
  const { year_level, section, class_size, program_id, adviser } = req.body;
  const { college_code } = req.query; // Use college_code from query parameter
  
  console.log("Received section data:", req.body);
  console.log("User's college_code:", college_code);

  // Validate required fields
  if (!year_level?.trim() || !section?.trim() || !class_size || !program_id || !adviser?.trim()) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // First get the college_id from college_code
    const [collegeResult] = await db.promise().query(
      "SELECT college_id FROM college WHERE college_code = ?",
      [college_code]
    );
    
    if (collegeResult.length === 0) {
      return res.status(404).json({ error: "College not found" });
    }
    
    const college_id = collegeResult[0].college_id;
    console.log("Resolved college_id:", college_id, "from college_code:", college_code);

    // Check if program belongs to the college
    const [program] = await db.promise().query(
      "SELECT * FROM program WHERE program_id = ? AND college_id = ?",
      [program_id, college_id]
    );

    console.log("Program verification result:", program);
    if (program.length === 0) {
      return res.status(403).json({ error: "Unauthorized to add sections to this program" });
    }

    // Check if section already exists in the given year level and program
    const [existingSection] = await db.promise().query(
      "SELECT * FROM section WHERE section = ? AND year_level = ? AND program_id = ?",
      [section, year_level, program_id]
    );

    console.log("Existing section check:", existingSection);
    if (existingSection.length > 0) {
      return res.status(400).json({ error: "Section already exists in this year level and program" });
    }

    // Insert new section
    const [result] = await db.promise().query(
      "INSERT INTO section (year_level, section, class_size, program_id, adviser, college_id) VALUES (?, ?, ?, ?, ?, ?)",
      [year_level, section, class_size, program_id, adviser, college_id]
    );

    console.log("Section added with ID:", result.insertId);
    res.status(201).json({ message: "Section added successfully!", section_id: result.insertId });
  } catch (error) {
    console.error("Error adding section:", error);
    res.status(500).json({ error: "Failed to add section", details: error.sqlMessage || error.message });
  }
};

// Update Section
exports.updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { year_id, year_level, section, class_size, program_id, adviser } = req.body;
    console.log("Updating section with ID:", id, "Data:", req.body);

    if (!year_id || !year_level || !section || !class_size || !program_id || !adviser) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const [existingSection] = await db.promise().query("SELECT * FROM section WHERE section_id = ?", [id]);
    console.log("Existing section data:", existingSection);

    if (existingSection.length === 0) {
      return res.status(404).json({ error: "Section not found" });
    }

    // Verify program belongs to the user's college
    const { college_id } = req.query;
    const [program] = await db.promise().query(
      "SELECT * FROM program WHERE program_id = ? AND college_id = ?",
      [program_id, college_id]
    );

    if (program.length === 0) {
      return res.status(403).json({ error: "Unauthorized to update section with this program" });
    }

    await db.promise().query(
      "UPDATE section SET year_id=?, year_level=?, section=?, class_size=?, program_id=?, adviser=? WHERE section_id=?",
      [year_id, year_level, section, class_size, program_id, adviser, id]
    );

    console.log("Section updated successfully");
    res.status(200).json({ message: "Section updated successfully!" });
  } catch (error) {
    console.error("Error updating section:", error);
    res.status(500).json({ error: "Failed to update section", details: error.message });
  }
};
