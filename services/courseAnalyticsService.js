const expressAsyncHandler = require("express-async-handler");
const Course = require("../modules/courseModule");
const Enrollment = require("../modules/enrollmentModel");
const StudentExamResult = require("../modules/examResultSchema");
const User = require("../modules/userModule");
 const XLSX = require('xlsx');

// Get comprehensive course analytics
const getCourseAnalytics = async (req, res) => {
    try {
        // Get all courses with enrollment counts
        const courses = await Course.aggregate([
            {
                $lookup: {
                    from: "enrollments",
                    localField: "_id",
                    foreignField: "courseId",
                    as: "enrollments"
                }
            },
            {
                $addFields: {
                    totalEnrollments: { $size: "$enrollments" },
                    paidEnrollments: {
                        $size: {
                            $filter: {
                                input: "$enrollments",
                                cond: { $eq: ["$$this.paymentStatus", "paid"] }
                            }
                        }
                    },
                    pendingEnrollments: {
                        $size: {
                            $filter: {
                                input: "$enrollments",
                                cond: { $eq: ["$$this.paymentStatus", "pending"] }
                            }
                        }
                    },
                    revenue: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$enrollments",
                                        cond: { $eq: ["$$this.paymentStatus", "paid"] }
                                    }
                                },
                                in: "$$this.price"
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    name: 1,
                    description: 1,
                    price: 1,
                    isFree: 1,
                    level: 1,
                    imageUrl: 1,
                    createdAt: 1,
                    totalEnrollments: 1,
                    paidEnrollments: 1,
                    pendingEnrollments: 1,
                    revenue: 1
                }
            },
            { $sort: { totalEnrollments: -1 } }
        ]);

        // Get enrollment trends over time
        const enrollmentTrends = await Enrollment.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: "$enrolledAt" },
                        month: { $month: "$enrolledAt" },
                        day: { $dayOfMonth: "$enrolledAt" }
                    },
                    count: { $sum: 1 },
                    revenue: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paymentStatus", "paid"] },
                                "$price",
                                0
                            ]
                        }
                    }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            },
            {
                $limit: 30 // Last 30 days
            }
        ]);

        // Get top performing courses by completion rate
        // Since we don't have direct course-exam relationships, we'll calculate completion based on enrollments
        const courseCompletion = await Course.aggregate([
            {
                $lookup: {
                    from: "enrollments",
                    localField: "_id",
                    foreignField: "courseId",
                    as: "enrollments"
                }
            },
            {
                $addFields: {
                    enrollmentCount: { $size: "$enrollments" },
                    paidEnrollments: {
                        $size: {
                            $filter: {
                                input: "$enrollments",
                                cond: { $eq: ["$$this.paymentStatus", "paid"] }
                            }
                        }
                    },
                    // Calculate completion rate as percentage of paid enrollments
                    completionRate: {
                        $cond: [
                            { $gt: [{ $size: "$enrollments" }, 0] },
                            {
                                $multiply: [
                                    {
                                        $divide: [
                                            {
                                                $size: {
                                                    $filter: {
                                                        input: "$enrollments",
                                                        cond: { $eq: ["$$this.paymentStatus", "paid"] }
                                                    }
                                                }
                                            },
                                            { $size: "$enrollments" }
                                        ]
                                    },
                                    100
                                ]
                            },
                            0
                        ]
                    }
                }
            },
            {
                $project: {
                    name: 1,
                    enrollmentCount: 1,
                    paidEnrollments: 1,
                    completionRate: 1
                }
            },
            { $sort: { completionRate: -1 } }
        ]);

        // Get student performance analytics
        const studentPerformance = await StudentExamResult.aggregate([
            {
                $unwind: "$results"
            },
            {
                $group: {
                    _id: "$results.examTitle",
                    averageScore: {
                        $avg: {
                            $multiply: [
                                { $divide: ["$results.correctAnswers", "$results.totalQuestions"] },
                                100
                            ]
                        }
                    },
                    totalAttempts: { $sum: 1 },
                    uniqueStudents: { $addToSet: "$studentId" }
                }
            },
            {
                $addFields: {
                    uniqueStudentCount: { $size: "$uniqueStudents" }
                }
            },
            {
                $project: {
                    examTitle: "$_id",
                    averageScore: { $round: ["$averageScore", 2] },
                    totalAttempts: 1,
                    uniqueStudentCount: 1
                }
            },
            { $sort: { averageScore: -1 } }
        ]);

        // Get general statistics
        const totalCourses = await Course.countDocuments();
        const totalEnrollments = await Enrollment.countDocuments();
        const totalRevenue = await Enrollment.aggregate([
            {
                $match: { paymentStatus: "paid" }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$price" }
                }
            }
        ]);

        const totalStudents = await User.countDocuments({ role: "user" });

        res.status(200).json({
            success: true,
            data: {
                overview: {
                    totalCourses,
                    totalEnrollments,
                    totalRevenue: totalRevenue[0]?.total || 0,
                    totalStudents
                },
                courses,
                enrollmentTrends,
                courseCompletion,
                studentPerformance
            }
        });

    } catch (error) {
        console.error("Course Analytics Error:", error);
        res.status(500).json({
            success: false,
            message: "خطأ في جلب تحليل الكورسات",
            error: error.message
        });
    }
};

