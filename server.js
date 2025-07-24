const express = require("express");
const dbconnection = require("./config/database");
const cors = require("cors");
const dotenv = require("dotenv");

const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const activitionRoutes = require("./routes/activitionRoutes");
const chapterRoutes = require("./routes/chapterRoutes");
const examRoutes = require("./routes/examRoutes");
const courseRoutes = require("./routes/courseRoutes");
const examResultsRouter = require("./routes/examResultsRoutes");
const watchHistoryRoutes = require("./routes/watchHistoryRoutes");
const rankRouter = require("./routes/rankRouter");
const analyticsRoutes = require("./routes/analyticsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const offerRoutes = require("./routes/offerRoutes");
const statsRoutes = require("./routes/statsRoutes");
const bookRoutes = require("./routes/bookRoutes");
const bookOrderRoutes = require("./routes/bookOrderRoutes");
const courseAnalyticsRoutes = require("./routes/courseAnalyticsRoutes");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

dbconnection();

// ✅ Middleware
app.use(cors({
  origin: ["http://localhost:3000", "https://esraaelbialy.site"],
  credentials: true,
}));

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/active', activitionRoutes);
app.use('/chapter', chapterRoutes);
app.use('/exam', examRoutes);
app.use('/course', courseRoutes);
app.use('/user', userRoutes);
app.use('/examResult', examResultsRouter);
app.use('/watchHistory', watchHistoryRoutes);
app.use('/rank', rankRouter);
app.use('/analytics', analyticsRoutes);
app.use('/notifications', notificationRoutes);
app.use('/offers', offerRoutes);
app.use('/stats', statsRoutes);
app.use('/books', bookRoutes);
app.use('/book-orders', bookOrderRoutes);
app.use('/course-analytics', courseAnalyticsRoutes);
app.use('/course-data', courseWithEnrollmentRoutes);

app.listen(PORT, () => {
  console.log(`The server is running on port ${PORT}`);
});
