const expressAsyncHandler = require("express-async-handler");
const Package = require("../modules/packageModel");
const Course = require("../modules/courseModule");
const mongoose = require("mongoose");

// Get all packages
const getAllPackages = async (req, res) => {
    try {
        const packages = await Package.find({ isDraft: false, publishStatus: "published" })
            .populate({
                path: 'courses',
                select: 'name imageUrl level price'
            });

        res.status(200).json({
            success: true,
            packages
        });
    } catch (error) {
        console.error("Get Packages Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب الحزم التعليمية"
        });
    }
};

// Get package by ID
const getPackageById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "معرّف الحزمة غير صالح"
            });
        }

        const packageData = await Package.findById(id)
            .populate({
                path: 'courses',
                select: 'name description imageUrl level price'
            });

        if (!packageData) {
            return res.status(404).json({
                success: false,
                message: "الحزمة غير موجودة"
            });
        }

        res.status(200).json({
            success: true,
            package: packageData
        });
    } catch (error) {
        console.error("Get Package Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب الحزمة التعليمية"
        });
    }
};

// Create new package
const createPackage = async (req, res) => {
    try {
        const { name, description, imageUrl, price, courses, level } = req.body;

        // Validate courses exist
        if (!courses || !Array.isArray(courses) || courses.length < 2) {
            return res.status(400).json({
                success: false,
                message: "يجب أن تحتوي الحزمة على كورسين على الأقل"
            });
        }

        // Check if all courses exist
        const coursesData = await Course.find({ _id: { $in: courses } });
        if (coursesData.length !== courses.length) {
            return res.status(400).json({
                success: false,
                message: "بعض الكورسات غير موجودة"
            });
        }

        // Calculate original price (sum of all course prices)
        const originalPrice = coursesData.reduce((sum, course) => sum + course.price, 0);

        // Calculate discount percentage
        const discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);

        // Create the package
        const newPackage = await Package.create({
            name,
            description,
            imageUrl,
            price,
            originalPrice,
            discountPercentage,
            courses,
            level,
            isDraft: false,
            publishStatus: "published"
        });

        res.status(201).json({
            success: true,
            message: "تم إنشاء الحزمة بنجاح",
            package: newPackage
        });
    } catch (error) {
        console.error("Create Package Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء إنشاء الحزمة التعليمية"
        });
    }
};

// Update package
const updatePackage = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, imageUrl, price, courses, level, isDraft, publishStatus } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "معرّف الحزمة غير صالح"
            });
        }

        // Validate courses if provided
        if (courses) {
            if (!Array.isArray(courses) || courses.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: "يجب أن تحتوي الحزمة على كورسين على الأقل"
                });
            }

            // Check if all courses exist
            const coursesData = await Course.find({ _id: { $in: courses } });
            if (coursesData.length !== courses.length) {
                return res.status(400).json({
                    success: false,
                    message: "بعض الكورسات غير موجودة"
                });
            }
        }

        // Prepare update data
        const updateData = {};
        if (name) updateData.name = name;
        if (description) updateData.description = description;
        if (imageUrl) updateData.imageUrl = imageUrl;
        if (level) updateData.level = level;
        if (isDraft !== undefined) updateData.isDraft = isDraft;
        if (publishStatus) updateData.publishStatus = publishStatus;

        // If both price and courses are updated, recalculate originalPrice and discountPercentage
        if (price && courses) {
            const coursesData = await Course.find({ _id: { $in: courses } });
            const originalPrice = coursesData.reduce((sum, course) => sum + course.price, 0);
            const discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);

            updateData.price = price;
            updateData.originalPrice = originalPrice;
            updateData.discountPercentage = discountPercentage;
            updateData.courses = courses;
        }
        // If only price is updated, recalculate discountPercentage
        else if (price) {
            const packageData = await Package.findById(id);
            const discountPercentage = Math.round(((packageData.originalPrice - price) / packageData.originalPrice) * 100);

            updateData.price = price;
            updateData.discountPercentage = discountPercentage;
        }
        // If only courses are updated, recalculate originalPrice and discountPercentage
        else if (courses) {
            const packageData = await Package.findById(id);
            const coursesData = await Course.find({ _id: { $in: courses } });
            const originalPrice = coursesData.reduce((sum, course) => sum + course.price, 0);
            const discountPercentage = Math.round(((originalPrice - packageData.price) / originalPrice) * 100);

            updateData.originalPrice = originalPrice;
            updateData.discountPercentage = discountPercentage;
            updateData.courses = courses;
        }

        // Update the package
        const updatedPackage = await Package.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate({
            path: 'courses',
            select: 'name imageUrl level price'
        });

        if (!updatedPackage) {
            return res.status(404).json({
                success: false,
                message: "الحزمة غير موجودة"
            });
        }

        res.status(200).json({
            success: true,
            message: "تم تحديث الحزمة بنجاح",
            package: updatedPackage
        });
    } catch (error) {
        console.error("Update Package Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء تحديث الحزمة التعليمية"
        });
    }
};

// Delete package
const deletePackage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "معرّف الحزمة غير صالح"
            });
        }

        const deletedPackage = await Package.findByIdAndDelete(id);

        if (!deletedPackage) {
            return res.status(404).json({
                success: false,
                message: "الحزمة غير موجودة"
            });
        }

        res.status(200).json({
            success: true,
            message: "تم حذف الحزمة بنجاح"
        });
    } catch (error) {
        console.error("Delete Package Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء حذف الحزمة التعليمية"
        });
    }
};

// Get all packages for admin (including drafts)
const getAllPackagesAdmin = async (req, res) => {
    try {
        const packages = await Package.find()
            .populate({
                path: 'courses',
                select: 'name imageUrl level price'
            });

        res.status(200).json({
            success: true,
            packages
        });
    } catch (error) {
        console.error("Get Admin Packages Error:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء جلب الحزم التعليمية"
        });
    }
};

module.exports = {
    getAllPackages: expressAsyncHandler(getAllPackages),
    getPackageById: expressAsyncHandler(getPackageById),
    createPackage: expressAsyncHandler(createPackage),
    updatePackage: expressAsyncHandler(updatePackage),
    deletePackage: expressAsyncHandler(deletePackage),
    getAllPackagesAdmin: expressAsyncHandler(getAllPackagesAdmin)
};
