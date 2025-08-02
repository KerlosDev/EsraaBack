const express = require('express');
const { protect, isAdmin } = require('../services/authService');
const {
    getStudentProgress,
    getAllStudentsProgress,
    getNewStudentsCount,
    calculateTotalRevenue,
    getPendingEnrollments,
    getStudentsAnalytics,
    getStudentSignupsByDay,
    getViewsStatistics,
    getDailyViewsStatistics
} = require('../services/analyticsService');
const User = require('../modules/userModule');

const router = express.Router();

// Protected routes (require authentication)
router.use(protect);

// Get progress for the current logged-in student
router.get('/progress', getStudentProgress);

// Get progress for a specific student (admin only)
router.get('/progress/:studentId', isAdmin, getStudentProgress);

// Get progress for all students (admin only)
router.get('/all', isAdmin, getAllStudentsProgress);

// Dashboard statistics routes (admin only)
router.get('/new-students', isAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const count = await getNewStudentsCount(days);
        res.json({ success: true, data: count });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/student-signups', isAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const signups = await getStudentSignupsByDay(days);
        res.json({ success: true, data: signups });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/revenue', isAdmin, async (req, res) => {
    try {
        const revenue = await calculateTotalRevenue();
        res.json({ success: true, data: revenue });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/pending-enrollments', isAdmin, async (req, res) => {
    try {
        const count = await getPendingEnrollments();
        res.json({ success: true, data: count });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get students analytics
router.get('/students', isAdmin, async (req, res) => {
    try {
        const analytics = await getStudentsAnalytics();
        res.json({ success: true, data: analytics });
    } catch (error) {
        console.error('Error in /analytics/students:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching student analytics',
            error: error.message
        });
    }
});

// Get views statistics (total, last 24h, week, month) - Admin only
router.get('/views-statistics', isAdmin, getViewsStatistics);

module.exports = router;