// Get specific course detailed analytics
const getCourseDetailedAnalytics = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Get course details with enrollments
        const course = await Course.findById(courseId).populate({
            path: 'enrollments',
            populate: {
                path: 'studentId',
                select: 'name email'
            }
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: "الكورس غير موجود"
            });
        }

        // Get enrollments for this course
        const enrollments = await Enrollment.find({ courseId })
            .populate('studentId', 'name email createdAt')
            .sort({ enrolledAt: -1 });

        // Get exam results for this course's exams
        const examResults = await StudentExamResult.aggregate([
            {
                $unwind: "$results"
            },
            {
                $lookup: {
                    from: "users",
                    localField: "studentId",
                    foreignField: "_id",
                    as: "student"
                }
            },
            {
                $unwind: "$student"
            },
            {
                $project: {
                    studentName: "$student.name",
                    studentEmail: "$student.email",
                    examTitle: "$results.examTitle",
                    score: {
                        $multiply: [
                            { $divide: ["$results.correctAnswers", "$results.totalQuestions"] },
                            100
                        ]
                    },
                    correctAnswers: "$results.correctAnswers",
                    totalQuestions: "$results.totalQuestions",
                    examDate: "$results.examDate",
                    attemptNumber: "$results.attemptNumber"
                }
            },
            { $sort: { examDate: -1 } }
        ]);

        // Calculate enrollment trends for this course
        const enrollmentTrends = await Enrollment.aggregate([
            { $match: { courseId: course._id } },
            {
                $group: {
                    _id: {
                        year: { $year: "$enrolledAt" },
                        month: { $month: "$enrolledAt" }
                    },
                    count: { $sum: 1 },
                    revenue: {
                        $sum: {
                            $cond: [
                                { $eq: ["$paymentStatus", "paid"] },
                                "$price",
                                0
                            ]
                        }
                    }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                course,
                enrollments,
                examResults,
                enrollmentTrends,
                statistics: {
                    totalEnrollments: enrollments.length,
                    paidEnrollments: enrollments.filter(e => e.paymentStatus === 'paid').length,
                    pendingEnrollments: enrollments.filter(e => e.paymentStatus === 'pending').length,
                    totalRevenue: enrollments
                        .filter(e => e.paymentStatus === 'paid')
                        .reduce((sum, e) => sum + e.price, 0)
                }
            }
        });

    } catch (error) {
        console.error("Course Detailed Analytics Error:", error);
        res.status(500).json({
            success: false,
            message: "خطأ في جلب تفاصيل تحليل الكورس",
            error: error.message
        });
    }
};

// Get enrollment statistics by date range
const getEnrollmentStatsByDateRange = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let matchStage = {};
        if (startDate && endDate) {
            matchStage.enrolledAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const enrollmentStats = await Enrollment.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: "courses",
                    localField: "courseId",
                    foreignField: "_id",
                    as: "course"
                }
            },
            { $unwind: "$course" },
            {
                $group: {
                    _id: "$course.name",
                    totalEnrollments: { $sum: 1 },
                    paidEnrollments: {
                        $sum: {
                            $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0]
                        }
                    },
                    totalRevenue: {
                        $sum: {
                            $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$price", 0]
                        }
                    }
                }
            },
            { $sort: { totalEnrollments: -1 } }
        ]);

        res.status(200).json({
            success: true,
            data: enrollmentStats
        });

    } catch (error) {
        console.error("Enrollment Stats Error:", error);
        res.status(500).json({
            success: false,
            message: "خطأ في جلب احصائيات التسجيل",
            error: error.message
        });
    }
};

