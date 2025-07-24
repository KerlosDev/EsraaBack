const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const expressAsyncHandler = require('express-async-handler');
const crypto = require('crypto');
const User = require('../modules/userModule');

exports.signUp = expressAsyncHandler(async (req, res) => {
    const { name, phoneNumber, parentPhoneNumber, email, password, gender, level, government } = req.body;

    console.log('📥 Received signup request with data:', req.body);

    // Check if user exists
    const userExists = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (userExists) {
        console.log('⚠️ User already exists with email or phone:', email, phoneNumber);
        return res.status(400).json({ message: 'المستخدم موجود بالفعل' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('🔐 Password hashed successfully');

    const newUser = new User({
        name,
        phoneNumber,
        parentPhoneNumber,
        email,
        password: hashedPassword,
        gender,
        level,
        government
    });

    await newUser.save();
    console.log('✅ New user saved to database:', newUser._id);

    // Generate session token for single device login
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';

    // Update user with session info
    newUser.currentSessionToken = sessionToken;
    newUser.currentDeviceInfo = deviceInfo;
    newUser.sessionCreatedAt = new Date();
    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
        {
            id: newUser._id,
            role: newUser.role,
            sessionToken: sessionToken
        },
        process.env.JWT_SECRET || "secretkey",
        { expiresIn: '7d' }
    );

    console.log('🎟️ JWT Token generated:', token);

    res.status(201).json({
        message: 'تم إنشاء الحساب بنجاح',
        user: {
            id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            phoneNumber: newUser.phoneNumber,
            role: newUser.role
        },
        token
    });
});

exports.signIn = expressAsyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // ابحث عن المستخدم بالإيميل أو رقم الهاتف
    const user = await User.findOne({ email });

    if (!user) {
        return res.status(400).json({ message: 'البريد الإلكتروني أو رقم الهاتف غير صحيح' });
    }

    // تحقق من الباسورد
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });
    }

    // Check if user is banned
    if (user.isBanned) {
        return res.status(403).json({
            message: user.banReason || 'تم حظر حسابك من المنصة. يرجى التواصل مع الإدارة.',
            code: 'USER_BANNED',
            isBanned: true
        });
    }

    // Generate new session token for single device login
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';

    // Check if user is already logged in on another device
    const previousSessionExists = user.currentSessionToken && user.sessionCreatedAt;

    // Update user with new session info (this will invalidate previous session)
    user.currentSessionToken = sessionToken;
    user.currentDeviceInfo = deviceInfo;
    user.sessionCreatedAt = new Date();
    user.lastActive = new Date();
    await user.save();

    // توليد التوكن
    const token = jwt.sign(
        {
            id: user._id,
            role: user.role,
            sessionToken: sessionToken
        },
        process.env.JWT_SECRET || "secretkey",
        { expiresIn: '7d' }
    );

    const responseMessage = previousSessionExists
        ? 'تم تسجيل الدخول بنجاح - تم تسجيل الخروج من الجهاز الآخر'
        : 'تم تسجيل الدخول بنجاح';

    res.status(200).json({
        message: responseMessage,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role
        },
        token,
        wasLoggedOutFromOtherDevice: previousSessionExists
    });
});

exports.logout = expressAsyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (user) {
            // Clear session data
            user.currentSessionToken = null;
            user.currentDeviceInfo = null;
            user.sessionCreatedAt = null;
            await user.save();
        }

        res.status(200).json({
            message: 'تم تسجيل الخروج بنجاح'
        });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الخروج' });
    }
});

exports.protect = expressAsyncHandler(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        // Check if user is banned
        if (user.isBanned) {
            return res.status(403).json({
                message: user.banReason || 'تم حظر حسابك من المنصة. يرجى التواصل مع الإدارة.',
                code: "USER_BANNED",
                isBanned: true
            });
        }

        // Check if session token matches (single device login validation)
        if (!decoded.sessionToken || decoded.sessionToken !== user.currentSessionToken) {
            return res.status(401).json({
                message: "Session expired - logged in from another device",
                code: "SESSION_INVALID"
            });
        }

        // Update last active time
        user.lastActive = new Date();
        await user.save();

        req.user = {
            id: user._id,
            ...user.toObject(),
            role: user.role
        };
        next();
    } catch (error) {
        res.status(401).json({ message: "Not authorized or token failed" });
    }
});

exports.isAllow = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ message: "No user info available" });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "You do not have permission to perform this action" });
        }

        next();
    };
};

exports.isAdmin = exports.isAllow('admin');
exports.isAdminOrInstructor = exports.isAllow('admin', 'instructor');

// Optional authentication middleware - allows both authenticated and non-authenticated users
exports.optionalAuth = expressAsyncHandler(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    // If no token, continue without user data
    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            req.user = null;
            return next();
        }

        // Check if user is banned
        if (user.isBanned) {
            req.user = null;
            return next();
        }

        // Check if session token matches (single device login validation)
        if (!decoded.sessionToken || decoded.sessionToken !== user.currentSessionToken) {
            req.user = null;
            return next();
        }

        // Update last active time
        user.lastActive = new Date();
        await user.save();

        req.user = {
            _id: user._id,
            ...user.toObject(),
            role: user.role
        };
        next();
    } catch (error) {
        // If token is invalid, continue without user data
        req.user = null;
        next();
    }
});
