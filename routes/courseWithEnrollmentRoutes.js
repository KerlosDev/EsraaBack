const express = require("express");
const router = express.Router();
const { getCourseWithEnrollmentCheck } = require("../services/courseWithEnrollmentService");
const { optionalAuth } = require("../services/authService");

// Combined endpoint for course data with enrollment check
router.get("/:courseId", optionalAuth, getCourseWithEnrollmentCheck);

module.exports = router;