// Get course content analytics (chapters and views)
const getCourseContentAnalytics = async (req, res) => {
    try {
        const { timeRange } = req.query;

        // Build date filter based on time range
        let dateFilter = {};
        if (timeRange && timeRange !== 'all') {
            const now = new Date();
            switch (timeRange) {
                case 'week':
                    dateFilter.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
                    break;
                case 'month':
                    dateFilter.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
                    break;
                case 'year':
                    dateFilter.createdAt = { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
                    break;
            }
        }

        // Get all courses with their chapters populated
        const courses = await Course.find({})
            .populate('chapters')
            .select('name description chapters createdAt publishStatus')
            .lean();

        // Use WatchHistory model only
        const WatchHistory = require('../modules/WatchHistory');

        const watchHistoryData = await WatchHistory.find({})
            .populate('studentId', 'name email')
            .populate('courseId', 'name')
            .populate('chapterId', 'title')
            .lean();

        // Transform courses data to include only WatchHistory analytics
        const courseContentData = [];

        for (const course of courses) {
            const courseWatchHistory = watchHistoryData.filter(wh =>
                wh.studentId && wh.courseId && wh.chapterId &&
                wh.courseId._id.toString() === course._id.toString()
            );

            const chaptersData = [];

            for (const chapter of course.chapters) {
                const chapterWatchHistory = courseWatchHistory.filter(wh =>
                    wh.chapterId._id.toString() === chapter._id.toString()
                );

                const lessonsData = (chapter.lessons || []).map(lesson => {
                    const lessonWatchHistory = chapterWatchHistory.filter(wh =>
                        wh.lessonId.toString() === lesson._id.toString()
                    );

                    return {
                        lessonId: lesson._id,
                        lessonTitle: lesson.title || wh.lessonTitle,
                        type: lesson.videoUrl ? 'video' : 'document',
                        isFree: lesson.isFree || false,
                        viewersCount: lessonWatchHistory.length, // Just return the count
                        totalWatchCount: lessonWatchHistory.reduce((sum, wh) => sum + (wh.watchedCount || 1), 0)
                    };
                });

                chaptersData.push({
                    chapterId: chapter._id,
                    name: chapter.title,
                    lessons: lessonsData,
                    lessonsCount: chapter.lessons.length
                });
            }

            courseContentData.push({
                courseId: course._id,
                courseName: course.name,
                chapters: chaptersData,
                chaptersCount: course.chapters.length,
                totalLessons: course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0),
                createdAt: course.createdAt
            });
        }

        // Sort by course name for consistency
        courseContentData.sort((a, b) => a.courseName.localeCompare(b.courseName));

        res.status(200).json({
            success: true,
            data: courseContentData
        });

    } catch (error) {
        console.error("Course Content Analytics Error:", error);
        res.status(500).json({
            success: false,
            message: "خطأ في جلب تحليل محتوى الكورسات",
            error: error.message
        });
    }
};

// Get specific course details for modal
const getCourseDetails = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Get course details
        const course = await Course.findById(courseId).lean();

        if (!course) {
            return res.status(404).json({
                success: false,
                message: "الكورس غير موجود"
            });
        }

        // Get enrollments for this course
        const enrollments = await Enrollment.find({ courseId })
            .populate('studentId', 'name email createdAt')
            .sort({ enrolledAt: -1 })
            .limit(20)
            .lean();

        // Calculate statistics
        const totalEnrollments = enrollments.length;
        const paidEnrollments = enrollments.filter(e => e.paymentStatus === 'paid').length;
        const totalRevenue = enrollments
            .filter(e => e.paymentStatus === 'paid')
            .reduce((sum, e) => sum + (e.price || course.price || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                course,
                statistics: {
                    totalEnrollments,
                    paidEnrollments,
                    totalRevenue
                },
                enrollments: enrollments.slice(0, 10) // Limit for modal display
            }
        });

    } catch (error) {
        console.error("Course Details Error:", error);
        res.status(500).json({
            success: false,
            message: "خطأ في جلب تفاصيل الكورس",
            error: error.message
        });
    }
};

