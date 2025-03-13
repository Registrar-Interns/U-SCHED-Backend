const express = require("express");
const router = express.Router();
const professorController = require("../../controllers/professorController");

// Routes for professors
router.get("/", professorController.getAllProfessors);
router.get("/:id", professorController.getProfessorById);
router.post("/", professorController.addProfessor);
router.put("/:id", professorController.updateProfessor);
router.delete("/:id", professorController.deleteProfessor);
router.get("/subjects", professorController.getAllSubjects); // ✅ Fetch subjects for specialization dropdown

module.exports = router;