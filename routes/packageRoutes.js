const express = require("express");
const router = express.Router();
const { getAllPackages, getPackageById, createPackage, updatePackage, deletePackage, getAllPackagesAdmin } = require("../services/packageService");
const { protect, isAdmin } = require("../services/authService");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// Public routes
router.get("/", getAllPackages);
router.get("/:id", getPackageById);

// Admin routes
router.get("/admin/all", protect, isAdmin, getAllPackagesAdmin);
router.post("/", protect, isAdmin, upload.single('image'), createPackage);
router.put("/:id", protect, isAdmin, upload.single('image'), updatePackage);
router.delete("/:id", protect, isAdmin, deletePackage);

module.exports = router;
