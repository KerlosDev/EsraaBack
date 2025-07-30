const {
    getNewStudentsCount,
    calculateTotalRevenue,
    getPendingEnrollments,
    getStudentsAnalytics,
    getStudentSignupsByDay,
    getAllStudentsProgress
} = require('../services/analyticsService');

const express = require('express');
const { protect, isAdmin } = require('../services/authService');
const router = express.Router();

// Protected routes (require authentication)
router.use(protect);

// Dashboard all-in-one endpoint
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const [
            newStudents,
            totalRevenue,
            pendingEnrollments,
            analytics,
            signups,
            progress
        ] = await Promise.all([
            getNewStudentsCount(7),
            calculateTotalRevenue(),
            getPendingEnrollments(),
            getStudentsAnalytics(),
            getStudentSignupsByDay(30),
            getAllStudentsProgress(req, res, true) // pass a flag to return data, not response
        ]);

        // Calculate completion rate from progress data
        let completionRate = 0;
        if (Array.isArray(progress)) {
            completionRate = Math.round(progress.reduce((acc, curr) => acc + (curr.progress || 0), 0) / progress.length);
        }

        res.json({
            success: true,
            data: {
                totalStudents: analytics.totalStudents || 0,
                newStudents: newStudents || 0,
                totalRevenue: totalRevenue || 0,
                pendingEnrollments: pendingEnrollments || 0,
                completionRate: completionRate || 0,
                monthlyActiveUsers: analytics.monthlyActiveUsers || 0,
                highEngagement: analytics.highEngagement || 0,
                averageExamScore: analytics.averageExamScore || 0,
                governmentDistribution: analytics.governmentDistribution || [],
                levelDistribution: analytics.levelDistribution || [],
                signups: signups || [],
            }
        });
    } catch (error) {
        console.error('Error in /analytics/dashboard:', error);
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats', error: error.message });
    }
});

module.exports = router;
