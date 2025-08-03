const StudentExamResult = require('../modules/examResultSchema.js');

// ✅ Add or update an exam result
const saveExamResult = async (studentId, examData) => {
  const existingRecord = await StudentExamResult.findOne({ studentId });

  if (existingRecord) {
    const prevAttempts = existingRecord.results.filter(r => r.examTitle === examData.examTitle).length;
    examData.attemptNumber = prevAttempts + 1;

    existingRecord.results.push(examData);
    return await existingRecord.save();
  } else {
    examData.attemptNumber = 1;

    const newRecord = new StudentExamResult({
      studentId,
      results: [examData]
    });

    return await newRecord.save();
  }
};

// ✅ Get all results for a specific student
const getResultsByStudent = async (studentId) => {
  const results = await StudentExamResult.findOne({ studentId }).populate('studentId', 'name email');
  if (!results) {
    return {
      studentId: { name: '', email: '' },
      results: []
    };
  }
  return results;
};

// ✅ Get all attempts for a specific exam title (for a student)
const getExamHistory = async (studentId, examTitle) => {
  const record = await StudentExamResult.findOne({ studentId });
  if (!record) return [];

  return record.results.filter(result => result.examTitle === examTitle);
};

// ✅ Get all exam results for all students
const getAllExamResults = async () => {
  const results = await StudentExamResult.find()
    .populate('studentId', 'name email phoneNumber')
    .sort({ createdAt: -1 });

  // Filter out results where studentId is null (deleted users)
  return results.filter(result => result.studentId && result.studentId._id);
};

// ✅ حساب ترتيب الطلاب بناءً على متوسط درجاتهم
const getStudentsRankings = async () => {
  const all = await StudentExamResult.find().populate('studentId', 'name email');

  const studentsWithScores = all
    .filter(student => student.studentId && student.studentId._id) // Filter out null studentId
    .map(student => {
      let totalCorrect = 0;
      let totalQuestions = 0;

      student.results.forEach(result => {
        totalCorrect += result.correctAnswers;
        totalQuestions += result.totalQuestions;
      });

      const score = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;

      return {
        studentId: student.studentId._id,
        name: student.studentId.name,
        email: student.studentId.email,
        score: score,
        percentage: Math.round(score * 100)
      };
    });

  const sorted = studentsWithScores.sort((a, b) => b.score - a.score);

  return sorted;
};

// ✅ البحث عن ترتيب طالب معين
const getStudentRankById = async (targetId) => {
  try {
    const rankings = await getStudentsRankings();

    const index = rankings.findIndex(r => r.studentId && r.studentId.toString() === targetId.toString());

    if (index === -1) return null;

    return {
      rank: index + 1,
      ...rankings[index]
    };
  } catch (error) {
    console.error('Error in getStudentRankById:', error);
    throw error;
  }
};

// ✅ Get students by exam title
const getStudentsByExam = async (examTitle) => {
  const results = await StudentExamResult.find({ "results.examTitle": examTitle })
    .populate('studentId', 'name email phoneNumber')
    .sort({ createdAt: -1 });

  // Filter and format the results to return only relevant data
  const formattedResults = results
    .filter(result => result.studentId && result.studentId._id)
    .map(student => {
      // Get all attempts for this exam by this student
      const examAttempts = student.results.filter(r => r.examTitle === examTitle);

      // Find the best attempt (highest score)
      const bestAttempt = examAttempts.reduce((best, current) => {
        const currentScore = (current.correctAnswers / current.totalQuestions) * 100;
        const bestScore = best ? (best.correctAnswers / best.totalQuestions) * 100 : 0;
        return currentScore > bestScore ? current : best;
      }, null);

      return {
        student: {
          id: student.studentId._id,
          name: student.studentId.name,
          email: student.studentId.email,
          phoneNumber: student.studentId.phoneNumber || ''
        },
        bestAttempt: bestAttempt ? {
          score: Math.round((bestAttempt.correctAnswers / bestAttempt.totalQuestions) * 100),
          attemptNumber: bestAttempt.attemptNumber,
          examDate: bestAttempt.examDate,
          correctAnswers: bestAttempt.correctAnswers,
          totalQuestions: bestAttempt.totalQuestions
        } : null,
        totalAttempts: examAttempts.length
      };
    });

  // Sort by best score, descending
  return formattedResults.sort((a, b) =>
    b.bestAttempt.score - a.bestAttempt.score
  );
};

