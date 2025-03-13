const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const pool = require('../db');

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// POST /api/curriculum/upload
exports.uploadCurriculum = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const ext = req.file.originalname.split('.').pop().toLowerCase();
  let courses = [];

  if (ext === 'csv') {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Debug: log header keys and row content
        console.log("CSV Row Keys:", Object.keys(row));
        console.log("DEBUG CSV ROW:", row);

        const defaultDepartment = req.body.department;
        const defaultProgram = req.body.program;

        // Convert Lec/Lab to integers, fallback to 0
        const lecUnits = parseInt(row["Lec"]) || 0;
        const labUnits = parseInt(row["Lab"]) || 0;

        courses.push({
            department: (row["Department"] || defaultDepartment || "N/A")
            .trim()
            .toUpperCase(),
            program: (row["Program"] || defaultProgram || "N/A")
            .trim()
            .toUpperCase(),

            year: toTitleCase(row["Year Level"] || "First Year"),
            semester: toTitleCase(row["Semester"] || ""),

            course_code: row["Course Code"] ? row["Course Code"].trim().toUpperCase() : "N/A",

            course_title: toTitleCase(row["Course Title"] || "N/A"),

            lec: lecUnits,
            lab: labUnits,
            total: lecUnits + labUnits,

            pre_co_requisite: row["Pre/Co-Requisite"]
            ? row["Pre/Co-Requisite"].trim().toUpperCase()
            : null,

            is_gened: (row["GenEd"] && row["GenEd"].toUpperCase() === "TRUE") ? 1 : 0
        });
        })
      .on('end', () => {
        console.log("Finished processing CSV. Courses:", courses);
        insertCourses(courses, res);
      });
  } else if (ext === 'xlsx' || ext === 'xls') {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Debug
      console.log("Excel Data:", jsonData);

      courses = jsonData.map((row) => {
        console.log("Excel Row Keys:", Object.keys(row));

        const defaultDepartment = req.body.department;
        const defaultProgram = req.body.program;

        const lecUnits = parseInt(row["Lec"]) || 0;
        const labUnits = parseInt(row["Lab"]) || 0;

        return {
            department: (row["Department"] || defaultDepartment || "N/A").trim().toUpperCase(),
            program: (row["Program"] || defaultProgram || "N/A").trim().toUpperCase(),
            year: toTitleCase(row["Year Level"] || "First Year"),
            semester: toTitleCase(row["Semester"] || ""),
            course_code: row["Course Code"] ? row["Course Code"].trim().toUpperCase() : "N/A",
            course_title: toTitleCase(row["Course Title"] || "N/A"),
            lec: lecUnits,
            lab: labUnits,
            total: lecUnits + labUnits,
            pre_co_requisite: row["Pre/Co-Requisite"]
              ? row["Pre/Co-Requisite"].trim().toUpperCase()
              : null,
            is_gened: (row["GenEd"] && row["GenEd"].toUpperCase() === "TRUE") ? 1 : 0
        };
      });
      insertCourses(courses, res);
    } catch (error) {
      console.error("Error processing Excel file:", error);
      return res.status(500).json({ message: 'Error processing Excel file.', error: error.message });
    }
  } else {
    return res.status(400).json({ message: 'Unsupported file type.' });
  }
};

function toTitleCase(str) {
    if (!str) return "";
    return str
      .trim()                                 // remove leading/trailing whitespace
      .toLowerCase()                          // convert everything to lower
      .split(/\s+/)                           // split on spaces
      .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // capitalize each word
      .join(" ");
}  

