const db = require('../db');

// Get all colleges
exports.getAllColleges = async (req, res) => {
  try {
    const [colleges] = await db.promise().query('SELECT * FROM college');
    res.status(200).json(colleges);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch colleges' });
  }
};

// Get all programs under a specific college
exports.getProgramsByCollege = async (req, res) => {
  const { college_id } = req.params;
  try {
    const [programs] = await db.promise().query(
      'SELECT * FROM program WHERE college_id = ?',
      [college_id]
    );
    res.status(200).json(programs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch programs for this college' });
  }
};

// Add a new college
exports.addCollege = async (req, res) => {
  const { college_name, college_code, programs } = req.body;

  if (!college_name || !college_code) {
    return res.status(400).json({ error: 'College name and code are required' });
  }

  try {
    // Insert college
    const [result] = await db.promise().query(
      'INSERT INTO college (college_name, college_code) VALUES (?, ?)',
      [college_name, college_code]
    );
    const college_id = result.insertId;

    // Insert programs
    if (programs && programs.length > 0) {
      const values = programs.map(p => [college_id, p.program_name, p.program_code]);
      await db.promise().query(
        'INSERT INTO program (college_id, program_name, program_code) VALUES ?',
        [values]
      );
    }

    res.status(201).json({ message: 'College and programs added successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add college and programs' });
  }
};

// Edit a college and its programs
exports.updateCollege = async (req, res) => {
  const { id } = req.params;
  const { college_name, college_code, programs } = req.body;

  if (!college_name || !college_code) {
    return res.status(400).json({ error: 'College name and code are required' });
  }

  try {
    // Update college details
    await db.promise().query(
      'UPDATE college SET college_name = ?, college_code = ? WHERE college_id = ?',
      [college_name, college_code, id]
    );

    // Fetch existing programs for the college
    const [existingPrograms] = await db.promise().query(
      'SELECT program_id FROM program WHERE college_id = ?',
      [id]
    );

    const existingProgramIds = existingPrograms.map(p => p.program_id);
    const incomingProgramIds = programs.map(p => p.program_id).filter(id => id !== undefined);

    // Delete removed programs
    const programsToDelete = existingProgramIds.filter(id => !incomingProgramIds.includes(id));
    if (programsToDelete.length > 0) {
      await db.promise().query(
        'DELETE FROM program WHERE program_id IN (?)',
        [programsToDelete]
      );
    }

    // Update existing programs
    for (const program of programs) {
      if (program.program_id) {
        await db.promise().query(
          'UPDATE program SET program_name = ?, program_code = ? WHERE program_id = ?',
          [program.program_name, program.program_code, program.program_id]
        );
      } else {
        // Insert new program
        await db.promise().query(
          'INSERT INTO program (college_id, program_name, program_code) VALUES (?, ?, ?)',
          [id, program.program_name, program.program_code]
        );
      }
    }

    res.status(200).json({ message: 'College and programs updated successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update college and programs' });
  }
};

// Delete a college
exports.deleteCollege = async (req, res) => {
  const { id } = req.params;
  try {
    await db.promise().query('DELETE FROM college WHERE college_id = ?', [id]);
    res.status(200).json({ message: 'College deleted successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete college' });
  }
};

// Delete a program
exports.deleteProgram = async (req, res) => {
  const { id } = req.params;
  try {
    await db.promise().query('DELETE FROM program WHERE program_id = ?', [id]);
    res.status(200).json({ message: 'Program deleted successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete program' });
  }
};