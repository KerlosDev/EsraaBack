const enrollmentModel = require("../modules/enrollmentModel");
const User = require("../modules/userModule");
const expressAsyncHandler = require("express-async-handler");
const WatchHistory = require("../modules/WatchHistory");
const bcrypt = require("bcryptjs");
const Enrollment = require("../modules/enrollmentModel");

const getUserByIdService = async (req, res) => {
    const studentId = req.user._id.toHexString();

    const user = await User.findById(studentId);
    if (!user) {
        throw new Error("المستخدم غير موجود.");
    }
    res.status(200).json(user);
};

// Get all students with pagination and search
const getAllStudents = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const filterStatus = req.query.filterStatus || 'all';

        // Create search query
        let searchQuery = {};

        // Add search conditions
        if (search) {
            searchQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } },
                { government: { $regex: search, $options: 'i' } },
                { level: { $regex: search, $options: 'i' } }
            ];
        }

        // Add filter conditions
        if (filterStatus === 'banned') {
            searchQuery.isBanned = true;
        } else if (filterStatus === 'active') {
            searchQuery.isBanned = { $ne: true };
        }

        // Get total count for pagination
        const total = await User.countDocuments(searchQuery);

        // Get students with pagination
        const students = await User.find(searchQuery)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        // Add device information to each student
        const studentsWithDevices = students.map(student => {
            const studentObj = student.toObject();

            // Parse device info if it exists
            let deviceInfo = null;
            if (studentObj.currentDeviceInfo) {
                try {
                    deviceInfo = JSON.parse(studentObj.currentDeviceInfo);
                } catch (e) {
                    deviceInfo = { userAgent: studentObj.currentDeviceInfo };
                }
            }

            return {
                ...studentObj,
                deviceInfo: deviceInfo,
                hasActiveSession: !!(studentObj.currentSessionToken && studentObj.sessionCreatedAt)
            };
        });

        res.status(200).json({
            status: 'success',
            results: studentsWithDevices.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            data: studentsWithDevices
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'خطأ في استرجاع بيانات الطلاب'
        });
    }
};

// Toggle ban status
const toggleBanStatus = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { banReason } = req.body;

        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({
                status: 'error',
                message: 'الطالب غير موجود'
            });
        }

        student.isBanned = !student.isBanned;
        student.banReason = student.isBanned ? banReason : null;
        student.status = student.isBanned ? 'inactive' : 'active';

        await student.save();

        res.status(200).json({
            status: 'success',
            data: student
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'خطأ في تحديث حالة الحظر'
        });
    }
};

const updateUserbyId = async (req, res) => {
    try {
        const { id } = req.user;
        const updateData = { ...req.body };

        // Prevent email and phone number updates
        delete updateData.email;
        delete updateData.parentPhoneNumber;

        // Update last active time
        updateData.lastActive = new Date();

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const updatedUser = await User.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        });

        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update last active time
const updateLastActive = async (req, res) => {
    try {
        const { id } = req.user;
        const updatedUser = await User.findByIdAndUpdate(id,
            { lastActive: new Date() },
            { new: true }
        );
        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: "Error updating last active time" });
    }
};

// Get all data for a user by ID
const getUserAllDataById = async (req, res) => {
    try {
        const userId = req.params.id;

        // Find the user and exclude password
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'المستخدم غير موجود'
            });
        }

        // Get user's enrollments
        const enrollments = await enrollmentModel.find({ studentId: userId })
            .populate('courseId', 'name');

        // Get user's watch history
        const watchHistory = await WatchHistory.find({ studentId: userId })
            .sort({ lastWatchedAt: -1 });

        // Parse device info if it exists
        let deviceInfo = null;
        if (user.currentDeviceInfo) {
            try {
                deviceInfo = JSON.parse(user.currentDeviceInfo);
            } catch (e) {
                deviceInfo = { userAgent: user.currentDeviceInfo };
            }
        }

        res.status(200).json({
            status: 'success',
            data: {
                userInfo: {
                    ...user.toObject(),
                    deviceInfo: deviceInfo,
                    hasActiveSession: !!(user.currentSessionToken && user.sessionCreatedAt)
                },
                enrollments: enrollments.map(enrollment => ({
                    courseName: enrollment.courseId ? enrollment.courseId.name : 'Unknown Course',
                    enrollmentDate: enrollment.createdAt,
                    paymentStatus: enrollment.paymentStatus
                })),
                activity: {
                    totalWatchedLessons: watchHistory.length,
                    lastActivity: watchHistory.length > 0 ? watchHistory[0].lastWatchedAt : null,
                    watchHistory
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'خطأ في استرجاع بيانات المستخدم'
        });
    }
};

// Reset user password
const resetUserPassword = async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                status: 'error',
                message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'المستخدم غير موجود'
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password
        user.password = hashedPassword;

        // Force logout from current device (optional security measure)
        user.currentSessionToken = null;
        user.currentDeviceInfo = null;
        user.sessionCreatedAt = null;

        await user.save();

        res.status(200).json({
            status: 'success',
            message: 'تم تغيير كلمة المرور بنجاح'
        });
    } catch (error) {
        console.error("Password reset error:", error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في تغيير كلمة المرور'
        });
    }
};

