const Course = require("../modules/courseModule");
const enrollmentModel = require("../modules/enrollmentModel");
const expressAsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

// Combined service to get course data with enrollment check
const getCourseWithEnrollmentCheck = async (req, res) => {
    try {
        const { courseId } = req.params;
        const userId = req.user?._id; // Optional user from optionalAuth middleware

        console.log("Fetching course with ID:", courseId, "for user:", userId);
        // Validate course ID
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({
                success: false,
                message: "رابط الكورس غير صالح (ID غير صحيح)."
            });
        }

        // First, let's check if the course exists at all
        const courseExists = await Course.findById(courseId);
        console.log("Course exists check:", {
            exists: !!courseExists,
            isDraft: courseExists?.isDraft,
            publishStatus: courseExists?.publishStatus
        });

        // Get course with basic population - fix the query to match published courses
        const course = await Course.findOne({
            _id: courseId,
            isDraft: false,
            // Remove the publishStatus filter for now to see what's happening
        })
            .populate({
                path: 'chapters',
                select: 'title lessons',
                populate: {
                    path: 'lessons',
                    select: 'title fileName videoUrl fileUrl isFree',
                }
            })
            .populate({
                path: 'exams',
                select: 'title',
            });

        console.log("Course found:", {
            found: !!course,
            name: course?.name,
            isDraft: course?.isDraft,
            publishStatus: course?.publishStatus
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: "الكورس غير موجود أو غير متاح."
            });
        }

        // Check enrollment status if user is logged in
        let isEnrolled = false;
        let enrollmentData = null;

        if (userId) {
            const enrollment = await enrollmentModel.findOne({
                studentId: userId,
                courseId: courseId,
                paymentStatus: "paid"
            });

            isEnrolled = !!enrollment;
            enrollmentData = enrollment;
        }

        // Prepare course data based on enrollment status
        const responseData = {
            success: true,
            isEnrolled,
            course: {
                _id: course._id,
                name: course.name,
                description: course.description,
                imageUrl: course.imageUrl,
                price: course.price,
                isFree: course.isFree,
                level: course.level,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt,
                chapters: course.chapters.map(chapter => ({
                    _id: chapter._id,
                    title: chapter.title,
                    lessons: chapter.lessons.map(lesson => {
                        const lessonData = {
                            _id: lesson._id,
                            title: lesson.title,
                            fileName: lesson.fileName,
                            isFree: lesson.isFree,
                        };

                        // Only include video/file URLs if:
                        // 1. User is enrolled, OR
                        // 2. Lesson is marked as free
                        if (isEnrolled || lesson.isFree) {
                            lessonData.videoUrl = lesson.videoUrl;
                            lessonData.fileUrl = lesson.fileUrl;
                        }

                        return lessonData;
                    })
                })),
                exams: isEnrolled ? course.exams : [] // Only show exams if enrolled
            },
            enrollmentMessage: isEnrolled
                ? "أنت مشترك في هذا الكورس"
                : userId
                    ? "يجب الاشتراك في الكورس للوصول لجميع المحتويات"
                    : "يرجى تسجيل الدخول أولاً"
        };

        // Add enrollment details if enrolled
        if (isEnrolled && enrollmentData) {
            responseData.enrollmentDetails = {
                enrolledAt: enrollmentData.createdAt,
                paymentStatus: enrollmentData.paymentStatus
            };
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error("Course with Enrollment Check Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب بيانات الكورس"
        });
    }
};

module.exports = {
    getCourseWithEnrollmentCheck: expressAsyncHandler(getCourseWithEnrollmentCheck)
};
