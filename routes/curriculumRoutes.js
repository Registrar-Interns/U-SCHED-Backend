const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');

// Endpoint for file upload – use multer middleware to process the file field named "file"
router.post('/upload', curriculumController.upload.single('file'), curriculumController.uploadCurriculum);

// GET /api/curriculum?year=First Year&program=BSCS
router.get('/', curriculumController.getCurriculum);

// Endpoint to get distinct years for dropdown
router.get('/years', curriculumController.getAllYears);

router.get('/curriculum_courses', curriculumController.getCurriculumCoursesByDepartment);

module.exports = router;