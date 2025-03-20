require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const cors = require("cors");

// Import your routes
const authRoutes = require('./routes/authRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');
const usersRoutes = require('./routes/usersRoutes');
const passwordResetRoutes = require('./routes/passwordResetRoutes');
const collegeRoutes = require('./routes/collegeRoutes');
const roomAssignmentRoutes = require('./routes/roomAssignmentRoutes');
const professorRoutes = require('./routes/professorRoutes');
const sectionRoutes = require('./routes/sectionRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middlewares
app.use(helmet());
app.use(xss());

// Enable CORS for requests coming from your React dev server
app.use(
    cors({
      origin: "http://localhost:5173",
      credentials: true,
    })
);

// For parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount the auth routes on /api
app.use('/api', authRoutes);
app.use('/api', passwordResetRoutes);

// Mount the curriculum routes
app.use('/api/curriculum', curriculumRoutes);

// Mount the users routes
app.use('/api/users', usersRoutes);

// Mount the college routes
app.use('/api/colleges', collegeRoutes);

// Mount the room routes
app.use('/api/rooms', roomAssignmentRoutes);

// Mount the professor routes
app.use('/api/professors', professorRoutes);

// Mount the section routes
app.use('/api/sections', sectionRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});