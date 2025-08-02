const WatchHistory = require('../modules/WatchHistory');
const StudentExamResult = require('../modules/examResultSchema');
const User = require('../modules/userModule');
const Course = require('../modules/courseModule');
const Chapter = require('../modules/chapterModel');
const Enrollment = require('../modules/enrollmentModel'); // Assuming this is the correct path for Enrollment

exports.getStudentProgress = async (req, res) => {
    try {
        const studentId = req.params.studentId || req.user._id;

        // Fetch watch history with populated references
        const watchHistory = await WatchHistory.find({ studentId })
            .populate({
                path: 'courseId',
                select: 'name description imageUrl level'
            })
            .populate({
                path: 'chapterId',
                select: 'title lessons'
            })
            .sort({ lastWatchedAt: -1 });

        // Fetch exam results
        const examResults = await StudentExamResult.findOne({ studentId })
            .populate('studentId', 'name email');

        // Group lessons by chapter
        const groupedLessons = {};
        watchHistory.forEach(entry => {
            if (!entry.chapterId) return;

            const chapterId = entry.chapterId._id;
            if (!groupedLessons[chapterId]) {
                groupedLessons[chapterId] = {
                    chapterInfo: entry.chapterId,
                    courseInfo: entry.courseId,
                    lessons: []
                };
            }

            // Check if lesson already exists
            const existingLesson = groupedLessons[chapterId].lessons.find(
                l => l.lessonId.toString() === entry.lessonId.toString()
            );

            if (!existingLesson) {
                groupedLessons[chapterId].lessons.push({
                    lessonId: entry.lessonId,
                    lessonTitle: entry.lessonTitle,
                    watchedCount: entry.watchedCount,
                    lastWatchedAt: entry.lastWatchedAt
                });
            }
        });

        // Calculate statistics
        const stats = {
            totalViews: watchHistory.reduce((sum, entry) => sum + entry.watchedCount, 0),
            uniqueLessons: new Set(watchHistory.map(entry => entry.lessonId)).size,
            lastActivity: watchHistory[0]?.lastWatchedAt || null,
            examStats: examResults ? {
                totalExams: examResults.results.length,
                averageScore: examResults.results.reduce((sum, exam) =>
                    sum + (exam.correctAnswers / exam.totalQuestions), 0) / examResults.results.length || 0,
                lastExamDate: examResults.results[examResults.results.length - 1]?.examDate
            } : null
        };

        res.status(200).json({
            success: true,
            data: {
                watchHistory,
                groupedLessons,
                examResults: examResults?.results || [],
                stats
            }
        });

    } catch (error) {
        console.error('Error fetching student progress:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب تقدم الطالب'
        });
    }
};

exports.getAllStudentsProgress = async (req, res, returnData = false) => {
    try {
        // Get all students who have watch history
        const studentsWithHistory = await WatchHistory.distinct('studentId');

        const studentsProgress = await Promise.all(studentsWithHistory.map(async (studentId) => {
            const student = await User.findById(studentId).select('name email lastActive');
            const watchHistory = await WatchHistory.find({ studentId })
                .populate('courseId', 'name')
                .populate('chapterId', 'title');
            const examResults = await StudentExamResult.findOne({ studentId });

            // Optionally, you can add a progress field here for completionRate calculation
            // For now, let's add a dummy progress value (e.g., 100 for demo)
            return {
                student,
                stats: {
                    totalViews: watchHistory.reduce((sum, entry) => sum + entry.watchedCount, 0),
                    uniqueLessons: new Set(watchHistory.map(entry => entry.lessonId)).size,
                    lastActivity: student.lastActive,
                    examsTaken: examResults?.results.length || 0,
                    averageScore: examResults ?
                        examResults.results.reduce((sum, exam) =>
                            sum + (exam.correctAnswers / exam.totalQuestions), 0) / examResults.results.length : 0
                },
                progress: 100 // TODO: Replace with real progress calculation if available
            };
        }));

        if (returnData) {
            return studentsProgress;
        } else {
            res.status(200).json({
                success: true,
                data: studentsProgress
            });
        }
    } catch (error) {
        console.error('Error fetching all students progress:', error);
        if (returnData) {
            return [];
        } else {
            res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء جلب تقدم الطلاب'
            });
        }
    }
};

