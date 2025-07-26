const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    imageUrl: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    originalPrice: {
        type: Number,
        required: true, // Total sum of individual course prices
    },
    discountPercentage: {
        type: Number,
        required: true,
    },
    courses: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true
        }
    ],
    level: {
        type: String,
        enum: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي", "متعدد المراحل"],
        required: true,
    },
    isDraft: {
        type: Boolean,
        default: true,
    },
    publishStatus: {
        type: String,
        enum: ["draft", "published", "scheduled"],
        default: "draft",
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model("Package", packageSchema);
