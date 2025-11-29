const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();

// 🔧 إعداد CORS محسن للغاية
app.use(cors({
    origin: function (origin, callback) {
        // السماح فقط لنطاقات التليجرام
        const allowedOrigins = [
            'https://web.telegram.org',
            'tg://',
            'telegram.org'
        ];
        
        if (!origin || allowedOrigins.some(allowed => origin.includes(allowed))) {
            callback(null, true);
        } else {
            console.log('🚫 محاولة دخول من مصدر غير مصرح به:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-Dynamic-Token', 'Authorization'],
    credentials: true,
    maxAge: 86400
}));

// معالجة طلبات OPTIONS
app.options('*', cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHkhaFLpI4J7uYL4xpAEp4_-hc5DnW5yno"; 

// 🔥 نظام الحماية المتقدم الجديد
class UltimateSecuritySystem {
    constructor() {
        this.blockedDevices = new Map();
        this.suspiciousActivities = new Map();
        this.deviceAccounts = new Map(); // جهاز -> حساب
        this.userDevices = new Map(); // مستخدم -> جهاز
        this.requestHistory = new Map();
        this.failedAttempts = new Map();
        
        // توقيعات التليجرام الرسمية فقط
        this.validUserAgents = [
            'TelegramBot (like TwitterBot)',
            'Mozilla/5.0 (iPhone; CPU iPhone OS',
            'Mozilla/5.0 (iPad; CPU OS ',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X',
            'Mozilla/5.0 (Linux; Android',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ];
        
        // أنماط الاسكربتات المحظورة
        this.scriptPatterns = [
            /python/i, /curl/i, /wget/i, /postman/i, /insomnia/i,
            /headless/i, /phantomjs/i, /selenium/i, /puppeteer/i,
            /bot/i, /crawler/i, /spider/i, /scraper/i,
            /sql.*injection/i, /xss/i, /csrf/i,
            /eval\(/i, /setTimeout\(/i, /setInterval\(/i,
            /document\./i, /window\./i, /alert\(/i,
            /<script>/i, /javascript:/i, /onclick=/i, /onload=/i
        ];
    }

    // 🔍 فحص متقدم للاسكربتات
    detectScripts(req) {
        const redFlags = [];
        
        // 1. فحص User-Agent
        const userAgent = req.headers['user-agent'] || '';
        const isValidAgent = this.validUserAgents.some(sig => 
            userAgent.includes(sig)
        );
        
        if (!isValidAgent) {
            redFlags.push('invalid_user_agent');
            console.log('🚫 User-Agent مشبوه:', userAgent);
        }

        // 2. فحص أنماط الاسكربتات في User-Agent
        const hasScriptPattern = this.scriptPatterns.some(pattern => 
            pattern.test(userAgent)
        );
        
        if (hasScriptPattern) {
            redFlags.push('script_pattern_detected');
            console.log('🚫 اكتشاف نمط اسكربت في User-Agent');
        }

        // 3. فحص الheaders الأساسية
        const requiredHeaders = [
            'accept-language',
            'accept-encoding',
            'sec-ch-ua',
            'sec-ch-ua-mobile',
            'sec-ch-ua-platform'
        ];
        
        requiredHeaders.forEach(header => {
            if (!req.headers[header]) {
                redFlags.push(`missing_${header}`);
            }
        });

        // 4. فحص توقيت الطلبات
        const deviceHash = this.generateDeviceHash(req);
        if (!this.recordRequest(deviceHash, req.path)) {
            redFlags.push('rate_limit_exceeded');
        }

        // 5. فحص حجم الطلب
        if (JSON.stringify(req.body).length > 5000) {
            redFlags.push('large_request_size');
        }

        return redFlags;
    }

    // 📱 التحقق من التليجرام فقط - إصدار أقوى
    validateTelegramOrigin(req) {
        const userAgent = req.headers['user-agent'] || '';
        const origin = req.headers['origin'] || '';
        const referer = req.headers['referer'] || '';
        
        // 1. فحص User-Agent
        const isTelegramAgent = this.validUserAgents.some(sig => 
            userAgent.includes(sig)
        );
        
        // 2. فحص المصدر
        const isTelegramOrigin = origin.includes('web.telegram.org') || 
                                origin.includes('telegram.org') ||
                                referer.includes('web.telegram.org');
        
        // 3. فحص إضافي للتليجرام ويب
        const isTelegramWeb = userAgent.includes('TelegramBot') || 
                             (userAgent.includes('Mozilla') && isTelegramOrigin);

        if (!isTelegramWeb) {
            const clientIP = this.getClientIP(req);
            console.log('🚫 محاولة دخول من خارج التليجرام:', {
                userAgent: userAgent.substring(0, 100),
                origin,
                referer,
                ip: clientIP,
                path: req.path
            });
            
            // تسجيل محاولة الدخول الفاشلة
            this.recordFailedAttempt(clientIP, 'non_telegram_access');
            return false;
        }
        
        return true;
    }

    // 🔒 نظام حظر تعدد الحسابات - إصدار أقوى
    registerDeviceUser(deviceHash, userId, initData) {
        // 1. التحقق من حظر الجهاز
        if (this.isDeviceBanned(deviceHash)) {
            console.log(`🚫 جهاز محاول مسبقاً: ${deviceHash}`);
            return { success: false, reason: 'device_banned' };
        }

        // 2. التحقق من وجود حساب آخر على نفس الجهاز
        const existingUser = this.deviceAccounts.get(deviceHash);
        if (existingUser && existingUser !== userId) {
            console.log(`🚫 محاولة تسجيل حساب ثاني على نفس الجهاز: ${deviceHash}`);
            console.log(`📱 المستخدم الحالي: ${existingUser}, المستخدم الجديد: ${userId}`);
            
            this.banDevice(deviceHash, 'multiple_accounts', 30 * 24 * 60 * 60 * 1000); // 30 يوم
            
            // حظر المستخدم الجديد أيضاً
            this.banDevice(userId, 'multiple_accounts_attempt', 7 * 24 * 60 * 60 * 1000); // 7 أيام
            
            return { success: false, reason: 'multiple_accounts' };
        }

        // 3. التحقق من وجود الجهاز على مستخدم آخر
        const existingDevice = this.userDevices.get(userId);
        if (existingDevice && existingDevice !== deviceHash) {
            console.log(`🚫 المستخدم حاول التسجيل على جهاز ثاني: ${userId}`);
            this.banDevice(userId, 'multiple_devices', 7 * 24 * 60 * 60 * 1000);
            return { success: false, reason: 'multiple_devices' };
        }

        // 4. التسجيل الناجح
        this.deviceAccounts.set(deviceHash, userId);
        this.userDevices.set(userId, deviceHash);
        
        console.log(`✅ تسجيل جهاز ناجح: ${deviceHash} -> ${userId}`);
        return { success: true };
    }

    // 🚫 حظر تلقائي للطلبات الخاطئة - إصدار أقوى
    recordError(deviceHash, errorType, details = {}) {
        if (!this.suspiciousActivities.has(deviceHash)) {
            this.suspiciousActivities.set(deviceHash, []);
        }
        
        const activities = this.suspiciousActivities.get(deviceHash);
        const activity = {
            type: errorType,
            timestamp: Date.now(),
            details: details,
            deviceHash: deviceHash
        };
        
        activities.push(activity);

        console.log(`⚠️  خطأ مسجل: ${errorType} للجهاز ${deviceHash}`);

        // نظام النقاط للأخطاء
        const errorPoints = {
            'invalid_initdata': 10,
            'rapid_requests': 8,
            'script_detected': 15,
            'suspicious_activity': 12,
            'multiple_accounts_attempt': 20,
            'non_telegram_access': 25
        };

        const points = errorPoints[errorType] || 5;
        this.addViolationPoints(deviceHash, points);

        // الحظر التلقائي عند تجاوز 30 نقطة
        const totalPoints = this.getViolationPoints(deviceHash);
        if (totalPoints >= 30) {
            this.banDevice(deviceHash, 'excessive_violations', 7 * 24 * 60 * 60 * 1000);
            return { banned: true, reason: 'excessive_violations' };
        }

        // الحظر التلقائي عند 5 أخطاء من نفس النوع
        const sameTypeErrors = activities.filter(a => a.type === errorType);
        if (sameTypeErrors.length >= 5) {
            this.banDevice(deviceHash, `repeated_${errorType}`, 24 * 60 * 60 * 1000);
            return { banned: true, reason: `repeated_${errorType}` };
        }

        return { banned: false, points: totalPoints };
    }

    // 📊 نظام تسجيل الطلبات المحسن
    recordRequest(deviceHash, endpoint) {
        const now = Date.now();
        const key = `${deviceHash}:${endpoint}`;
        
        if (!this.requestHistory.has(key)) {
            this.requestHistory.set(key, []);
        }
        
        const requests = this.requestHistory.get(key);
        requests.push(now);
        
        // احتفظ بطلبات آخر دقيقتين فقط
        const twoMinutesAgo = now - 2 * 60 * 1000;
        const recentRequests = requests.filter(time => time > twoMinutesAgo);
        this.requestHistory.set(key, recentRequests);
        
        // تحديد الحدود حسب النقطة
        const limits = {
            '/api/watch-ad': 10,    // 10 طلبات في دقيقتين
            '/api/withdraw': 3,     // 3 طلبات في دقيقتين  
            '/api/user': 15,        // 15 طلب في دقيقتين
            'default': 20           // 20 طلب في دقيقتين للنقاط الأخرى
        };
        
        const limit = limits[endpoint] || limits.default;
        
        if (recentRequests.length > limit) {
            console.log(`🚫 تجاوز حد الطلبات: ${endpoint} - ${recentRequests.length} طلبات`);
            this.recordError(deviceHash, 'rapid_requests', { 
                endpoint, 
                count: recentRequests.length,
                limit: limit 
            });
            return false;
        }
        
        return true;
    }

    // 🚫 نظام الحظر المحسن
    banDevice(deviceHash, reason, duration = 24 * 60 * 60 * 1000) {
        const banInfo = {
            reason: reason,
            bannedAt: Date.now(),
            expiresAt: Date.now() + duration,
            deviceHash: deviceHash
        };

        this.blockedDevices.set(deviceHash, banInfo);
        
        console.log(`🚫 تم حظر الجهاز ${deviceHash}: ${reason} لمدة ${duration / (60 * 60 * 1000)} ساعة`);
        
        // إرسال تنبيه للحظر
        this.sendBanAlert(deviceHash, reason, duration);
    }

    // 🔍 التحقق من الحظر
    isDeviceBanned(deviceHash) {
        const banInfo = this.blockedDevices.get(deviceHash);
        if (!banInfo) return false;

        if (Date.now() > banInfo.expiresAt) {
            this.blockedDevices.delete(deviceHash);
            console.log(`✅ انتهاء حظر الجهاز: ${deviceHash}`);
            return false;
        }

        return true;
    }

    // 📡 إنشاء بصمة الجهاز
    generateDeviceHash(req) {
        const fingerprintData = {
            userAgent: req.headers['user-agent'] || '',
            acceptLanguage: req.headers['accept-language'] || '',
            acceptEncoding: req.headers['accept-encoding'] || '',
            secCHUA: req.headers['sec-ch-ua'] || '',
            secCHUAMobile: req.headers['sec-ch-ua-mobile'] || '',
            secCHUAPlatform: req.headers['sec-ch-ua-platform'] || '',
            ip: this.getClientIP(req),
            timestamp: Date.now()
        };

        return crypto
            .createHash('sha512')
            .update(JSON.stringify(fingerprintData))
            .digest('hex')
            .substring(0, 32);
    }

    // 📍 الحصول على IP العميل
    getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               'unknown';
    }

    // ⚡ نظام النقاط للمخالفات
    addViolationPoints(deviceHash, points) {
        const key = `violation_points:${deviceHash}`;
        const currentPoints = this.failedAttempts.get(key) || 0;
        this.failedAttempts.set(key, currentPoints + points);
        
        // انتهاء الصلاحية بعد 24 ساعة
        setTimeout(() => {
            this.failedAttempts.delete(key);
        }, 24 * 60 * 60 * 1000);
    }

    getViolationPoints(deviceHash) {
        const key = `violation_points:${deviceHash}`;
        return this.failedAttempts.get(key) || 0;
    }

    // 📧 تسجيل المحاولات الفاشلة
    recordFailedAttempt(identifier, reason) {
        const key = `failed_attempts:${identifier}`;
        const attempts = this.failedAttempts.get(key) || 0;
        this.failedAttempts.set(key, attempts + 1);

        // حظر تلقائي بعد 10 محاولات فاشلة
        if (attempts + 1 >= 10) {
            this.banDevice(identifier, 'excessive_failed_attempts', 60 * 60 * 1000); // ساعة واحدة
        }
    }

    // 🔔 إرسال تنبيهات الحظر
    sendBanAlert(deviceHash, reason, duration) {
        console.log(`🚨 تنبيه حظر: ${deviceHash} - ${reason} - ${duration / (60 * 60 * 1000)}h`);
        // هنا يمكنك إضافة إرسال إشعار للتليجرام
    }

    // 📊 إحصائيات الحماية
    getSecurityStats() {
        return {
            blockedDevices: this.blockedDevices.size,
            suspiciousActivities: this.suspiciousActivities.size,
            deviceAccounts: this.deviceAccounts.size,
            userDevices: this.userDevices.size,
            requestHistory: this.requestHistory.size,
            failedAttempts: this.failedAttempts.size
        };
    }
}

// 🌟 نظام إدارة قاعدة البيانات المحسن
class SecureDatabaseManager {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.initialized = false;
        this.initPromise = this.init();
    }

    async init() {
        try {
            console.log('🔧 بدء تهيئة اتصال قاعدة البيانات...');
            
            this.pool = new Pool({
                connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 15000,
                idleTimeoutMillis: 30000,
                max: 10,
                min: 2,
            });

            await this.testConnection();
            this.isConnected = true;
            this.retryCount = 0;
            this.initialized = true;
            console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
            
        } catch (error) {
            console.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
            await this.handleConnectionError(error);
        }
    }

    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time');
            console.log('🕒 وقت قاعدة البيانات:', result.rows[0].current_time);
        } finally {
            client.release();
        }
    }

    async handleConnectionError(error) {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            console.log(`🔄 محاولة إعادة الاتصال ${this.retryCount}/${this.maxRetries}...`);
            const delay = Math.min(3000 * this.retryCount, 15000);
            await new Promise(resolve => setTimeout(resolve, delay));
            await this.init();
        } else {
            console.error('❌ فشل جميع محاولات الاتصال بقاعدة البيانات');
        }
    }

    async waitForInitialization() {
        if (!this.initialized) {
            console.log('⏳ انتظار تهيئة قاعدة البيانات...');
            await this.initPromise;
        }
    }

    async query(text, params) {
        await this.waitForInitialization();
        
        if (!this.isConnected) {
            throw new Error('قاعدة البيانات غير متصلة');
        }
        
        try {
            const result = await this.pool.query(text, params);
            return result;
        } catch (error) {
            console.error('❌ خطأ في استعلام قاعدة البيانات:', error.message);
            throw error;
        }
    }

    async connect() {
        await this.waitForInitialization();
        return await this.pool.connect();
    }

    async healthCheck() {
        try {
            await this.query('SELECT 1 as health_check');
            return true;
        } catch (error) {
            console.error('❌ فحص صحة قاعدة البيانات فشل:', error.message);
            return false;
        }
    }
}

// تهيئة أنظمة الحماية وقاعدة البيانات
const securitySystem = new UltimateSecuritySystem();
const dbManager = new SecureDatabaseManager();

// 🔧 نظام التوكن الديناميكي
class DynamicTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenCounter = 0;
        this.intervalId = null;
        
        this.config = {
            tokenRefreshInterval: 8000, // 8 ثواني
            tokenValidityWindow: 20000, // 20 ثانية
            secretKey: 'ton-rewards-ultimate-security-2024'
        };
    }

    generateToken() {
        const timestamp = Date.now();
        this.tokenCounter++;
        
        const tokenData = {
            timestamp,
            counter: this.tokenCounter,
            random: crypto.randomBytes(32).toString('hex')
        };

        const tokenString = JSON.stringify(tokenData);
        const token = crypto
            .createHmac('sha512', this.config.secretKey)
            .update(tokenString)
            .digest('hex')
            .substring(0, 64);

        const tokenObject = {
            token,
            timestamp,
            expiresAt: timestamp + this.config.tokenValidityWindow,
            counter: this.tokenCounter
        };

        return tokenObject;
    }

    start() {
        console.log('🚀 بدء نظام التوكن الديناميكي المتقدم...');
        this.updateToken();
        
        this.intervalId = setInterval(() => {
            this.updateToken();
        }, this.config.tokenRefreshInterval);
    }

    updateToken() {
        const newToken = this.generateToken();
        this.tokens.set(newToken.token, newToken);
        this.currentToken = newToken.token;
        this.cleanExpiredTokens();
        
        console.log(`🔄 تحديث التوكن #${newToken.counter}`);
    }

    cleanExpiredTokens() {
        const now = Date.now();
        for (let [token, data] of this.tokens.entries()) {
            if (data.expiresAt < now) {
                this.tokens.delete(token);
            }
        }
    }

    validateToken(token) {
        if (!token || token.length < 10) {
            return false;
        }

        const tokenData = this.tokens.get(token);
        if (!tokenData) {
            return false;
        }
        
        const now = Date.now();
        if (tokenData.expiresAt < now) {
            this.tokens.delete(token);
            return false;
        }
        
        return true;
    }

    getCurrentToken() {
        return this.currentToken;
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

const tokenSystem = new DynamicTokenSystem();
tokenSystem.start();

// الإعدادات
const config = {
    adValue: 0.0001,
    dailyAdLimit: 100,
    minWithdrawal: 0.0001,
    referralBonus: 0.0005,
    contestAdPoints: 1,
    contestReferralPoints: 15,
    botUsername: "UfnpBot_bot",
    minimumWithdrawReferrals: 0
};

// دوال مساعدة
function validateTelegramInitData(initData) {
    try {
        if (!initData) {
            return false;
        }

        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        
        const hash = parsedData.hash;
        if (!hash) {
            return false;
        }

        const dataToCheck = [];
        for (const [key, value] of Object.entries(parsedData)) {
            if (key !== 'hash' && value) {
                dataToCheck.push(`${key}=${value}`);
            }
        }
        
        dataToCheck.sort();
        const dataCheckString = dataToCheck.join('\n');
        
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        const expectedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        return expectedHash === hash;
    } catch (error) {
        console.error('❌ خطأ في التحقق من التوقيع:', error);
        return false;
    }
}

function parseTelegramUser(initData) {
    try {
        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        
        if (parsedData.user) {
            return JSON.parse(parsedData.user);
        }
        return null;
    } catch (error) {
        console.error('❌ خطأ في تحليل بيانات المستخدم:', error);
        return null;
    }
}

async function getUserFromDB(userId) {
    try {
        const result = await dbManager.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدم:', error);
        return null;
    }
}

async function createUserInDB(userData) {
    try {
        const result = await dbManager.query(
            `INSERT INTO bot_users (telegram_id, username, first_name, balance, earning_wallet, total_earned) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING *`,
            [
                userData.telegram_id,
                userData.username,
                userData.first_name,
                0,
                0,
                0
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        return null;
    }
}
// 🛡️ نظام الحماية المتوسط - الطبقة الأولى
const ultimateSecurityMiddleware = (req, res, next) => {
    const publicEndpoints = [
        '/', 
        '/api/token/current', 
        '/api/token/stats', 
        '/api/config',
        '/api/database/status', 
        '/api/health', 
        '/api/security/status',
        '/api/security/stats'
    ];
    
    const isPublicEndpoint = publicEndpoints.some(endpoint => req.path === endpoint);
    
    if (isPublicEndpoint) {
        return next();
    }

    const clientIP = securitySystem.getClientIP(req);
    const deviceHash = securitySystem.generateDeviceHash(req);

    // 1. 🔒 التحقق من التليجرام فقط - الطبقة الأولى
    if (!securitySystem.validateTelegramOrigin(req)) {
        securitySystem.recordFailedAttempt(clientIP, 'non_telegram_access_blocked');
        return res.status(403).json({ 
            success: false,
            error: 'الوصول مسموح عبر التليجرام فقط',
            code: 'TELEGRAM_ONLY'
        });
    }

    // 2. 🚫 التحقق من حظر الجهاز
    if (securitySystem.isDeviceBanned(deviceHash)) {
        console.log(`🚫 طلب من جهاز محظور: ${deviceHash}`);
        return res.status(403).json({ 
            success: false,
            error: 'تم حظر هذا الجهاز',
            code: 'DEVICE_BANNED'
        });
    }

    // 3. 🔍 فحص الاسكربتات - الطبقة الأولى
    const scriptRedFlags = securitySystem.detectScripts(req);
    if (scriptRedFlags.length > 0) {
        console.log(`🚫 اكتشاف اسكربت: ${scriptRedFlags.join(', ')}`);
        
        const banResult = securitySystem.recordError(deviceHash, 'script_detected', {
            redFlags: scriptRedFlags,
            userAgent: req.headers['user-agent'],
            ip: clientIP
        });
        
        if (banResult.banned) {
            return res.status(403).json({ 
                success: false,
                error: 'تم اكتشاف نشاط مشبوه',
                code: 'SCRIPT_DETECTED'
            });
        }
    }

    // 4. 🔑 التحقق من التوكن للطلبات الخاصة
    const privateEndpoints = [
        '/api/watch-ad',
        '/api/withdraw', 
        '/api/move-to-balance',
        '/api/user',
        '/api/register'
    ];

    if (privateEndpoints.includes(req.path)) {
        const token = req.headers['x-dynamic-token'] || 
                      req.headers['authorization']?.replace('Bearer ', '');
        
        if (!token) {
            securitySystem.recordError(deviceHash, 'missing_token');
            return res.status(401).json({ 
                success: false,
                error: 'التوكن الديناميكي مطلوب',
                code: 'TOKEN_REQUIRED'
            });
        }

        if (!tokenSystem.validateToken(token)) {
            securitySystem.recordError(deviceHash, 'invalid_token');
            return res.status(401).json({ 
                success: false,
                error: 'توكن غير صالح أو منتهي',
                code: 'INVALID_TOKEN'
            });
        }
    }

    // 5. 📊 تسجيل الطلب
    if (!securitySystem.recordRequest(deviceHash, req.path)) {
        return res.status(429).json({ 
            success: false,
            error: 'تم تجاوز حد الطلبات المسموح به',
            code: 'RATE_LIMIT_EXCEEDED'
        });
    }

    next();
};

// 🛡️ نظام الحماية المتوسط - الطبقة الثانية (لطلبات POST)
const postRequestSecurityMiddleware = (req, res, next) => {
    if (req.method !== 'POST') {
        return next();
    }

    const deviceHash = securitySystem.generateDeviceHash(req);
    const clientIP = securitySystem.getClientIP(req);

    // 1. 🔒 فحص initData لطلبات POST
    if (req.body && req.body.initData) {
        // فحص صحة initData
        if (!validateTelegramInitData(req.body.initData)) {
            const banResult = securitySystem.recordError(deviceHash, 'invalid_initdata', {
                ip: clientIP,
                path: req.path
            });
            
            return res.status(401).json({ 
                success: false,
                error: 'بيانات الدخول غير صالحة',
                code: 'INVALID_INITDATA'
            });
        }

        // فحص وتسجيل الجهاز والمستخدم
        const telegramUser = parseTelegramUser(req.body.initData);
        if (telegramUser?.id) {
            const registrationResult = securitySystem.registerDeviceUser(
                deviceHash, 
                telegramUser.id.toString(), 
                req.body.initData
            );
            
            if (!registrationResult.success) {
                return res.status(403).json({ 
                    success: false,
                    error: 'تم رفض الطلب لأسباب أمنية',
                    code: 'REGISTRATION_FAILED',
                    reason: registrationResult.reason
                });
            }
        }
    }

    // 2. 🔍 فحص إضافي للطلب
    const requestAnalysis = analyzePostRequest(req);
    if (requestAnalysis.isSuspicious) {
        securitySystem.recordError(deviceHash, 'suspicious_post_request', {
            analysis: requestAnalysis,
            ip: clientIP
        });
        
        return res.status(400).json({ 
            success: false,
            error: 'طلب مشبوه تم رفضه',
            code: 'SUSPICIOUS_REQUEST'
        });
    }

    next();
};

// 🔍 تحليل متقدم لطلبات POST
function analyzePostRequest(req) {
    const analysis = {
        isSuspicious: false,
        reasons: [],
        riskScore: 0
    };

    // فحص الجسم
    if (req.body) {
        const bodyStr = JSON.stringify(req.body).toLowerCase();
        
        // أنماط خطيرة
        const dangerousPatterns = [
            /<script>/i, /javascript:/i, /eval\(/i, /document\./i,
            /window\./i, /alert\(/i, /onclick=/i, /onload=/i,
            /drop table/i, /union select/i, /1=1/i, /or 1=1/i,
            /<\/script>/i, /vbscript:/i, /onmouseover=/i
        ];

        dangerousPatterns.forEach(pattern => {
            if (pattern.test(bodyStr)) {
                analysis.reasons.push(`dangerous_pattern: ${pattern}`);
                analysis.riskScore += 20;
            }
        });

        // فحص الأحجام
        if (bodyStr.length > 10000) {
            analysis.reasons.push('large_body_size');
            analysis.riskScore += 15;
        }

        // فحص الحقول غير المتوقعة
        const expectedFields = {
            '/api/watch-ad': ['initData'],
            '/api/withdraw': ['initData', 'amount', 'walletAddress'],
            '/api/register': ['initData'],
            '/api/move-to-balance': ['initData']
        };

        const expected = expectedFields[req.path];
        if (expected) {
            const bodyFields = Object.keys(req.body);
            const unexpectedFields = bodyFields.filter(field => !expected.includes(field));
            
            if (unexpectedFields.length > 0) {
                analysis.reasons.push(`unexpected_fields: ${unexpectedFields.join(',')}`);
                analysis.riskScore += 10;
            }
        }
    }

    analysis.isSuspicious = analysis.riskScore >= 25;
    return analysis;
}

// تطبيق أنظمة الحماية
app.use(ultimateSecurityMiddleware);
app.use(postRequestSecurityMiddleware);

// 📊 المسارات العامة
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 TON Rewards Backend - Ultimate Security System',
        version: '2.0.0',
        security: 'ENABLED',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await dbManager.healthCheck();
        const securityStats = securitySystem.getSecurityStats();
        
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbStatus ? 'connected' : 'disconnected',
            security: {
                level: 'ULTIMATE',
                blockedDevices: securityStats.blockedDevices,
                suspiciousActivities: securityStats.suspiciousActivities,
                deviceAccounts: securityStats.deviceAccounts
            },
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
});

app.get('/api/security/status', (req, res) => {
    const stats = securitySystem.getSecurityStats();
    
    res.json({
        success: true,
        security: {
            system: 'ULTIMATE_SECURITY_SYSTEM',
            blockedDevices: stats.blockedDevices,
            suspiciousActivities: stats.suspiciousActivities,
            deviceAccounts: stats.deviceAccounts,
            userDevices: stats.userDevices,
            activeSessions: stats.deviceAccounts.size
        },
        features: {
            telegramOnly: true,
            deviceFingerprinting: true,
            multipleAccountsPrevention: true,
            scriptDetection: true,
            rateLimiting: true,
            autoBanSystem: true
        }
    });
});

app.get('/api/security/stats', (req, res) => {
    const stats = securitySystem.getSecurityStats();
    
    res.json({
        success: true,
        stats: stats,
        tokenSystem: tokenSystem.tokens.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/token/current', (req, res) => {
    res.json({
        success: true,
        token: tokenSystem.getCurrentToken(),
        activeTokens: tokenSystem.tokens.size
    });
});

app.get('/api/token/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            activeTokens: tokenSystem.tokens.size,
            refreshInterval: tokenSystem.config.tokenRefreshInterval,
            validityWindow: tokenSystem.config.tokenValidityWindow
        }
    });
});

app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: config
    });
});