exports.getNewStudentsCount = async (days = 7) => {
    const date = new Date();
    date.setDate(date.getDate() - days);

    const newStudents = await User.countDocuments({
        role: 'user',
        createdAt: { $gte: date }
    });

    return newStudents;
};

exports.getStudentSignupsByDay = async (days = 30) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const signups = await User.aggregate([
        {
            $match: {
                role: 'user',
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                },
                count: { $sum: 1 }
            }
        },
        {
            $sort: { "_id": 1 }
        }
    ]);

    return signups;
};

exports.calculateTotalRevenue = async () => {
    const totalRevenue = await Enrollment.aggregate([
        {
            $match: { paymentStatus: 'paid' }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$price' }
            }
        }
    ]);

    return totalRevenue[0]?.total || 0;
};

exports.getPendingEnrollments = async () => {
    return await Enrollment.countDocuments({ paymentStatus: 'pending' });
};

exports.getStudentsAnalytics = async () => {
    try {
        const oneWeekAgo = new Date();
        const oneMonthAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

        // Get total counts
        const totalStudents = await User.countDocuments({ role: 'user' });
        const bannedStudents = await User.countDocuments({ role: 'user', isBanned: true });
        const activeStudents = await User.countDocuments({ role: 'user', isBanned: false });
        const lastWeekActive = await User.countDocuments({
            role: 'user',
            lastActive: { $gte: oneWeekAgo }
        });

        // Get monthly active users
        const monthlyActiveUsers = await User.countDocuments({
            role: 'user',
            lastActive: { $gte: oneMonthAgo }
        });

        // Get student engagement metrics
        const highEngagementUsers = await WatchHistory.aggregate([
            {
                $group: {
                    _id: '$studentId',
                    totalWatched: { $sum: '$watchedCount' }
                }
            },
            { $match: { totalWatched: { $gt: 10 } } },
            { $count: 'count' }
        ]);

        // Get average exam scores
        const examScores = await StudentExamResult.aggregate([
            { $unwind: '$results' },
            {
                $group: {
                    _id: null,
                    averageScore: {
                        $avg: {
                            $multiply: [
                                { $divide: ['$results.correctAnswers', '$results.totalQuestions'] },
                                100
                            ]
                        }
                    }
                }
            }
        ]);

        // Get government distribution
        const governmentDistribution = await User.aggregate([
            { $match: { role: 'user' } },
            { $group: { _id: '$government', value: { $sum: 1 } } },
            { $project: { id: '$_id', value: 1, _id: 0 } },
            { $sort: { value: -1 } }
        ]);

        // Get level distribution
        const levelDistribution = await User.aggregate([
            { $match: { role: 'user' } },
            { $group: { _id: '$level', value: { $sum: 1 } } },
            { $project: { id: '$_id', value: 1, _id: 0 } },
            { $sort: { value: -1 } }
        ]);

        return {
            totalStudents,
            activeStudents,
            bannedStudents,
            lastWeekActive,
            monthlyActiveUsers,
            highEngagement: highEngagementUsers[0]?.count || 0,
            averageExamScore: Math.round(examScores[0]?.averageScore || 0),
            governmentDistribution,
            levelDistribution
        };
    } catch (error) {
        console.error('Error getting students analytics:', error);
        throw error;
    }
};

