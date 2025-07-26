const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
    },
    packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Package",
    },
    isPackage: {
        type: Boolean,
        default: false,
    },
    price: {
        type: Number,
        required: true
    },
    enrolledAt: {
        type: Date,
        default: Date.now,
    },
    paymentStatus: {
        type: String,
        enum: ["paid", "pending", "failed"],
        default: "pending",
    },
    phoneNumber: {
        type: String,
        required: true
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model("Enrollment", enrollmentSchema);