function insertCourses(courses, res) {
  if (courses.length === 0) {
    return res.status(400).json({ message: 'No course data found in file.' });
  }
  
  // Use the first course's department/program as provided (which are actually college_code and program_code)
  const collegeCode = courses[0].department;
  const programCode = courses[0].program;
  
  // Lookup the college_id based on collegeCode
  pool.query(
    `SELECT college_id FROM college WHERE college_code = ?`,
    [collegeCode],
    (err, collegeResults) => {
      if (err) {
        console.error("Error retrieving college_id:", err);
        return res.status(500).json({ message: 'Error retrieving college.', error: err.message });
      }
      if (collegeResults.length === 0) {
        return res.status(400).json({ message: 'Invalid college code provided.' });
      }
      const college_id = collegeResults[0].college_id;
      
      // Lookup program_id based on programCode and college_id
      pool.query(
        `SELECT program_id FROM program WHERE program_code = ? AND college_id = ?`,
        [programCode, college_id],
        (err, programResults) => {
          if (err) {
            console.error("Error retrieving program_id:", err);
            return res.status(500).json({ message: 'Error retrieving program.', error: err.message });
          }
          if (programResults.length === 0) {
            return res.status(400).json({ message: 'Invalid program code provided.' });
          }
          const program_id = programResults[0].program_id;
          
          // Now delete existing courses using these IDs
          const deleteQuery = `DELETE FROM curriculum_courses WHERE college_id = ? AND program_id = ?`;
          pool.query(deleteQuery, [college_id, program_id], (err, deleteResult) => {
            if (err) {
              console.error("Error deleting previous courses:", err);
              return res.status(500).json({ message: 'Error deleting previous courses.', error: err.message });
            }
            
            // Prepare values for insertion – notice we now use college_id and program_id
            const query = `
              INSERT INTO curriculum_courses 
                (college_id, program_id, year, semester, course_code, course_title, lec, lab, total, pre_co_requisite, is_gened)
              VALUES ?
            `;
            const values = courses.map(course => [
              college_id,
              program_id,
              course.year,
              course.semester,
              course.course_code,
              course.course_title,
              course.lec,
              course.lab,
              course.total,
              course.pre_co_requisite,
              course.is_gened
            ]);
            
            pool.query(query, [values], (err, results) => {
              if (err) {
                console.error("Error inserting data:", err);
                return res.status(500).json({ message: 'Error inserting data.', error: err.message });
              }
              console.log("Data inserted successfully. Inserted rows:", results.affectedRows);
              res.json({ message: 'File processed and data inserted.', inserted: results.affectedRows });
            });
          });
        }
      );
    }
  );
}

// GET /api/curriculum?year=First Year&program=BSIT
exports.getCurriculum = (req, res) => {
  const { year, program } = req.query; // e.g. "First Year", "BSIT"
  
  // Validate both
  if (!year || !program) {
    return res.status(400).json({ message: 'Year and Program are required.' });
  }

  // JOIN the program table so we can filter by program_code
  const query = `
    SELECT c.*
    FROM curriculum_courses c
    JOIN program p ON c.program_id = p.program_id
    WHERE c.year = ? 
      AND p.program_code = ?
    ORDER BY c.id ASC
  `;
  pool.query(query, [year, program], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: 'Error retrieving curriculum.',
        error: err.message,
      });
    }
    res.json(results);
  });
};

// GET /api/curriculum?year=First%20Year
exports.getCurriculumByYear = (req, res) => {
  const year = req.query.year;
  if (!year) {
    return res.status(400).json({ message: 'Year is required.' });
  }
  const query = 'SELECT * FROM curriculum_courses WHERE year = ?';
  pool.query(query, [year], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Error retrieving curriculum.', error: err.message });
    }
    res.json(results);
  });
};

// GET /api/curriculum/years
exports.getAllYears = (req, res) => {
  const query = 'SELECT DISTINCT year FROM curriculum_courses';
  pool.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Error retrieving years.', error: err.message });
    }
    res.json(results.map(r => r.year));
  });
};

// GET /api/curriculum_courses?department=CCS
exports.getCurriculumCoursesByDepartment = (req, res) => {
  const { department } = req.query;

  if (!department) {
    return res.status(400).json({ message: "Department is required." });
  }

  console.log(`Fetching curriculum courses for department: ${department}`);

  const query = `
    SELECT DISTINCT c.course_title 
    FROM curriculum_courses c
    JOIN program p ON c.program_id = p.program_id
    JOIN college col ON c.college_id = col.college_id
    WHERE col.college_code = ?
  `;

  pool.query(query, [department], (err, results) => {
    if (err) {
      console.error("Error fetching curriculum courses:", err);
      return res.status(500).json({ message: "Database query failed", error: err.message });
    }

    console.log("Database results:", results);
    res.json(results); // Send fetched course titles
  });
};

exports.upload = upload;