app.get('/api/database/status', async (req, res) => {
    try {
        const status = await dbManager.healthCheck();
        res.json({
            success: true,
            connected: status,
            initialized: dbManager.initialized
        });
    } catch (error) {
        res.json({
            success: false,
            connected: false,
            error: error.message
        });
    }
});

// 👤 نظام المستخدمين مع الحماية
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        if (!initData) {
            return res.status(400).json({ 
                success: false,
                error: 'initData مطلوب' 
            });
        }

        // التحقق الإضافي
        const deviceHash = securitySystem.generateDeviceHash(req);
        const telegramUser = parseTelegramUser(initData);
        
        if (telegramUser?.id !== userId) {
            securitySystem.recordError(deviceHash, 'user_id_mismatch');
            return res.status(400).json({ 
                success: false,
                error: 'عدم تطابق بيانات المستخدم' 
            });
        }

        let user = await getUserFromDB(userId);
        let isNewUser = false;
        
        if (!user) {
            const telegramUser = parseTelegramUser(initData);
            
            if (telegramUser?.id) {
                const newUser = {
                    telegram_id: telegramUser.id.toString(),
                    username: telegramUser.username || '',
                    first_name: telegramUser.first_name || 'مستخدم'
                };

                user = await createUserInDB(newUser);
                isNewUser = true;
            }
        }

        if (user) {
            const userRRBalance = Math.floor((parseFloat(user.earning_wallet || 0) * 10000000));
            
            res.json({ 
                success: true, 
                user: {
                    id: user.telegram_id,
                    firstName: user.first_name,
                    username: user.username,
                    balance: parseFloat(user.balance || 0),
                    earningWallet: parseFloat(user.earning_wallet || 0),
                    dailyAdCount: user.daily_ad_count || 0,
                    totalEarned: parseFloat(user.total_earned || 0),
                    userRRBalance: userRRBalance
                },
                isNewUser: isNewUser
            });
        } else {
            res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات المستخدم:', error.message);
        
        const deviceHash = securitySystem.generateDeviceHash(req);
        securitySystem.recordError(deviceHash, 'get_user_error', {
            error: error.message
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user data' 
        });
    }
});