// Get course watch history details for frontend
const getCourseWatchHistoryDetails = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Get WatchHistory data for this course
        const WatchHistory = require('../modules/WatchHistory');

        const watchHistoryData = await WatchHistory.find({ courseId })
            .populate('studentId', 'name email')
            .populate('courseId', 'name')
            .populate('chapterId', 'title')
            .lean();

        // Get course details
        const course = await Course.findById(courseId)
            .populate('chapters')
            .lean();

        if (!course) {
            return res.status(404).json({
                success: false,
                message: "الكورس غير موجود"
            });
        }

        // Transform data to match frontend expectations
        const transformedCourse = {
            _id: course._id,
            name: course.name,
            chaptersCount: course.chapters.length,
            totalLessons: course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0),
            chapters: course.chapters.map(chapter => {
                const chapterWatchData = watchHistoryData.filter(wh =>
                    wh.chapterId && wh.chapterId._id.toString() === chapter._id.toString()
                );

                return {
                    chapterId: chapter._id,
                    chapterTitle: chapter.title,
                    lessonsCount: chapter.lessons.length,
                    lessons: chapter.lessons.map(lesson => {
                        const lessonWatchData = chapterWatchData.filter(wh =>
                            wh.lessonId.toString() === lesson._id.toString()
                        );

                        return {
                            lessonId: lesson._id,
                            lessonTitle: lesson.title,
                            isFree: lesson.isFree || false,
                            watchedCount: lessonWatchData.reduce((sum, wh) => sum + wh.watchedCount, 0),
                            viewersCount: lessonWatchData.length, // Just return the count
                            lastWatchedAt: lessonWatchData.length > 0
                                ? Math.max(...lessonWatchData.map(wh => new Date(wh.lastWatchedAt).getTime()))
                                : null
                        };
                    })
                };
            })
        };

        res.status(200).json({
            success: true,
            data: {
                course: transformedCourse
            }
        });

    } catch (error) {
        console.error("Course Watch History Details Error:", error);
        res.status(500).json({
            success: false,
            message: "خطأ في جلب تفاصيل مشاهدة الكورس",
            error: error.message
        });
    }
};

