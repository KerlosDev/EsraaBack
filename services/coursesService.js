const axios = require("axios");
const Course = require("../modules/courseModule");
const expressAsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
// ✅ رفع صورة إلى ImgBB
const uploadToImgBB = async (buffer) => {
  try {
    const apiKey = process.env.IMGBB_API_KEY || '192530c1c337c43e5cc555d3dfd0ec3d';
    const base64Image = buffer.toString('base64');

    const formData = new URLSearchParams();
    formData.append('key', apiKey);
    formData.append('image', base64Image);

    const response = await axios.post("https://api.imgbb.com/1/upload", formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return response.data.data.url;
  } catch (error) {
    console.error("ImgBB Upload Error:", error.response?.data || error.message);
    throw new Error("فشل رفع صورة الكورس إلى ImgBB");
  }
};

// ✅ إنشاء كورس جديد
const createCourseWithImage = async (body, imageFile = null) => {
  let imageUrl = body.imageUrl || null;

  if (imageFile) {
    imageUrl = await uploadToImgBB(imageFile.buffer);
  }

  const chapters = body.chapters ? JSON.parse(body.chapters) : [];
  const exams = body.exams ? JSON.parse(body.exams) : [];

  const course = await Course.create({
    name: body.name,
    description: body.description,
    imageUrl,
    price: body.isFree === "true" ? 0 : Number(body.price),
    isFree: body.isFree === "true",
    level: body.level,
    chapters,
    exams,
    isDraft: body.isDraft === "true" || body.isDraft === true,
    scheduledPublishDate: body.scheduledPublishDate ? new Date(body.scheduledPublishDate) : null,
    isScheduled: body.isScheduled === "true" || body.isScheduled === true,
    publishStatus: body.publishStatus || (body.isDraft === "true" || body.isDraft === true ? "draft" : "published")
  });

  return course;
};

// ✅ جلب كل الكورسات أو كورس واحد
const getCourses = async (req, res) => {

  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  // Only return published courses (not drafts) for frontend
  const courses = await Course.find({
    $or: [
      { isDraft: false },
      { publishStatus: "published" }
    ]
  }).skip(skip).limit(parseInt(limit));


  console.log("جلب الكورسات:", courses);

  res.status(200).json({
    results: courses.length,
    page: +page,
    courses,
  });


};

const getAllCoursesForAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const courses = await Course.find().skip(skip).limit(parseInt(limit));
    res.status(200).json({
      results: courses.length,
      page: +page,
      courses,
    });
  } catch (error) {
    console.error("Get All Courses Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء جلب الكورسات"
    });
  }
};

// ✅ تحديث كورس
const updateCourse = async (courseId, body, imageFile = null) => {
  const course = await Course.findById(courseId);
  if (!course) throw new Error("الكورس غير موجود");

  let imageUrl = course.imageUrl;

  if (imageFile) {
    imageUrl = await uploadToImgBB(imageFile.buffer);
  }

  const chapters = body.chapters ? JSON.parse(body.chapters) : course.chapters;
  const exams = body.exams ? JSON.parse(body.exams) : course.exams;

  course.name = body.name || course.name;
  course.description = body.description || course.description;
  course.imageUrl = imageUrl;
  course.price = body.isFree === "true" ? 0 : Number(body.price);
  course.isFree = body.isFree === "true";
  course.level = body.level || course.level;
  course.chapters = chapters;
  course.exams = exams;
  if (typeof body.isDraft !== "undefined") {
    course.isDraft = body.isDraft === "true" || body.isDraft === true;
  }
  if (typeof body.scheduledPublishDate !== "undefined") {
    course.scheduledPublishDate = body.scheduledPublishDate ? new Date(body.scheduledPublishDate) : null;
  }
  if (typeof body.isScheduled !== "undefined") {
    course.isScheduled = body.isScheduled === "true" || body.isScheduled === true;
  }
  if (typeof body.publishStatus !== "undefined") {
    course.publishStatus = body.publishStatus;
  }

  await course.save();

  return course;
};

