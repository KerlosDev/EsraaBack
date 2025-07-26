const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { protect, isAdmin } = require("../services/authService");
const validatorMiddleware = require("../middleware/validMiddleware");
const { check } = require("express-validator");
const Package = require("../modules/packageModel");
const Enrollment = require("../modules/enrollmentModel");

// Validate package enrollment request
const packageEnrollmentValidation = [
    // Check packageId
    check("packageId")
        .notEmpty().withMessage("packageId مطلوب.")
        .isLength({ min: 24, max: 24 }).withMessage("packageId لازم يكون ObjectId صحيح.")
        .custom(async (value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error("packageId غير صالح.");
            }

            const packageExists = await Package.findById(value);
            if (!packageExists) {
                throw new Error("الحزمة غير موجودة.");
            }

            return true;
        }),

    // Check phone number
    check("phoneNumber")
        .notEmpty().withMessage("رقم الهاتف مطلوب.")
        .isMobilePhone('ar-EG').withMessage("رقم الهاتف غير صالح.")
        .matches(/^01[0125][0-9]{8}$/).withMessage("رقم الهاتف يجب أن يكون 11 رقم ويبدأ بكود مصري."),

    validatorMiddleware,
];

// Create a package enrollment with manual payment
router.post("/", protect, packageEnrollmentValidation, async (req, res) => {
    try {
        const { packageId, phoneNumber, price } = req.body;
        const studentId = req.user._id;

        // Check if user exists
        const user = await mongoose.model("User").findById(studentId);
        if (!user) {
            return res.status(404).json({ message: "الطالب غير موجود." });
        }

        // Check if already enrolled in this package
        const alreadyEnrolled = await Enrollment.findOne({
            studentId,
            packageId,
            isPackage: true
        });

        if (alreadyEnrolled) {
            return res.status(400).json({ message: "الطالب مشترك بالفعل في هذه الحزمة." });
        }

        // Fetch package information
        const packageData = await Package.findById(packageId);
        if (!packageData) {
            return res.status(404).json({ message: "الحزمة غير موجودة." });
        }

        // Create package enrollment with pending payment status
        const enrollment = await Enrollment.create({
            studentId,
            packageId,
            isPackage: true,
            price: price || packageData.price,
            phoneNumber,
            paymentStatus: "pending",
        });

        res.status(201).json({
            message: "تم تسجيل طلب الاشتراك في الحزمة بنجاح، وسيتم المراجعة خلال 24 ساعة",
            enrollment,
        });
    } catch (error) {
        console.error("Package Enrollment Error:", error);
        res.status(500).json({ message: "حصل خطأ أثناء الاشتراك في الحزمة" });
    }
});

// Get all package enrollments for current user
router.get("/user", protect, async (req, res) => {
    try {
        const studentId = req.user._id;
        const enrollments = await Enrollment.find({
            studentId,
            isPackage: true
        }).populate('packageId');

        res.status(200).json({
            success: true,
            count: enrollments.length,
            enrollments
        });
    } catch (error) {
        console.error("Package Enrollments Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب بيانات الاشتراكات"
        });
    }
});

// Check if user is enrolled in a specific package
router.get("/check/:packageId", protect, async (req, res) => {
    try {
        const studentId = req.user._id;
        const packageId = req.params.packageId;

        const enrollment = await Enrollment.findOne({
            studentId,
            packageId,
            isPackage: true,
            paymentStatus: "paid"
        }).populate('packageId');

        return res.status(200).json({
            success: true,
            isEnrolled: !!enrollment,
            enrollment: enrollment || null,
            message: enrollment ? "الطالب مشترك في هذه الحزمة" : "الطالب غير مشترك في هذه الحزمة"
        });
    } catch (error) {
        console.error("Package Enrollment Check Error:", error);
        res.status(500).json({
            success: false,
            isEnrolled: false,
            enrollment: null,
            message: "حدث خطأ أثناء التحقق من الاشتراك"
        });
    }
});

// Admin routes
router.get("/admin/enrollments", protect, isAdmin, async (req, res) => {
    try {
        const enrollments = await Enrollment.find({ isPackage: true })
            .populate('packageId')
            .populate('studentId', 'name email phoneNumber');

        res.status(200).json({
            success: true,
            count: enrollments.length,
            enrollments
        });
    } catch (error) {
        console.error("Admin Package Enrollments Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب بيانات الاشتراكات"
        });
    }
});

// Create package enrollment by admin
router.post("/admin/create", protect, isAdmin, async (req, res) => {
    try {
        const { studentId, packageId, price, paymentStatus } = req.body;

        // Check if user exists
        const user = await mongoose.model("User").findById(studentId);
        if (!user) {
            return res.status(404).json({ message: "الطالب غير موجود." });
        }

        // Check if already enrolled in this package
        const alreadyEnrolled = await Enrollment.findOne({
            studentId,
            packageId,
            isPackage: true
        });

        if (alreadyEnrolled) {
            return res.status(400).json({ message: "الطالب مشترك بالفعل في هذه الحزمة." });
        }

        // Fetch package information
        const packageData = await Package.findById(packageId);
        if (!packageData) {
            return res.status(404).json({ message: "الحزمة غير موجودة." });
        }

        // Create package enrollment with specified payment status
        const enrollment = await Enrollment.create({
            studentId,
            packageId,
            isPackage: true,
            price: price || packageData.price,
            phoneNumber: user.phoneNumber,
            paymentStatus: paymentStatus || "pending",
        });

        res.status(201).json({
            message: "تم إضافة اشتراك الحزمة بنجاح",
            enrollment,
        });
    } catch (error) {
        console.error("Admin Package Enrollment Error:", error);
        res.status(500).json({ message: "حصل خطأ أثناء إضافة اشتراك الحزمة" });
    }
});

// Update package enrollment payment status (admin only)
router.put("/admin/:id", protect, isAdmin, async (req, res) => {
    try {
        const { paymentStatus } = req.body;
        const enrollmentId = req.params.id;

        if (!['paid', 'pending', 'failed'].includes(paymentStatus)) {
            return res.status(400).json({ message: "حالة الدفع غير صالحة" });
        }

        const enrollment = await Enrollment.findById(enrollmentId);
        if (!enrollment || !enrollment.isPackage) {
            return res.status(404).json({ message: "الاشتراك غير موجود" });
        }

        enrollment.paymentStatus = paymentStatus;
        await enrollment.save();

        res.status(200).json({
            success: true,
            message: "تم تحديث حالة الدفع بنجاح",
            enrollment
        });
    } catch (error) {
        console.error("Update Package Payment Status Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحديث حالة الدفع"
        });
    }
});

module.exports = router;