// Export analytics report
const exportAnalyticsReport = async (req, res) => {
    try {
        const { timeRange } = req.query;

        // Get comprehensive analytics data
        const analyticsData = await getCourseAnalyticsData(timeRange);

        // Create Excel workbook
        const workbook = XLSX.utils.book_new();

        // Overview Sheet
        const overviewData = [
            ['Metric', 'Value'],
            ['Total Courses', analyticsData.overview.totalCourses],
            ['Total Students', analyticsData.overview.totalStudents],
            ['Total Enrollments', analyticsData.overview.totalEnrollments],
            ['Total Revenue', analyticsData.overview.totalRevenue + ' EGP'],
            ['Export Date', new Date().toLocaleDateString('ar-EG')],
            ['Time Range', timeRange || 'All Time']
        ];
        const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
        XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

        // Courses Performance Sheet
        const coursesData = [
            ['Course Name', 'Total Enrollments', 'Paid Enrollments', 'Revenue (EGP)', 'Conversion Rate']
        ];
        analyticsData.courses.forEach(course => {
            const conversionRate = course.totalEnrollments > 0
                ? ((course.paidEnrollments / course.totalEnrollments) * 100).toFixed(2) + '%'
                : '0%';
            coursesData.push([
                course.name,
                course.totalEnrollments,
                course.paidEnrollments,
                course.revenue,
                conversionRate
            ]);
        });
        const coursesSheet = XLSX.utils.aoa_to_sheet(coursesData);
        XLSX.utils.book_append_sheet(workbook, coursesSheet, 'Courses Performance');

        // Enrollment Trends Sheet
        if (analyticsData.enrollmentTrends && analyticsData.enrollmentTrends.length > 0) {
            const trendsData = [
                ['Date', 'Enrollments', 'Revenue (EGP)']
            ];
            analyticsData.enrollmentTrends.forEach(trend => {
                const date = `${trend._id.day}/${trend._id.month}/${trend._id.year || new Date().getFullYear()}`;
                trendsData.push([
                    date,
                    trend.count,
                    trend.revenue || 0
                ]);
            });
            const trendsSheet = XLSX.utils.aoa_to_sheet(trendsData);
            XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Enrollment Trends');
        }

        // Student Performance Sheet
        if (analyticsData.studentPerformance && analyticsData.studentPerformance.length > 0) {
            const performanceData = [
                ['Exam Title', 'Average Score', 'Total Attempts', 'Success Rate']
            ];
            analyticsData.studentPerformance.forEach(perf => {
                performanceData.push([
                    perf.examTitle,
                    perf.averageScore.toFixed(2),
                    perf.totalAttempts,
                    (perf.successRate || 0).toFixed(2) + '%'
                ]);
            });
            const performanceSheet = XLSX.utils.aoa_to_sheet(performanceData);
            XLSX.utils.book_append_sheet(workbook, performanceSheet, 'Student Performance');
        }

        // Generate Excel buffer
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set headers for Excel file download
        const fileName = `course-analytics-${timeRange || 'all'}-${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', excelBuffer.length);

        // Send the Excel file
        res.send(excelBuffer);

    } catch (error) {
        console.error("Export Analytics Report Error:", error);
        res.status(500).json({
            success: false,
            message: "خطأ في تصدير التقرير",
            error: error.message
        });
    }
};

// Helper function to get analytics data (reusable)
const getCourseAnalyticsData = async (timeRange) => {
    // This is a helper function to get data similar to getCourseAnalytics
    // but returns the data instead of sending response

    const courses = await Course.aggregate([
        {
            $lookup: {
                from: "enrollments",
                localField: "_id",
                foreignField: "courseId",
                as: "enrollments"
            }
        },
        {
            $addFields: {
                totalEnrollments: { $size: "$enrollments" },
                paidEnrollments: {
                    $size: {
                        $filter: {
                            input: "$enrollments",
                            cond: { $eq: ["$$this.paymentStatus", "paid"] }
                        }
                    }
                },
                revenue: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$enrollments",
                                    cond: { $eq: ["$$this.paymentStatus", "paid"] }
                                }
                            },
                            in: "$$this.price"
                        }
                    }
                }
            }
        }
    ]);

    const enrollmentTrends = await Enrollment.aggregate([
        {
            $group: {
                _id: {
                    year: { $year: "$enrolledAt" },
                    month: { $month: "$enrolledAt" },
                    day: { $dayOfMonth: "$enrolledAt" }
                },
                count: { $sum: 1 },
                revenue: {
                    $sum: {
                        $cond: [
                            { $eq: ["$paymentStatus", "paid"] },
                            "$price",
                            0
                        ]
                    }
                }
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
        { $limit: 30 }
    ]);

    const studentPerformance = await StudentExamResult.aggregate([
        { $unwind: "$results" },
        {
            $group: {
                _id: "$results.examTitle",
                averageScore: {
                    $avg: {
                        $multiply: [
                            { $divide: ["$results.correctAnswers", "$results.totalQuestions"] },
                            100
                        ]
                    }
                },
                totalAttempts: { $sum: 1 },
                uniqueStudents: { $addToSet: "$studentId" }
            }
        },
        {
            $addFields: {
                uniqueStudentCount: { $size: "$uniqueStudents" }
            }
        }
    ]);

    const totalCourses = await Course.countDocuments();
    const totalEnrollments = await Enrollment.countDocuments();
    const totalRevenue = await Enrollment.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$price" } } }
    ]);
    const totalStudents = await User.countDocuments({ role: "student" });

    return {
        overview: {
            totalCourses,
            totalEnrollments,
            totalRevenue: totalRevenue[0]?.total || 0,
            totalStudents
        },
        courses,
        enrollmentTrends,
        studentPerformance
    };
};

module.exports = {
    getCourseAnalytics: expressAsyncHandler(getCourseAnalytics),
    getCourseDetailedAnalytics: expressAsyncHandler(getCourseDetailedAnalytics),
    getEnrollmentStatsByDateRange: expressAsyncHandler(getEnrollmentStatsByDateRange),
    getCourseContentAnalytics: expressAsyncHandler(getCourseContentAnalytics),
    getCourseDetails: expressAsyncHandler(getCourseDetails),
    getCourseWatchHistoryDetails: expressAsyncHandler(getCourseWatchHistoryDetails),
    exportAnalyticsReport: expressAsyncHandler(exportAnalyticsReport)
};
