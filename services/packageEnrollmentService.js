const expressAsyncHandler = require("express-async-handler");
const Package = require("../modules/packageModel");
const Course = require("../modules/courseModule");
const Enrollment = require("../modules/enrollmentModel");
const User = require("../modules/userModule");

// Helper function to check if a student is enrolled in a package
const checkPackageEnrollment = async (studentId, packageId) => {
    const enrollment = await Enrollment.findOne({
        studentId,
        packageId,
        paymentStatus: "paid",
        isPackage: true
    });
    return !!enrollment;
};

// Helper function to check if a student is enrolled in a course either directly or via a package
const checkCourseInPackageEnrollment = async (studentId, courseId) => {
    // Check direct course enrollment
    const directEnrollment = await Enrollment.findOne({
        studentId,
        courseId,
        paymentStatus: "paid"
    });

    if (directEnrollment) return true;

    // Check if the course is in any of the student's enrolled packages
    const packageEnrollments = await Enrollment.find({
        studentId,
        paymentStatus: "paid",
        isPackage: true
    }).populate('packageId');

    for (const enrollment of packageEnrollments) {
        if (!enrollment.packageId) continue;

        const packageCourses = enrollment.packageId.courses;
        if (packageCourses && packageCourses.some(c => c.toString() === courseId.toString())) {
            return true;
        }
    }

    return false;
};

// Create a package enrollment
const createPackageEnrollment = async (req, res) => {
    try {
        const { packageId } = req.body;
        const studentId = req.user._id.toHexString();
        const phoneNumber = req.body.phoneNumber;

        // Check if user exists
        const user = await User.findById(studentId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "الطالب غير موجود."
            });
        }

        // Check if package exists
        const packageData = await Package.findById(packageId);
        if (!packageData) {
            return res.status(404).json({
                success: false,
                message: "الحزمة التعليمية غير موجودة."
            });
        }

        // Check if already enrolled in this package
        const alreadyEnrolled = await Enrollment.findOne({
            studentId,
            packageId,
            isPackage: true
        });

        if (alreadyEnrolled) {
            return res.status(400).json({
                success: false,
                message: "الطالب مشترك بالفعل في هذه الحزمة."
            });
        }

        // Create enrollment with pending payment status
        const enrollment = await Enrollment.create({
            studentId,
            packageId,
            isPackage: true,
            price: packageData.price,
            phoneNumber,
            paymentStatus: "pending",
        });

        res.status(201).json({
            success: true,
            message: "تم التسجيل في الحزمة بنجاح، في انتظار الدفع",
            enrollment
        });
    } catch (error) {
        console.error("Package Enrollment Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء التسجيل في الحزمة"
        });
    }
};

// Get all package enrollments for a user
const getUserPackageEnrollments = async (req, res) => {
    try {
        const studentId = req.user._id;

        const packageEnrollments = await Enrollment.find({
            studentId,
            isPackage: true,
            paymentStatus: "paid"
        }).populate({
            path: 'packageId',
            populate: {
                path: 'courses',
                select: 'name description imageUrl level'
            }
        });

        res.status(200).json({
            success: true,
            packageEnrollments: packageEnrollments || [],
            isEnrolled: packageEnrollments && packageEnrollments.length > 0
        });
    } catch (error) {
        console.error("Get Package Enrollments Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب الحزم المسجلة",
            packageEnrollments: [],
            isEnrolled: false
        });
    }
};

// Check if a student is enrolled in a specific package
const checkStudentPackageEnrollment = async (req, res) => {
    try {
        const { packageId } = req.params;
        const studentId = req.user._id;

        const isEnrolled = await checkPackageEnrollment(studentId, packageId);

        res.status(200).json({
            success: true,
            isEnrolled,
            message: isEnrolled
                ? "الطالب مشترك في هذه الحزمة"
                : "الطالب غير مشترك في هذه الحزمة"
        });
    } catch (error) {
        console.error("Check Package Enrollment Error:", error);
        res.status(500).json({
            success: false,
            isEnrolled: false,
            message: "حدث خطأ أثناء التحقق من الاشتراك"
        });
    }
};