// Delete user by ID (admin only)
const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'المستخدم غير موجود'
            });
        }

        // Delete user's associated data (optional, depending on your requirements)
        // This includes:
        await WatchHistory.deleteMany({ studentId: userId });
        await enrollmentModel.deleteMany({ studentId: userId });

        // Delete the user
        await User.findByIdAndDelete(userId);

        res.status(200).json({
            status: 'success',
            message: 'تم حذف المستخدم بنجاح'
        });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في حذف المستخدم'
        });
    }
};

// Get only enrolled students with pagination, search and filter
const getEnrolledStudents = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sortBy = req.query.sortBy || 'views'; // 'views', 'recent', 'inactive'
        const search = req.query.search || '';

        const skip = (page - 1) * limit;

        // Get all enrolled student IDs from enrollment collection
        const enrollments = await Enrollment.find({
            paymentStatus: 'paid' // Only include paid enrollments
        }).select('studentId').lean();

        // Extract unique student IDs
        const enrolledStudentIds = [...new Set(enrollments.map(e => e.studentId.toString()))];

        // Build search query with enrolled students only
        let searchQuery = {
            _id: { $in: enrolledStudentIds },
            role: { $ne: 'admin' }
        };

        if (search) {
            searchQuery = {
                _id: { $in: enrolledStudentIds },
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
            .select('name phoneNumber parentPhoneNumber email lastActive createdAt')
            .sort({ createdAt: -1 }) // Sort by creation date (newest first)
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

        const studentsStatus = await Promise.all(students.map(async (student) => {
            // Check enrollments for paid courses and populate course details
            const enrollments = await Enrollment.find({
                studentId: student._id,
                paymentStatus: 'paid'
            }).populate({
                path: 'courseId',
                populate: {
                    path: 'chapters',
                    model: 'Chapter',
                    populate: {
                        path: 'lessons',
                        model: 'Lesson'
                    }
                }
            }) || [];

            // Check watch history
            const watchHistory = await WatchHistory.find({ studentId: student._id }) || [];

            // Get enrolled courses with their chapters and lessons
            const enrolledCourses = await Promise.all(enrollments.map(async enrollment => {
                const course = enrollment.courseId;

                if (!course) {
                    return {
                        courseName: 'Unknown Course',
                        enrollmentDate: enrollment.createdAt,
                        paymentStatus: enrollment.paymentStatus,
                        chapters: []
                    };
                }

                // Map chapters and their lessons
                const chapters = (course.chapters || []).map(chapter => ({
                    chapterTitle: chapter.title,
                    chapterDescription: chapter.description,
                    lessons: (chapter.lessons || []).map(lesson => ({
                        lessonTitle: lesson.title,
                        lessonDescription: lesson.description,
                        isWatched: watchHistory.some(wh =>
                            wh.lessonId.toString() === lesson._id.toString()
                        ),
                        watchCount: watchHistory.filter(wh =>
                            wh.lessonId.toString() === lesson._id.toString()
                        ).length
                    }))
                }));

                return {
                    courseName: course.name,
                    enrollmentDate: enrollment.createdAt,
                    paymentStatus: enrollment.paymentStatus,
                    chapters: chapters
                };
            }));

            // Determine status based on both enrollment and watch history
            let status = 'enrolled';
            if (watchHistory && watchHistory.length > 0) {
                status = 'active';
            } else {
                status = 'inactive';
            }

            return {
                studentInfo: {
                    id: student._id,
                    name: student.name,
                    lastActivity: student.lastActive,
                    email: student.email,
                    phoneNumber: student.phoneNumber || 'Not provided',
                    parentPhoneNumber: student.parentPhoneNumber || 'Not provided',
                    createdAt: student.createdAt
                },
                enrollmentStatus: {
                    isEnrolled: true,
                    enrolledCourses: enrolledCourses,
                    totalEnrollments: enrollments.length
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
                    // Priority: inactive > active
                    const statusPriority = {
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
        console.error('Error in enrolled-students:', error);
        res.status(500).json({
            success: false,
            message: "Error fetching enrolled students",
            error: error.message
        });
    }
};

module.exports = {
    getUserByIdService: expressAsyncHandler(getUserByIdService),
    updateUserbyId: expressAsyncHandler(updateUserbyId),
    getAllStudents: expressAsyncHandler(getAllStudents),
    toggleBanStatus: expressAsyncHandler(toggleBanStatus),
    updateLastActive: expressAsyncHandler(updateLastActive),
    getUserAllDataById: expressAsyncHandler(getUserAllDataById),
    resetUserPassword: expressAsyncHandler(resetUserPassword),
    deleteUser: expressAsyncHandler(deleteUser),
    getEnrolledStudents: expressAsyncHandler(getEnrolledStudents)
};