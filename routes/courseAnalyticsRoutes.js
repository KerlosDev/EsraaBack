const express = require("express");
const router = express.Router();
const {
    getCourseAnalytics,
    getCourseDetailedAnalytics,
    getEnrollmentStatsByDateRange,
    getCourseContentAnalytics,
    getCourseDetails,
    getCourseWatchHistoryDetails,
    exportAnalyticsReport
} = require("../services/courseAnalyticsService");
const { isAdmin, protect } = require("../services/authService");

// Get comprehensive course analytics (Admin only)
router.get("/analytics", protect, isAdmin, getCourseAnalytics);

// Get detailed analytics for a specific course (Admin only)
router.get("/analytics/:courseId", protect, isAdmin, getCourseDetailedAnalytics);

// Get course details for modal (Admin only)
router.get("/course-details/:courseId", protect, isAdmin, getCourseDetails);

// Get course watch history details (Admin only)
router.get("/watch-history/:courseId", protect, isAdmin, getCourseWatchHistoryDetails);

// Get enrollment statistics by date range (Admin only)
router.get("/enrollment-stats", protect, isAdmin, getEnrollmentStatsByDateRange);

// Get course content analytics with real data (Admin only)
router.get("/content-analytics", protect, isAdmin, getCourseContentAnalytics);

// Export analytics report (Admin only)
router.get("/export", protect, isAdmin, exportAnalyticsReport);

module.exports = router;