// Check if a student has access to a course (either directly or via a package)
const checkStudentCourseAccess = async (req, res) => {
    try {
        const { courseId } = req.params;
        const studentId = req.user._id;

        const hasAccess = await checkCourseInPackageEnrollment(studentId, courseId);

        res.status(200).json({
            success: true,
            hasAccess,
            message: hasAccess
                ? "الطالب لديه حق الوصول إلى هذا الكورس"
                : "الطالب ليس لديه حق الوصول إلى هذا الكورس"
        });
    } catch (error) {
        console.error("Check Course Access Error:", error);
        res.status(500).json({
            success: false,
            hasAccess: false,
            message: "حدث خطأ أثناء التحقق من حق الوصول"
        });
    }
};

// Get all package enrollments (admin)
const getAllPackageEnrollments = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, searchQuery } = req.query;

        // Build filter
        const filter = { isPackage: true };
        if (status && ['paid', 'pending', 'failed'].includes(status)) {
            filter.paymentStatus = status;
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get count for pagination
        let countQuery = Enrollment.find(filter);

        // Add search if provided
        if (searchQuery) {
            // Get student IDs matching search
            const studentIds = await User.find({
                $or: [
                    { email: { $regex: searchQuery, $options: 'i' } },
                    { phoneNumber: { $regex: searchQuery, $options: 'i' } }
                ]
            }).distinct('_id');

            // Get package IDs matching search
            const packageIds = await Package.find({
                name: { $regex: searchQuery, $options: 'i' }
            }).distinct('_id');

            countQuery = countQuery.or([
                { studentId: { $in: studentIds } },
                { packageId: { $in: packageIds } }
            ]);
        }

        const totalEnrollments = await countQuery.countDocuments();

        // Build main query
        let query = Enrollment.find(filter)
            .populate('packageId')
            .populate('studentId', 'email phoneNumber name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Add search if provided
        if (searchQuery) {
            // Get student IDs matching search
            const studentIds = await User.find({
                $or: [
                    { email: { $regex: searchQuery, $options: 'i' } },
                    { phoneNumber: { $regex: searchQuery, $options: 'i' } }
                ]
            }).distinct('_id');

            // Get package IDs matching search
            const packageIds = await Package.find({
                name: { $regex: searchQuery, $options: 'i' }
            }).distinct('_id');

            query = query.or([
                { studentId: { $in: studentIds } },
                { packageId: { $in: packageIds } }
            ]);
        }

        const enrollments = await query;

        const formattedEnrollments = enrollments.map(enrollment => ({
            _id: enrollment._id,
            userEmail: enrollment.studentId?.email || 'N/A',
            phoneNumber: enrollment.phoneNumber,
            studentName: enrollment.studentId?.name || 'N/A',
            packageName: enrollment.packageId?.name || 'N/A',
            packageId: enrollment.packageId?._id || null,
            price: enrollment.price,
            paymentStatus: enrollment.paymentStatus,
            createdAt: enrollment.createdAt
        }));

        res.status(200).json({
            success: true,
            enrollments: formattedEnrollments,
            pagination: {
                totalItems: totalEnrollments,
                totalPages: Math.ceil(totalEnrollments / limit),
                currentPage: parseInt(page),
                itemsPerPage: parseInt(limit),
                hasNextPage: page < Math.ceil(totalEnrollments / limit),
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error("Get All Package Enrollments Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب اشتراكات الحزم"
        });
    }
};

// Update package enrollment payment status (admin)
const updatePackageEnrollmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentStatus } = req.body;

        if (!['paid', 'pending', 'failed'].includes(paymentStatus)) {
            return res.status(400).json({
                success: false,
                message: "حالة الدفع غير صالحة"
            });
        }

        const updatedEnrollment = await Enrollment.findByIdAndUpdate(
            id,
            { paymentStatus },
            { new: true, runValidators: true }
        )
            .populate('packageId')
            .populate('studentId', 'email phoneNumber name');

        if (!updatedEnrollment) {
            return res.status(404).json({
                success: false,
                message: "الاشتراك غير موجود"
            });
        }

        const formattedEnrollment = {
            _id: updatedEnrollment._id,
            userEmail: updatedEnrollment.studentId?.email || 'N/A',
            phoneNumber: updatedEnrollment.studentId?.phoneNumber || 'N/A',
            studentName: updatedEnrollment.studentId?.name || 'غير محدد',
            packageName: updatedEnrollment.packageId?.name || 'غير محدد',
            packageId: updatedEnrollment.packageId?._id || null,
            price: updatedEnrollment.price || 0,
            paymentStatus: updatedEnrollment.paymentStatus,
            createdAt: updatedEnrollment.createdAt
        };

        res.status(200).json({
            success: true,
            message: "تم تحديث حالة الدفع بنجاح",
            enrollment: formattedEnrollment
        });
    } catch (error) {
        console.error("Update Package Enrollment Status Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحديث حالة الدفع",
            error: error.message
        });
    }
};

