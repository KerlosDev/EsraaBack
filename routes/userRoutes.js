const express = require('express');
const { validationResult } = require('express-validator');
const { protect, isAdmin } = require('../services/authService');
const {
    getUserByIdService,
    updateUserbyId,
    getAllStudents,
    toggleBanStatus,
    updateLastActive,
    getUserAllDataById
} = require('../services/userServise');
const WatchHistory = require('../modules/WatchHistory');
const Enrollment = require('../modules/enrollmentModel');
const User = require('../modules/userModule');

const router = express.Router();

// Protected routes (require authentication)
router.use(protect);

// Admin route to get all students' status
router.get('/all-students-status', isAdmin, async (req, res) => {
    try {
        // Extract pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || 'views'; // 'views', 'recent', 'inactive'
        const search = req.query.search || '';

        const skip = (page - 1) * limit;

        // Build search query - exclude admin users
        let searchQuery = { role: { $ne: 'admin' } };
        if (search) {
            searchQuery = {
                role: { $ne: 'admin' },
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Get total count for pagination
        const totalStudents = await User.countDocuments(searchQuery);

        // Get students with pagination
        const students = await User.find(searchQuery)
            .select('name phoneNumber parentPhoneNumber email lastActive')
            .lean()
            .skip(skip)
            .limit(limit);

        if (!students || students.length === 0) {
            return res.json({
                success: true,
                count: 0,
                totalPages: 0,
                currentPage: page,
                totalStudents: totalStudents,
                data: []
            });
        }

        const Package = require("../modules/packageModel");
        const studentsStatus = await Promise.all(students.map(async (student) => {
            // Get all enrollments (courses and packages)
            const enrollments = await Enrollment.find({
                studentId: student._id,
            })
                .populate({
                    path: 'courseId',
                    populate: {
                        path: 'chapters',
                        model: 'Chapter',
                        populate: {
                            path: 'lessons',
                            model: 'Lesson'
                        }
                    }
                })
                .populate({
                    path: 'packageId',
                    populate: {
                        path: 'courses',
                        model: 'Course',
                        populate: {
                            path: 'chapters',
                            model: 'Chapter',
                            populate: {
                                path: 'lessons',
                                model: 'Lesson'
                            }
                        }
                    }
                }) || [];

            // Check watch history
            const watchHistory = await WatchHistory.find({ studentId: student._id }) || [];

            // Separate direct course enrollments and package enrollments
            const directCourseEnrollments = enrollments.filter(e => e.courseId && !e.isPackage);
            const packageEnrollments = enrollments.filter(e => e.packageId && e.isPackage);

            // Get enrolled courses from direct enrollments
            const directCourses = await Promise.all(directCourseEnrollments.map(async enrollment => {
                const course = enrollment.courseId;
                if (!course) {
                    return {
                        courseName: 'Unknown Course',
                        enrollmentDate: enrollment.createdAt,
                        paymentStatus: enrollment.paymentStatus,
                        chapters: []
                    };
                }
                const chapters = (course.chapters || []).map(chapter => ({
                    chapterTitle: chapter.title,
                    chapterDescription: chapter.description,
                    lessons: (chapter.lessons || []).map(lesson => ({
                        lessonTitle: lesson.title,
                        lessonDescription: lesson.description,
                        isWatched: watchHistory.some(wh => wh.lessonId.toString() === lesson._id.toString()),
                        watchCount: watchHistory.filter(wh => wh.lessonId.toString() === lesson._id.toString()).length
                    }))
                }));
                return {
                    courseName: course.name,
                    enrollmentDate: enrollment.createdAt,
                    paymentStatus: enrollment.paymentStatus,
                    chapters: chapters
                };
            }));

            // Get enrolled courses from package enrollments
            const packageCourses = [];
            for (const pkgEnrollment of packageEnrollments) {
                const pkg = pkgEnrollment.packageId;
                if (pkg && Array.isArray(pkg.courses)) {
                    for (const course of pkg.courses) {
                        const chapters = (course.chapters || []).map(chapter => ({
                            chapterTitle: chapter.title,
                            chapterDescription: chapter.description,
                            lessons: (chapter.lessons || []).map(lesson => ({
                                lessonTitle: lesson.title,
                                lessonDescription: lesson.description,
                                isWatched: watchHistory.some(wh => wh.lessonId.toString() === lesson._id.toString()),
                                watchCount: watchHistory.filter(wh => wh.lessonId.toString() === lesson._id.toString()).length
                            }))
                        }));
                        packageCourses.push({
                            courseName: course.name,
                            enrollmentDate: pkgEnrollment.createdAt,
                            paymentStatus: pkgEnrollment.paymentStatus,
                            chapters: chapters,
                            fromPackage: true,
                            packageName: pkg.name || undefined
                        });
                    }
                }
            }

            // Combine all enrolled courses (direct + from packages)
            const enrolledCourses = [...directCourses, ...packageCourses];

            // Determine status based on both enrollment and watch history
            let status = 'not enrolled';
            if (enrollments && enrollments.length > 0) {
                const hasPaidEnrollments = enrollments.some(e => e.paymentStatus === 'paid');
                if (hasPaidEnrollments) {
                    status = watchHistory && watchHistory.length > 0 ? 'active' : 'inactive';
                }
            }

            return {
                studentInfo: {
                    id: student._id,
                    name: student.name,
                    lastActivity: student.lastActive || student.createdAt,
                    email: student.email,
                    phoneNumber: student.phoneNumber || 'Not provided',
                    parentPhoneNumber: student.parentPhoneNumber || 'Not provided'
                },
                enrollmentStatus: {
                    isEnrolled: enrolledCourses.length > 0,
                    enrolledCourses: enrolledCourses,
                    totalEnrollments: enrolledCourses.length
                },
                activityStatus: {
                    status: status,
                    lastActivity: watchHistory.length > 0 ?
                        watchHistory.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)[0].lastWatchedAt :
                        null,
                    totalWatchedLessons: watchHistory.length
                }
            };
        }));

        // Sort students based on sortBy parameter
        let sortedStudentsStatus = [...studentsStatus];
        switch (sortBy) {
            case 'views':
                sortedStudentsStatus.sort((a, b) =>
                    b.activityStatus.totalWatchedLessons - a.activityStatus.totalWatchedLessons
                );
                break;
            case 'recent':
                sortedStudentsStatus.sort((a, b) => {
                    const dateA = new Date(a.activityStatus.lastActivity || 0);
                    const dateB = new Date(b.activityStatus.lastActivity || 0);
                    return dateB - dateA;
                });
                break;
            case 'inactive':
                sortedStudentsStatus.sort((a, b) => {
                    // Priority: never_active > inactive > active
                    const statusPriority = {
                        'not enrolled': 3,
                        'inactive': 2,
                        'active': 1
                    };
                    const priorityA = statusPriority[a.activityStatus.status] || 0;
                    const priorityB = statusPriority[b.activityStatus.status] || 0;

                    if (priorityA === priorityB) {
                        const dateA = new Date(a.activityStatus.lastActivity || 0);
                        const dateB = new Date(b.activityStatus.lastActivity || 0);
                        return dateB - dateA;
                    }
                    return priorityB - priorityA;
                });
                break;
        }

        return res.json({
            success: true,
            count: sortedStudentsStatus.length,
            totalPages: Math.ceil(totalStudents / limit),
            currentPage: page,
            totalStudents: totalStudents,
            hasNextPage: page < Math.ceil(totalStudents / limit),
            hasPreviousPage: page > 1,
            data: sortedStudentsStatus
        });

    } catch (error) {
        console.error('Error in all-students-status:', error);
        res.status(500).json({
            success: false,
            message: "Error fetching students status",
            error: error.message
        });
    }
});


// Regular user routes
router.get('/', getUserByIdService);
router.put('/update', updateUserbyId);
router.put('/last-active', updateLastActive);

// Admin only routes
router.use('/students', isAdmin);
router.get('/students', getAllStudents);
router.put('/students/:studentId/ban', toggleBanStatus);

// Get all data for user by ID (admin only)
router.get('/:id/all-data', isAdmin, getUserAllDataById);

module.exports = router;
