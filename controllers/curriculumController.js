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
    
    // Assume file is for one department/program; take these from the first course
    const department = courses[0].department;
    const program = courses[0].program;
    
    // Delete existing courses for this department and program
    const deleteQuery = `DELETE FROM curriculum_courses WHERE department = ? AND program = ?`;
    pool.query(deleteQuery, [department, program], (err, deleteResult) => {
      if (err) {
        console.error("Error deleting previous courses:", err);
        return res.status(500).json({ message: 'Error deleting previous courses.', error: err.message });
      }
      
      // Insert new courses after deletion
      const query = `
        INSERT INTO curriculum_courses 
          (department, program, year, semester, course_code, course_title, lec, lab, total, pre_co_requisite, is_gened)
        VALUES ?
      `;
      const values = courses.map(course => [
        course.department,
        course.program,
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
  

// GET /api/curriculum?year=First Year&program=BSCS
exports.getCurriculum = (req, res) => {
    const { year, program } = req.query;
  
    // Validate both
    if (!year || !program) {
      return res.status(400).json({ message: 'Year and Program are required.' });
    }
  
    const query = `
      SELECT * 
      FROM curriculum_courses
      WHERE year = ? AND program = ?
      ORDER BY id ASC
    `;
    pool.query(query, [year, program], (err, results) => {
      if (err) {
        return res
          .status(500)
          .json({ message: 'Error retrieving curriculum.', error: err.message });
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

exports.upload = upload;