// Create admin package enrollment (admin)
const createAdminPackageEnrollment = async (req, res) => {
    try {
        const { studentId, packageId, price, paymentStatus } = req.body;

        // Check if student exists
        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: "الطالب غير موجود"
            });
        }

        // Check if package exists
        const packageData = await Package.findById(packageId);
        if (!packageData) {
            return res.status(404).json({
                success: false,
                message: "الحزمة غير موجودة"
            });
        }

        // Check if already enrolled
        const alreadyEnrolled = await Enrollment.findOne({
            studentId,
            packageId,
            isPackage: true
        });

        if (alreadyEnrolled) {
            return res.status(400).json({
                success: false,
                message: "الطالب مشترك بالفعل في هذه الحزمة"
            });
        }

        // Create enrollment
        const enrollment = await Enrollment.create({
            studentId,
            packageId,
            isPackage: true,
            price,
            phoneNumber: student.phoneNumber,
            paymentStatus,
        });

        // Populate enrollment data for response
        const populatedEnrollment = await Enrollment.findById(enrollment._id)
            .populate('packageId', 'name')
            .populate('studentId', 'name email phoneNumber');

        const formattedEnrollment = {
            _id: populatedEnrollment._id,
            studentName: populatedEnrollment.studentId.name,
            studentEmail: populatedEnrollment.studentId.email,
            phoneNumber: populatedEnrollment.studentId.phoneNumber,
            packageName: populatedEnrollment.packageId.name,
            price: populatedEnrollment.price,
            paymentStatus: populatedEnrollment.paymentStatus,
            createdAt: populatedEnrollment.createdAt
        };

        res.status(201).json({
            success: true,
            message: "تم إنشاء الاشتراك بنجاح",
            enrollment: formattedEnrollment
        });
    } catch (error) {
        console.error("Create Admin Package Enrollment Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إنشاء الاشتراك"
        });
    }
};

module.exports = {
    createPackageEnrollment: expressAsyncHandler(createPackageEnrollment),
    getUserPackageEnrollments: expressAsyncHandler(getUserPackageEnrollments),
    checkStudentPackageEnrollment: expressAsyncHandler(checkStudentPackageEnrollment),
    checkStudentCourseAccess: expressAsyncHandler(checkStudentCourseAccess),
    getAllPackageEnrollments: expressAsyncHandler(getAllPackageEnrollments),
    updatePackageEnrollmentStatus: expressAsyncHandler(updatePackageEnrollmentStatus),
    createAdminPackageEnrollment: expressAsyncHandler(createAdminPackageEnrollment),
    // Expose helper function for use in other services
    checkCourseInPackageEnrollment
};