// 👤 تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    try {
        const { initData } = req.body;

        if (!validateTelegramInitData(initData)) {
            const deviceHash = securitySystem.generateDeviceHash(req);
            securitySystem.recordError(deviceHash, 'invalid_registration_initdata');
            
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }
        
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
        const deviceHash = securitySystem.generateDeviceHash(req);
        
        let user = await getUserFromDB(userId);
        
        if (user) {
            const userRRBalance = Math.floor((parseFloat(user.earning_wallet || 0) * 10000000));
            
            return res.json({ 
                success: true, 
                user: {
                    id: user.telegram_id,
                    firstName: user.first_name,
                    username: user.username,
                    balance: parseFloat(user.balance || 0),
                    earningWallet: parseFloat(user.earning_wallet || 0),
                    dailyAdCount: user.daily_ad_count || 0,
                    totalEarned: parseFloat(user.total_earned || 0),
                    userRRBalance: userRRBalance
                },
                message: `مرحباً بعودتك ${user.first_name}!`
            });
        }

        const newUser = {
            telegram_id: userId,
            username: telegramUser.username || '',
            first_name: telegramUser.first_name || 'مستخدم'
        };

        user = await createUserInDB(newUser);

        if (user) {
            // تسجيل الجهاز بعد التسجيل الناجح
            securitySystem.registerDeviceUser(deviceHash, userId, initData);
            
            res.json({ 
                success: true, 
                user: {
                    id: user.telegram_id,
                    firstName: user.first_name,
                    username: user.username,
                    balance: parseFloat(user.balance || 0),
                    earningWallet: parseFloat(user.earning_wallet || 0),
                    dailyAdCount: user.daily_ad_count || 0,
                    totalEarned: parseFloat(user.total_earned || 0),
                    userRRBalance: 0
                },
                message: `🎉 أهلاً وسهلاً ${user.first_name}!`
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Failed to create user' 
            });
        }

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error.message);
        
        const deviceHash = securitySystem.generateDeviceHash(req);
        securitySystem.recordError(deviceHash, 'registration_error', {
            error: error.message
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Registration failed' 
        });
    }
});
// 📺 مشاهدة إعلان مع حماية متقدمة
app.post('/api/watch-ad', async (req, res) => {
    let client;
    
    try {
        const { initData } = req.body;

        console.log('📥 طلب مشاهدة إعلان مع الحماية');

        if (!initData) {
            const deviceHash = securitySystem.generateDeviceHash(req);
            securitySystem.recordError(deviceHash, 'missing_initdata_watchad');
            return res.status(400).json({ 
                success: false,
                error: 'initData is required' 
            });
        }

        // 🔒 تحقق إضافي من التوقيع
        if (!validateTelegramInitData(initData)) {
            const deviceHash = securitySystem.generateDeviceHash(req);
            const banResult = securitySystem.recordError(deviceHash, 'invalid_watchad_signature');
            
            console.log('❌ فشل التحقق - رفض مشاهدة الإعلان');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة مشاهدة الإعلان');
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
        const deviceHash = securitySystem.generateDeviceHash(req);
        console.log(`👤 معالجة مشاهدة إعلان للمستخدم: ${userId}`);
        
        // 🔒 تحقق إضافي من الجهاز
        const deviceCheck = securitySystem.registerDeviceUser(deviceHash, userId, initData);
        if (!deviceCheck.success) {
            return res.status(403).json({ 
                success: false,
                error: 'تم رفض الطلب لأسباب أمنية',
                code: 'DEVICE_CHECK_FAILED'
            });
        }

        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1 FOR UPDATE',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log('❌ المستخدم غير موجود - يجب التسجيل أولاً');
            return res.status(404).json({ 
                success: false,
                error: 'User not found - Please register first' 
            });
        }

        const user = userResult.rows[0];

        const today = new Date().toDateString();
        const lastAdDate = user.last_ad_date ? new Date(user.last_ad_date).toDateString() : null;
        
        let dailyAdCount = user.daily_ad_count || 0;
        if (lastAdDate !== today) {
            dailyAdCount = 0;
        }

        if (dailyAdCount >= config.dailyAdLimit) {
            await client.query('ROLLBACK');
            console.log('❌ وصل للحد اليومي للإعلانات');
            return res.status(400).json({ 
                success: false,
                error: 'Daily ad limit reached' 
            });
        }

        const adReward = config.adValue;
        
        console.log(`💰 مكافأة الإعلان: ${adReward} TON للمستخدم ${userId}`);
        
        const updateResult = await client.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1,
                daily_ad_count = $2,
                last_ad_date = CURRENT_DATE,
                last_ad_timestamp = CURRENT_TIMESTAMP
             WHERE telegram_id = $3 
             RETURNING *`,
            [adReward, dailyAdCount + 1, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            try {
                // تحديث المسابقة
                const existingContest = await client.query(
                    'SELECT * FROM contest_leaderboard WHERE user_id = $1',
                    [userId]
                );

                if (existingContest.rows.length > 0) {
                    await client.query(`
                        UPDATE contest_leaderboard SET 
                            points = points + 1,
                            ads_watched = ads_watched + 1,
                            last_activity = CURRENT_TIMESTAMP
                        WHERE user_id = $1
                    `, [userId]);
                } else {
                    await client.query(`
                        INSERT INTO contest_leaderboard 
                        (user_id, username, first_name, points, ads_watched, last_activity)
                        VALUES ($1, $2, $3, 1, 1, CURRENT_TIMESTAMP)
                    `, [userId, user.username || '', user.first_name || 'User']);
                }
                
                console.log('✅ تمت مشاهدة الإعلان بنجاح + نقطة مسابقة واحدة');
            } catch (contestError) {
                console.log('⚠️  خطأ في تحديث المسابقة:', contestError.message);
            }

            await client.query('COMMIT');
            
            const userRRBalance = Math.floor((parseFloat(updatedUser.earning_wallet || 0) * 10000000));
            
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (dailyAdCount + 1),
                totalEarned: parseFloat(updatedUser.total_earned || 0),
                contestPoints: 1,
                userRRBalance: userRRBalance
            });
        } else {
            await client.query('ROLLBACK');
            console.log('❌ فشل في معالجة الإعلان');
            res.status(500).json({ 
                success: false,
                error: 'Failed to process ad' 
            });
        }

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في مشاهدة الإعلان:', error.message);
        
        const deviceHash = securitySystem.generateDeviceHash(req);
        securitySystem.recordError(deviceHash, 'watch_ad_error', {
            error: error.message
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to process ad' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 💰 تحويل المحفظة إلى الرصيد
app.post('/api/move-to-balance', async (req, res) => {
    try {
        const { initData } = req.body;

        console.log('📥 طلب تحويل الرصيد');

        if (!validateTelegramInitData(initData)) {
            const deviceHash = securitySystem.generateDeviceHash(req);
            securitySystem.recordError(deviceHash, 'invalid_move_balance_signature');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة التحويل');
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
        const deviceHash = securitySystem.generateDeviceHash(req);
        console.log(`👤 معالجة تحويل الرصيد للمستخدم: ${userId}`);
        
        const user = await getUserFromDB(userId);
        
        if (!user) {
            console.log('❌ المستخدم غير موجود');
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const earningWallet = parseFloat(user.earning_wallet || 0);
        console.log(`💰 الرصيد المتاح للتحويل: ${earningWallet} TON`);
        
        if (earningWallet < 0.0001) {
            console.log('❌ الرصيد غير كافي للتحويل');
            return res.status(400).json({ 
                success: false,
                error: 'Minimum 0.0001 TON required' 
            });
        }

        const updateResult = await dbManager.query(
            `UPDATE bot_users SET 
                balance = COALESCE(balance, 0) + $1,
                earning_wallet = 0
             WHERE telegram_id = $2 
             RETURNING *`,
            [earningWallet, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            console.log('✅ تم تحويل الرصيد بنجاح');
            res.json({
                success: true,
                newBalance: parseFloat(updatedUser.balance || 0),
                earningWallet: 0
            });
        } else {
            console.log('❌ فشل في تحويل الرصيد');
            res.status(500).json({ 
                success: false,
                error: 'Transfer failed' 
            });
        }

    } catch (error) {
        console.error('❌ خطأ في تحويل الرصيد:', error.message);
        
        const deviceHash = securitySystem.generateDeviceHash(req);
        securitySystem.recordError(deviceHash, 'move_balance_error', {
            error: error.message
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Transfer failed' 
        });
    }
});

// 💳 طلب سحب مع حماية متقدمة
app.post('/api/withdraw', async (req, res) => {
    let client;
    
    try {
        const { initData, amount, walletAddress, method = 'TON Wallet', memo = '' } = req.body;

        console.log('📥 طلب سحب مع الحماية:', { amount, method });

        if (!initData || !amount || !walletAddress) {
            const deviceHash = securitySystem.generateDeviceHash(req);
            securitySystem.recordError(deviceHash, 'missing_withdrawal_data');
            return res.status(400).json({
                success: false,
                error: 'بيانات ناقصة: initData, amount, walletAddress مطلوبة'
            });
        }

        if (!validateTelegramInitData(initData)) {
            const deviceHash = securitySystem.generateDeviceHash(req);
            securitySystem.recordError(deviceHash, 'invalid_withdrawal_signature');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة السحب');
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
        const deviceHash = securitySystem.generateDeviceHash(req);
        console.log(`👤 معالجة سحب للمستخدم: ${userId}`);
        
        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1 FOR UPDATE',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log('❌ المستخدم غير موجود');
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const user = userResult.rows[0];
        const userBalance = parseFloat(user.balance || 0);
        const withdrawAmount = parseFloat(amount);
        
        console.log(`💰 رصيد المستخدم: ${userBalance} TON`);
        console.log(`💸 مبلغ السحب: ${withdrawAmount} TON`);

        if (userBalance < withdrawAmount) {
            await client.query('ROLLBACK');
            console.log('❌ رصيد غير كافي');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance' 
            });
        }

        let minWithdrawal = config.minWithdrawal;
        if (method === 'TON Wallet') {
            minWithdrawal = 0.05;
        }

        if (withdrawAmount < minWithdrawal) {
            await client.query('ROLLBACK');
            console.log(`❌ الحد الأدنى للسحب ${minWithdrawal} TON`);
            return res.status(400).json({ 
                success: false,
                error: `Minimum withdrawal is ${minWithdrawal} TON` 
            });
        }

        await client.query(
            'UPDATE bot_users SET balance = balance - $1 WHERE telegram_id = $2',
            [withdrawAmount, userId]
        );

        const withdrawalResult = await client.query(
            `INSERT INTO withdrawals 
             (user_id, amount, wallet_address, status, method, memo) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING *`,
            [userId, withdrawAmount, walletAddress, 'pending', method, memo || '']
        );

        await client.query('COMMIT');

        const withdrawal = withdrawalResult.rows[0];
        
        console.log('✅ تم إنشاء طلب السحب بنجاح:', withdrawal.id);
        
        res.json({
            success: true,
            withdrawalId: withdrawal.id,
            newBalance: userBalance - withdrawAmount,
            message: 'تم تقديم طلب السحب بنجاح وسيتم معالجته خلال 24 ساعة'
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في السحب:', error.message);
        
        const deviceHash = securitySystem.generateDeviceHash(req);
        securitySystem.recordError(deviceHash, 'withdrawal_error', {
            error: error.message
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 📋 الحصول على تاريخ السحوبات
app.get('/api/withdrawals/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        console.log(`📥 طلب تاريخ السحوبات للمستخدم: ${userId}`);

        if (!validateTelegramInitData(initData)) {
            const deviceHash = securitySystem.generateDeviceHash(req);
            securitySystem.recordError(deviceHash, 'invalid_withdrawals_signature');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة الطلب');
        
        const withdrawals = await dbManager.query(
            `SELECT 
                id,
                user_id,
                amount,
                wallet_address,
                status,
                method,
                memo,
                created_at
             FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [userId]
        );

        console.log(`📊 عدد السحوبات: ${withdrawals.rows.length}`);
        
        const processedWithdrawals = withdrawals.rows.map(w => {
            let createdAt;
            
            try {
                if (w.created_at instanceof Date) {
                    createdAt = w.created_at.toISOString();
                } else if (typeof w.created_at === 'string') {
                    createdAt = new Date(w.created_at).toISOString();
                } else {
                    createdAt = new Date().toISOString();
                }
            } catch (error) {
                console.log('⚠️  خطأ في معالجة التاريخ:', error);
                createdAt = new Date().toISOString();
            }
            
            return {
                id: w.id,
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                method: w.method,
                memo: w.memo || '',
                createdat: createdAt
            };
        });
        
        res.json({
            success: true,
            withdrawals: processedWithdrawals
        });

    } catch (error) {
        console.error('❌ خطأ في جلب تاريخ السحوبات:', error.message);
        
        const deviceHash = securitySystem.generateDeviceHash(req);
        securitySystem.recordError(deviceHash, 'get_withdrawals_error', {
            error: error.message
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
    }
});

// 🏆 نظام المسابقة
app.post('/api/contest/update-points', async (req, res) => {
    try {
        const { userId, points = 1, adsWatched = 1, referralsCount = 0 } = req.body;
        
        console.log(`🔄 تحديث نقاط المسابقة للمستخدم: ${userId}`, { points, adsWatched, referralsCount });
        
        const userResult = await dbManager.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS contest_leaderboard (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                points INTEGER DEFAULT 0,
                ads_watched INTEGER DEFAULT 0,
                referrals_count INTEGER DEFAULT 0,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const actualPoints = 1;
        const actualAds = 1;
        
        const result = await dbManager.query(`
            INSERT INTO contest_leaderboard 
            (user_id, username, first_name, points, ads_watched, referrals_count, last_activity)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                points = contest_leaderboard.points + $4,
                ads_watched = contest_leaderboard.ads_watched + $5,
                referrals_count = contest_leaderboard.referrals_count + $6,
                last_activity = EXCLUDED.last_activity
            RETURNING *
        `, [userId, user.username || '', user.first_name || 'User', actualPoints, actualAds, referralsCount]);
        
        console.log('✅ تم تحديث المسابقة بنجاح:', result.rows[0]);
        
        res.json({
            success: true,
            contestData: result.rows[0],
            message: 'تم تحديث نقاط المسابقة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث نقاط المسابقة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب المتصدرين
app.get('/api/contest/leaderboard', async (req, res) => {
    try {
        const leaderboard = await dbManager.query(`
            SELECT 
                cl.*,
                bu.username,
                bu.first_name,
                ROW_NUMBER() OVER (ORDER BY cl.points DESC, cl.last_activity DESC) as rank
            FROM contest_leaderboard cl
            LEFT JOIN bot_users bu ON cl.user_id = bu.telegram_id
            ORDER BY cl.points DESC, cl.last_activity DESC
            LIMIT 50
        `);
        
        console.log(`📊 جلب ${leaderboard.rows.length} متسابق من المسابقة`);
        
        res.json({
            success: true,
            leaderboard: leaderboard.rows,
            totalParticipants: leaderboard.rows.length,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المتصدرين:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب ترتيب مستخدم
app.get('/api/contest/user-rank/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const rankResult = await dbManager.query(`
            SELECT position FROM (
                SELECT user_id, ROW_NUMBER() OVER (ORDER BY points DESC, last_activity DESC) as position
                FROM contest_leaderboard
            ) ranked WHERE user_id = $1
        `, [userId]);
        
        const userRank = rankResult.rows.length > 0 ? rankResult.rows[0].position : 0;
        
        console.log(`🏆 ترتيب المستخدم ${userId}: ${userRank}`);
        
        res.json({
            success: true,
            userId: userId,
            rank: userRank,
            inLeaderboard: userRank > 0
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الترتيب:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب بيانات مسابقة مستخدم
app.get('/api/contest/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const result = await dbManager.query(`
            SELECT * FROM contest_leaderboard 
            WHERE user_id = $1
        `, [userId]);
        
        if (result.rows.length > 0) {
            res.json({ success: true, contestData: result.rows[0] });
        } else {
            res.json({ success: true, contestData: null });
        }
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات مسابقة المستخدم:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 👥 نظام الإحالات
app.post('/api/referrals/add', async (req, res) => {
    try {
        const { referrerId, referredId } = req.body;
        
        console.log(`👥 محاولة إضافة إحالة: ${referrerId} أحال ${referredId}`);
        
        const referredUser = await getUserFromDB(referredId);
        if (!referredUser) {
            return res.status(404).json({ success: false, error: 'Referred user not found' });
        }
        
        const existingReferral = await dbManager.query(
            'SELECT * FROM referrals WHERE referred_id = $1',
            [referredId]
        );
        
        if (existingReferral.rows.length > 0) {
            return res.json({ success: true, message: 'User already referred', referral: existingReferral.rows[0] });
        }
        
        const result = await dbManager.query(`
            INSERT INTO referrals (referrer_id, referred_id, status)
            VALUES ($1, $2, 'active')
            RETURNING *
        `, [referrerId, referredId]);
        
        await dbManager.query(`
            INSERT INTO contest_leaderboard (user_id, referrals_count, points, last_activity)
            VALUES ($1, 1, 15, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                referrals_count = contest_leaderboard.referrals_count + 1,
                points = contest_leaderboard.points + 15,
                last_activity = EXCLUDED.last_activity
        `, [referrerId]);
        
        console.log(`✅ تم تسجيل الإحالة بنجاح: +15 نقطة للمستخدم ${referrerId}`);
        
        res.json({
            success: true,
            referral: result.rows[0],
            contestPoints: 15,
            message: 'تم تسجيل الإحالة بنجاح +15 نقطة مسابقة'
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل الإحالة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📊 إحصائيات الإحالات
app.get('/api/referrals/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const referrals = await dbManager.query(`
            SELECT r.*, bu.first_name, bu.username 
            FROM referrals r
            LEFT JOIN bot_users bu ON r.referred_id = bu.telegram_id
            WHERE r.referrer_id = $1
            ORDER BY r.created_at DESC
        `, [userId]);
        
        const stats = await dbManager.query(`
            SELECT 
                COUNT(*) as total_referrals,
                COALESCE(SUM(referrer_earnings), 0) as total_earnings
            FROM referrals 
            WHERE referrer_id = $1
        `, [userId]);
        
        res.json({
            success: true,
            referrals: referrals.rows,
            stats: stats.rows[0]
        });
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات الإحالات:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🛑 معالج الأخطاء النهائي
app.use((error, req, res, next) => {
    console.error('🚨 خطأ غير معالج:', error);
    
    const deviceHash = securitySystem.generateDeviceHash(req);
    securitySystem.recordError(deviceHash, 'unhandled_error', {
        error: error.message,
        stack: error.stack
    });
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});

// 🔧 مسار غير موجود
app.use('*', (req, res) => {
    const deviceHash = securitySystem.generateDeviceHash(req);
    securitySystem.recordError(deviceHash, 'invalid_endpoint', {
        path: req.path,
        method: req.method
    });
    
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        code: 'NOT_FOUND'
    });
});

// 🛑 إيقاف نظيف للسيرفر
process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف نظام التوكن...');
    tokenSystem.stop();
    
    console.log('📊 إحصائيات الحماية النهائية:');
    console.log(securitySystem.getSecurityStats());
    
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 إيقاف نظام التوكن...');
    tokenSystem.stop();
    process.exit(0);
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

setTimeout(() => {
    app.listen(PORT, HOST, () => {
        console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
        console.log(`💰 Ad reward: ${config.adValue} TON`);
        console.log(`📊 Daily ads: ${config.dailyAdLimit} ads`);
        console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
        console.log(`👥 Referral bonus: ${config.referralBonus} TON`);
        console.log(`🔐 Telegram verification: ENABLED`);
        console.log(`🔄 Dynamic token system: ACTIVE (8 seconds)`);
        console.log(`🛡️ ULTIMATE SECURITY SYSTEM: ENABLED`);
        console.log(`   ├─ Telegram Only: ✅ ACTIVE`);
        console.log(`   ├─ Device Fingerprinting: ✅ ACTIVE`);
        console.log(`   ├─ Multiple Accounts Prevention: ✅ ACTIVE`);
        console.log(`   ├─ Script Detection: ✅ ACTIVE`);
        console.log(`   ├─ Rate Limiting: ✅ ACTIVE`);
console.log(`   ├─ Auto Ban System: ✅ ACTIVE`);
console.log(`   ├─ Request Monitoring: ✅ ACTIVE`);
console.log(`   └─ Advanced Analytics: ✅ ACTIVE`);
console.log(`🗄️ Database manager: ${dbManager.initialized ? 'ACTIVE' : 'INITIALIZING'}`);

// إنشاء الجداول تلقائياً
setTimeout(async () => {
    try {
        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS bot_users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                balance DECIMAL(15,8) DEFAULT 0,
                earning_wallet DECIMAL(15,8) DEFAULT 0,
                total_earned DECIMAL(15,8) DEFAULT 0,
                daily_ad_count INTEGER DEFAULT 0,
                last_ad_date DATE,
                last_ad_timestamp TIMESTAMP,
                referral_code VARCHAR(50) UNIQUE,
                referred_by BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول bot_users جاهز');

        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                amount DECIMAL(15,8) NOT NULL,
                wallet_address TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                method VARCHAR(100) DEFAULT 'TON Wallet',
                memo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول withdrawals جاهز');

        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS contest_leaderboard (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                points INTEGER DEFAULT 0,
                ads_watched INTEGER DEFAULT 0,
                referrals_count INTEGER DEFAULT 0,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول contest_leaderboard جاهز');

        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT NOT NULL,
                referred_id BIGINT NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                referrer_earnings DECIMAL(15,8) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول referrals جاهز');

        // فحص الجداول
        const tablesCheck = await dbManager.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log(`📊 عدد الجداول النشطة: ${tablesCheck.rows.length}`);
        
    } catch (error) {
        console.log('⚠️  خطأ في إنشاء الجداول:', error.message);
    }
}, 2000);

// 🔄 نظام المراقبة المستمر
setInterval(() => {
    const stats = securitySystem.getSecurityStats();
    const memoryUsage = process.memoryUsage();
    
    console.log('\n📈 إحصائيات النظام:');
    console.log(`🛡️  الأجهزة المحظورة: ${stats.blockedDevices}`);
    console.log(`⚠️  الأنشطة المشبوهة: ${stats.suspiciousActivities}`);
    console.log(`📱 الأجهزة المسجلة: ${stats.deviceAccounts}`);
    console.log(`👤 المستخدمين النشطين: ${stats.userDevices}`);
    console.log(`💾 استخدام الذاكرة: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`🔄 التوكنات النشطة: ${tokenSystem.tokens.size}`);
    
}, 60000); // كل دقيقة

// 🎯 بدء نظام المراقبة
console.log('\n🎯 بدء نظام المراقبة المستمرة...');
}, 1000);

module.exports = app;