// Add this new function to get students by examId instead of examTitle
const getStudentsByExamId = async (examId) => {
  const results = await StudentExamResult.find({ "results.examId": examId })
    .populate('studentId', 'name email phoneNumber')
    .sort({ createdAt: -1 });

  // Filter and format the results to return only relevant data
  const formattedResults = results
    .filter(result => result.studentId && result.studentId._id)
    .map(student => {
      // Get all attempts for this exam by this student
      const examAttempts = student.results.filter(r => r.examId === examId);

      // Find the best attempt (highest score)
      const bestAttempt = examAttempts.reduce((best, current) => {
        const currentScore = (current.correctAnswers / current.totalQuestions) * 100;
        const bestScore = best ? (best.correctAnswers / best.totalQuestions) * 100 : 0;
        return currentScore > bestScore ? current : best;
      }, null);

      return {
        student: {
          id: student.studentId._id,
          name: student.studentId.name,
          email: student.studentId.email,
          phoneNumber: student.studentId.phoneNumber || ''
        },
        bestAttempt: bestAttempt ? {
          score: Math.round((bestAttempt.correctAnswers / bestAttempt.totalQuestions) * 100),
          attemptNumber: bestAttempt.attemptNumber,
          examDate: bestAttempt.examDate,
          correctAnswers: bestAttempt.correctAnswers,
          totalQuestions: bestAttempt.totalQuestions
        } : null,
        totalAttempts: examAttempts.length
      };
    });

  // Sort by best score, descending
  return formattedResults.sort((a, b) =>
    b.bestAttempt.score - a.bestAttempt.score
  );
};

// ✅ Get top performers across all exams
const getTopPerformers = async (limit = 3) => {
  const rankings = await getStudentsRankings();
  return rankings.slice(0, limit);
};

// ✅ Get monthly comparison data
const getMonthlyComparison = async () => {
  try {
    const results = await StudentExamResult.find()
      .populate('studentId', 'name email phoneNumber')
      .sort({ createdAt: -1 });

    const monthlyData = {};
    const now = new Date();

    // Generate last 6 months data
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = {
        month: date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
        totalExams: 0,
        averageScore: 0,
        passRate: 0,
        participationRate: 0,
        scores: []
      };
    }

    results.forEach(student => {
      student.results.forEach(result => {
        const resultDate = new Date(result.date || result.createdAt);
        const monthKey = `${resultDate.getFullYear()}-${String(resultDate.getMonth() + 1).padStart(2, '0')}`;

        if (monthlyData[monthKey]) {
          monthlyData[monthKey].totalExams++;
          const score = (result.correctAnswers / result.totalQuestions) * 100;
          monthlyData[monthKey].scores.push(score);
        }
      });
    });

    // Calculate final statistics
    Object.keys(monthlyData).forEach(key => {
      const data = monthlyData[key];
      if (data.scores.length > 0) {
        data.averageScore = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
        data.passRate = Math.round((data.scores.filter(score => score >= 60).length / data.scores.length) * 100);
        data.participationRate = Math.round((data.scores.length / data.totalExams) * 100) || 0;
      }
    });

    return Object.values(monthlyData);
  } catch (error) {
    console.error('Error in getMonthlyComparison:', error);
    return [];
  }
};

// ✅ Get performance trends
const getPerformanceTrends = async () => {
  try {
    const results = await StudentExamResult.find()
      .populate('studentId', 'name email phoneNumber')
      .sort({ createdAt: -1 });

    const trendsData = {};
    const now = new Date();

    // Generate last 6 months data
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      trendsData[monthKey] = {
        date: date.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' }),
        participation: 0,
        averageScore: 0,
        scores: [],
        totalStudents: new Set()
      };
    }

    results.forEach(student => {
      student.results.forEach(result => {
        const resultDate = new Date(result.date || result.createdAt);
        const monthKey = `${resultDate.getFullYear()}-${String(resultDate.getMonth() + 1).padStart(2, '0')}`;

        if (trendsData[monthKey]) {
          trendsData[monthKey].totalStudents.add(student.studentId._id.toString());
          const score = (result.correctAnswers / result.totalQuestions) * 100;
          trendsData[monthKey].scores.push(score);
        }
      });
    });

    // Calculate final statistics
    const trends = Object.keys(trendsData).map(key => {
      const data = trendsData[key];
      const participation = data.totalStudents.size;
      const averageScore = data.scores.length > 0 ?
        Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0;

      return {
        date: data.date,
        participation,
        averageScore
      };
    });

    return trends;
  } catch (error) {
    console.error('Error in getPerformanceTrends:', error);
    return [];
  }
};

// ✅ تصدير جميع الدوال
module.exports = {
  saveExamResult,
  getResultsByStudent,
  getExamHistory,
  getAllExamResults,
  getStudentsRankings,
  getStudentRankById,
  getStudentsByExam,
  getTopPerformers,
  getStudentsByExamId,
  getMonthlyComparison,
  getPerformanceTrends
};