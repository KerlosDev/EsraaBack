const express = require("express");
const router = express.Router();
const { getAllPackages, getPackageById, createPackage, updatePackage, deletePackage, getAllPackagesAdmin } = require("../services/packageService");
const { protect, isAdmin } = require("../services/authService");

// Public routes
router.get("/", getAllPackages);
router.get("/:id", getPackageById);

// Admin routes
router.get("/admin/all", protect, isAdmin, getAllPackagesAdmin);
router.post("/", protect, isAdmin, createPackage);
router.put("/:id", protect, isAdmin, updatePackage);
router.delete("/:id", protect, isAdmin, deletePackage);

module.exports = router;
