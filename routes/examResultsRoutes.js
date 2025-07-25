const express = require('express');
const {
  saveExamResult,
  getResultsByStudent,
  getExamHistory,
  getAllExamResults
} = require('../services/examResltsServise');

const { protect, isAdmin } = require('../services/authService');

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

router.get('/all', protect, isAdmin, async (req, res) => {
  try {
    const results = await getAllExamResults();
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

router.get('/:studentId', protect,isAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const results = await getResultsByStudent(studentId);

    if (!results) return res.status(404).json({ message: "No results found." });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/result/:studentId',protect, isAdmin, async (req, res) => {
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