// ✅ حذف كورس
const deleteCourse = async (courseId) => {
  const course = await Course.findByIdAndDelete(courseId);
  if (!course) throw new Error("فشل حذف الكورس، الكورس غير موجود");
  return course;
};


const getCourseById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "رابط الكورس غير صالح (ID غير صحيح)." });
  }

  const course = await Course.findOne({
    _id: id,
    $or: [
      { isDraft: false },
      { publishStatus: "published" }
    ]
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

  if (!course) {
    return res.status(404).json({ message: "الكورس غير موجود." });
  }

  const formattedCourse = {
    ...course.toObject(),
    chapters: course.chapters.map(chapter => ({
      _id: chapter._id,
      title: chapter.title,
      lessons: chapter.lessons.map(lesson => ({
        _id: lesson._id,
        title: lesson.title,
        fileName: lesson.fileName,
        isFree: lesson.isFree,
        // Include video URLs only for free lessons
        ...(lesson.isFree && {
          videoUrl: lesson.videoUrl,
          fileUrl: lesson.fileUrl
        })
      }))
    }))
  };

  res.status(200).json(formattedCourse);
};


const getCourseByIdAdmin = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "رابط الكورس غير صالح (ID غير صحيح)." });
  }

  const course = await Course.findById(id)
    .populate({ path: 'chapters' })
    .populate({ path: 'exams' });

  if (!course) {
    return res.status(404).json({ message: "الكورس غير موجود." });
  }

  res.status(200).json(course);
};

// ✅ Check and publish scheduled courses
const checkAndPublishScheduledCourses = async () => {
  try {
    const now = new Date();
    const scheduledCourses = await Course.find({
      isScheduled: true,
      scheduledPublishDate: { $lte: now },
      publishStatus: "scheduled"
    });

    for (const course of scheduledCourses) {
      course.isDraft = false;
      course.isScheduled = false;
      course.publishStatus = "published";
      await course.save();
      console.log(`Course "${course.name}" has been automatically published`);
    }

    return scheduledCourses.length;
  } catch (error) {
    console.error("Error checking scheduled courses:", error);
    return 0;
  }
};

// ✅ Toggle lesson free status
const toggleLessonFreeStatus = async (req, res) => {
  const { chapterId, lessonId } = req.params;
  const { isFree } = req.body;

  try {
    const Chapter = require("../modules/chapterModel");

    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      return res.status(404).json({ message: "الفصل غير موجود." });
    }

    const lesson = chapter.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "الدرس غير موجود." });
    }

    // Ensure all lessons have valid fileName values (fix validation issue)
    chapter.lessons.forEach(l => {
      if (!l.fileName) {
        l.fileName = l.title || 'unnamed';
      }
    });

    lesson.isFree = isFree;
    await chapter.save();

    res.status(200).json({
      message: `تم ${isFree ? 'جعل' : 'إلغاء'} الدرس مجاني بنجاح`,
      lesson
    });
  } catch (error) {
    console.error("Error toggling lesson free status:", error);
    res.status(500).json({ message: "حدث خطأ في تحديث حالة الدرس." });
  }
};

module.exports = {
  uploadToImgBB,
  createCourseWithImage: expressAsyncHandler(createCourseWithImage),
  getCourses: expressAsyncHandler(getCourses),
  updateCourse: expressAsyncHandler(updateCourse),
  getCourseById: expressAsyncHandler(getCourseById),
  getCourseByIdAdmin: expressAsyncHandler(getCourseByIdAdmin),
  deleteCourse: expressAsyncHandler(deleteCourse),
  getAllCoursesForAdmin: expressAsyncHandler(getAllCoursesForAdmin),
  checkAndPublishScheduledCourses,
  toggleLessonFreeStatus: expressAsyncHandler(toggleLessonFreeStatus),
};
