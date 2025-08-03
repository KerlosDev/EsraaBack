const express = require('express');
const {
  saveExamResult,
  getResultsByStudent,
  getExamHistory,
  getAllExamResults,
  getStudentsByExam,
  getTopPerformers,
  getStudentsByExamId,
  getMonthlyComparison,
  getPerformanceTrends
} = require('../services/examResltsServise');

const { protect, isAdmin, isAdminOrInstructor } = require('../services/authService');

const router = express.Router();

router.get('/getMe', protect, async (req, res) => {
  try {
    const studentId = req.user._id;
    const results = await getResultsByStudent(studentId);
    res.json(results);  // Now always returns a valid response with at least empty results array
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/all', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const results = await getAllExamResults();
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error fetching all exam results:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/by-exam/:examTitle', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const { examTitle } = req.params;
    const results = await getStudentsByExam(examTitle);
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error fetching students by exam:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/top-performers', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 3;
    const results = await getTopPerformers(limit);
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error fetching top performers:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Monthly comparison endpoint (must be before /:studentId route)
router.get('/monthly-comparison', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const comparison = await getMonthlyComparison();
    res.json({ success: true, data: comparison });
  } catch (err) {
    console.error('Error fetching monthly comparison:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Performance trends endpoint (must be before /:studentId route)
router.get('/performance-trends', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const trends = await getPerformanceTrends();
    res.json({ success: true, data: trends });
  } catch (err) {
    console.error('Error fetching performance trends:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add this new route for getting students by examId (must be before /:studentId route)
router.get('/by-exam-id/:examId', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const { examId } = req.params;
    const results = await getStudentsByExamId(examId);
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error fetching students by exam ID:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


router.post('/create', protect, async (req, res) => {
  try {
    const studentId = req.user._id;
    const examData = req.body;

    const result = await saveExamResult(studentId, examData);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:studentId', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const { studentId } = req.params;
    const results = await getResultsByStudent(studentId);

    if (!results) return res.status(404).json({ message: "No results found." });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/result/:studentId', protect, isAdminOrInstructor, async (req, res) => {
  try {
    const { studentId } = req.params;
    const results = await getResultsByStudent(studentId);

    if (!results) return res.status(404).json({ message: "No results found." });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/:studentId/history/:examTitle', async (req, res) => {
  try {
    const { studentId, examTitle } = req.params;
    const history = await getExamHistory(studentId, examTitle);

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
