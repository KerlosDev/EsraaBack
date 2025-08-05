const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const { createCourseWithImage, getCourses, getCourseById, updateCourse, deleteCourse, getAllCoursesForAdmin, getCourseByIdAdmin, checkAndPublishScheduledCourses, toggleLessonFreeStatus, getCourseContentAnalytics } = require("../services/coursesService");
const { isAdmin, protect } = require("../services/authService");
const { checkScheduledCourses } = require("../middleware/scheduledCourseMiddleware");

router.post("/create", protect, isAdmin, upload.single("image"), async (req, res) => {
  try {
    const course = await createCourseWithImage(req.body, req.file || null);
    res.status(201).json({
      message: "تم إنشاء الكورس بنجاح",
      course,
    });
  } catch (error) {
    console.error("Course Creation Error:", error);
    res.status(500).json({ message: error.message || "فشل إنشاء الكورس." });
  }
});

router.put("/:id", protect, isAdmin, upload.single("image"), async (req, res) => {
  try {
    const course = await updateCourse(req.params.id, req.body, req.file || null);
    res.status(200).json({
      message: "تم تحديث الكورس بنجاح",
      course,
    });
  } catch (error) {
    console.error("Course Update Error:", error);
    res.status(500).json({ message: error.message || "فشل تحديث الكورس." });
  }
});

router.delete("/:id", protect, isAdmin, async (req, res) => {
  try {
    await deleteCourse(req.params.id);
    res.status(200).json({ message: "تم حذف الكورس بنجاح" });
  } catch (error) {
    console.error("Course Deletion Error:", error);
    res.status(500).json({ message: error.message || "فشل حذف الكورس." });
  }
});

router.get("/", checkScheduledCourses, getCourses);
router.get("/allCourses", protect, isAdmin, checkScheduledCourses, getAllCoursesForAdmin);
router.get("/check-scheduled", async (req, res) => {
  try {
    const publishedCount = await checkAndPublishScheduledCourses();
    res.status(200).json({
      message: `تم فحص الكورسات المجدولة`,
      publishedCount
    });
  } catch (error) {
    console.error("Scheduled check error:", error);
    res.status(500).json({ message: "خطأ في فحص الكورسات المجدولة" });
  }
});

// Toggle lesson free status
router.put("/chapter/:chapterId/lesson/:lessonId/toggle-free", protect, isAdmin, toggleLessonFreeStatus);

// Get course content analytics
router.get("/content-analytics", protect, isAdmin, getCourseContentAnalytics);

router.get("/:id", getCourseById);
router.get("/admin/:id", getCourseByIdAdmin);

module.exports = router;
