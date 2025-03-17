const express = require("express");
const router = express.Router();
const professorController = require("../controllers/professorController");

// Routes for professors
router.get("/", professorController.getAllProfessors);
router.get("/:id", professorController.getProfessorById);
router.post("/", professorController.addProfessor);
router.put("/:id", professorController.updateProfessor);
router.delete("/:id", professorController.deleteProfessor);

// College routes (for debugging and reference)
router.get("/colleges/all", professorController.getAllColleges);

// Specialization routes
router.get("/subjects/all", professorController.getAllSubjects);

// Time availability routes
router.get("/:id/time-availability", professorController.getProfessorTimeAvailability);
router.put("/:id/time-availability", professorController.updateProfessorTimeAvailability);

module.exports = router;