exports.getViewsStatistics = async (req, res) => {
    try {
        // Get current date
        const now = new Date();

        // Calculate dates for different time periods
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get most active student (with highest total views)
        const mostActiveStudentData = await WatchHistory.aggregate([
            {
                $group: {
                    _id: "$studentId",
                    totalViews: { $sum: "$watchedCount" },
                }
            },
            {
                $sort: { totalViews: -1 }
            },
            {
                $limit: 1
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'studentInfo'
                }
            },
            {
                $project: {
                    _id: 1,
                    totalViews: 1,
                    studentEmail: { $arrayElemAt: ["$studentInfo.email", 0] },
                    studentName: { $arrayElemAt: ["$studentInfo.name", 0] }
                }
            }
        ]);

        // Get most viewed lesson
        const mostViewedLessonData = await WatchHistory.aggregate([
            {
                $group: {
                    _id: {
                        lessonId: "$lessonId",
                        lessonTitle: "$lessonTitle"
                    },
                    totalViews: { $sum: "$watchedCount" },
                    courseId: { $first: "$courseId" },
                    chapterId: { $first: "$chapterId" }
                }
            },
            {
                $sort: { totalViews: -1 }
            },
            {
                $limit: 1
            },
            {
                $lookup: {
                    from: 'courses',
                    localField: 'courseId',
                    foreignField: '_id',
                    as: 'courseInfo'
                }
            },
            {
                $lookup: {
                    from: 'chapters',
                    localField: 'chapterId',
                    foreignField: '_id',
                    as: 'chapterInfo'
                }
            },
            {
                $project: {
                    _id: 0,
                    lessonId: "$_id.lessonId",
                    lessonTitle: "$_id.lessonTitle",
                    totalViews: 1,
                    courseName: { $arrayElemAt: ["$courseInfo.name", 0] },
                    chapterTitle: { $arrayElemAt: ["$chapterInfo.title", 0] }
                }
            }
        ]);

        // Aggregate total views
        const totalViews = await WatchHistory.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: "$watchedCount" }
                }
            }
        ]);

        // Aggregate views in last 24 hours
        const last24HoursViews = await WatchHistory.aggregate([
            {
                $match: {
                    lastWatchedAt: { $gte: last24Hours }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$watchedCount" }
                }
            }
        ]);

        // Aggregate views in last week
        const lastWeekViews = await WatchHistory.aggregate([
            {
                $match: {
                    lastWatchedAt: { $gte: lastWeek }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$watchedCount" }
                }
            }
        ]);

        // Aggregate views in last month
        const lastMonthViews = await WatchHistory.aggregate([
            {
                $match: {
                    lastWatchedAt: { $gte: lastMonth }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$watchedCount" }
                }
            }
        ]);

        // Extract values with default 0 if no data
        const totalViewsCount = totalViews.length > 0 ? totalViews[0].total : 0;
        const last24HoursViewsCount = last24HoursViews.length > 0 ? last24HoursViews[0].total : 0;
        const lastWeekViewsCount = lastWeekViews.length > 0 ? lastWeekViews[0].total : 0;
        const lastMonthViewsCount = lastMonthViews.length > 0 ? lastMonthViews[0].total : 0;

        // Extract information from most active student and most viewed lesson
        const mostActiveStudent = mostActiveStudentData.length > 0
            ? {
                id: mostActiveStudentData[0]._id,
                name: mostActiveStudentData[0].studentName,
                email: mostActiveStudentData[0].studentEmail,
                totalViews: mostActiveStudentData[0].totalViews
            }
            : null;

        const mostViewedLesson = mostViewedLessonData.length > 0
            ? {
                lessonId: mostViewedLessonData[0].lessonId,
                lessonTitle: mostViewedLessonData[0].lessonTitle,
                courseName: mostViewedLessonData[0].courseName,
                chapterTitle: mostViewedLessonData[0].chapterTitle,
                totalViews: mostViewedLessonData[0].totalViews
            }
            : null;

        // Return aggregated data
        res.status(200).json({
            success: true,
            data: {
                totalViews: totalViewsCount,
                last24Hours: last24HoursViewsCount,
                lastWeek: lastWeekViewsCount,
                lastMonth: lastMonthViewsCount,
                mostActiveStudent: mostActiveStudent,
                mostViewedLesson: mostViewedLesson
            }
        });
    } catch (error) {
        console.error('Error getting views statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching views statistics'
        });
    }
};