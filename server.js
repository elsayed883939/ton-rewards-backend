const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();

// 🔧 إعداد CORS محسن
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Dynamic-Token', 'Authorization', 'Origin', 'Accept'],
    credentials: true
}));

// معالجة طلبات OPTIONS
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHkhaFLpI4J7uYL4xpAEp4_-hc5DnW5yno"; 

// 🔧 نظام إدارة اتصال قاعدة البيانات المحسن
class DatabaseManager {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 10;
        this.initialized = false;
        this.initPromise = this.init();
    }

    async init() {
        try {
            console.log('🔧 بدء تهيئة اتصال قاعدة البيانات...');
            
            this.pool = new Pool({
                connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 20000,
                idleTimeoutMillis: 30000,
                max: 20,
                min: 2,
                acquireTimeoutMillis: 20000,
                createTimeoutMillis: 20000,
                destroyTimeoutMillis: 5000,
                maxUses: 7500,
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
            console.log('🔍 اختبار اتصال قاعدة البيانات...');
            const result = await client.query('SELECT NOW() as current_time');
            console.log('🕒 وقت قاعدة البيانات:', result.rows[0].current_time);
            
            const tablesResult = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            `);
            console.log('📊 عدد الجداول المتاحة:', tablesResult.rows.length);
            
        } finally {
            client.release();
        }
    }

    async handleConnectionError(error) {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            console.log(`🔄 محاولة إعادة الاتصال ${this.retryCount}/${this.maxRetries}...`);
            const delay = Math.min(5000 * this.retryCount, 30000);
            await new Promise(resolve => setTimeout(resolve, delay));
            await this.init();
        } else {
            console.error('❌ فشل جميع محاولات الاتصال بقاعدة البيانات');
            this.createFallbackPool();
        }
    }

    createFallbackPool() {
        console.log('🛟 إنشاء اتصال احتياطي...');
        this.pool = new Pool({
            connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 30000,
            idleTimeoutMillis: 60000,
            max: 5,
        });
        
        this.isConnected = true;
        console.log('⚠️  تم تهيئة الاتصال الاحتياطي');
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
            
            if (this.shouldReconnect(error)) {
                console.log('🔄 محاولة إعادة الاتصال بعد الخطأ...');
                this.isConnected = false;
                await this.init();
                return await this.pool.query(text, params);
            }
            
            throw error;
        }
    }

    shouldReconnect(error) {
        const reconnectErrors = [
            'connection',
            'ECONNREFUSED',
            'ECONNRESET',
            'ETIMEDOUT',
            'getaddrinfo ENOTFOUND',
            'terminating connection'
        ];
        
        return reconnectErrors.some(err => error.message.includes(err));
    }

    async connect() {
        await this.waitForInitialization();
        
        if (!this.isConnected) {
            throw new Error('قاعدة البيانات غير متصلة');
        }
        return await this.pool.connect();
    }

    getPool() {
        return this.pool;
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

// تهيئة مدير قاعدة البيانات
const dbManager = new DatabaseManager();

// 🔥 الإعدادات الجديدة
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

// 🛡️ نظام البصمة الرقمية المتقدم
class AdvancedDeviceFingerprint {
    constructor() {
        this.deviceUsers = new Map();
        this.userDevices = new Map();
        this.deviceProfiles = new Map();
        this.bannedDevices = new Map();
        this.suspiciousActivities = new Map();
    }

    generateDeviceFingerprint(req, initData) {
        const fingerprintData = {
            userAgent: req.headers['user-agent'] || '',
            acceptLanguage: req.headers['accept-language'] || '',
            acceptEncoding: req.headers['accept-encoding'] || '',
            ip: this.extractIP(req),
            xForwardedFor: req.headers['x-forwarded-for'] || '',
            telegramInitData: initData ? initData.substring(0, 50) : '',
            timestamp: Date.now()
        };

        return crypto
            .createHash('sha512')
            .update(JSON.stringify(fingerprintData))
            .digest('hex')
            .substring(0, 32);
    }

    extractIP(req) {
        return req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress;
    }

    validateDeviceUser(req, initData) {
        try {
            const deviceHash = this.generateDeviceFingerprint(req, initData);
            const telegramUser = parseTelegramUser(initData);
            const userId = telegramUser?.id?.toString();

            if (!userId) {
                return { success: false, error: 'Invalid user data' };
            }

            // التحقق من حظر الجهاز
            if (this.isDeviceBanned(deviceHash)) {
                return { 
                    success: false, 
                    error: 'Device banned',
                    banReason: 'multiple_accounts'
                };
            }

            // التحقق من تعدد الحسابات على نفس الجهاز
            const existingUser = this.deviceUsers.get(deviceHash);
            if (existingUser && existingUser !== userId) {
                this.banDevice(deviceHash, 'multiple_accounts', 30 * 24 * 60 * 60 * 1000);
                return { 
                    success: false, 
                    error: 'Multiple accounts detected',
                    banReason: 'multiple_accounts'
                };
            }

            // تسجيل الجهاز للمستخدم
            this.deviceUsers.set(deviceHash, userId);
            this.userDevices.set(userId, deviceHash);

            // تحديث الملف الشخصي للجهاز
            this.updateDeviceProfile(deviceHash, req);

            return { 
                success: true, 
                deviceHash,
                userId 
            };

        } catch (error) {
            console.error('❌ خطأ في التحقق من الجهاز:', error);
            return { success: false, error: 'Device validation failed' };
        }
    }

    isDeviceBanned(deviceHash) {
        const banInfo = this.bannedDevices.get(deviceHash);
        if (!banInfo) return false;

        if (banInfo.expiresAt && Date.now() > banInfo.expiresAt) {
            this.bannedDevices.delete(deviceHash);
            return false;
        }

        return true;
    }

    banDevice(deviceHash, reason, duration = null) {
        const banInfo = {
            reason,
            bannedAt: Date.now(),
            expiresAt: duration ? Date.now() + duration : null,
            deviceHash
        };

        this.bannedDevices.set(deviceHash, banInfo);
    }

    updateDeviceProfile(deviceHash, req) {
        const profile = this.deviceProfiles.get(deviceHash) || {
            firstSeen: Date.now(),
            requestCount: 0,
            lastSeen: Date.now(),
            userAgent: req.headers['user-agent']
        };

        profile.requestCount++;
        profile.lastSeen = Date.now();
        
        this.deviceProfiles.set(deviceHash, profile);
    }

    // 🔒 نظام مراقبة النشاط المشبوه
    recordSuspiciousActivity(deviceHash, activityType, details) {
        const activity = {
            type: activityType,
            timestamp: Date.now(),
            details: details,
            deviceHash: deviceHash
        };

        if (!this.suspiciousActivities.has(deviceHash)) {
            this.suspiciousActivities.set(deviceHash, []);
        }

        const activities = this.suspiciousActivities.get(deviceHash);
        activities.push(activity);

        // إذا تجاوز عدد الأنشطة المشبوهة الحد المسموح
        if (activities.length > 5) {
            this.banDevice(deviceHash, 'excessive_suspicious_activity', 24 * 60 * 60 * 1000);
        }
    }
}

// 🚨 نظام مراقبة الطلبات والأخطاء
class RequestErrorMonitor {
    constructor() {
        this.userErrors = new Map();
        this.deviceErrors = new Map();
        this.suspiciousPatterns = [
            /sql.*injection|drop.*table|union.*select/i,
            /<script>|javascript:|onclick=|onload=/i,
            /eval\(|setTimeout\(|setInterval\(/i,
            /\.\.\/|\.\.\\/i,
            /bin\/sh|cmd\.exe|powershell/i
        ];
        this.requestLimits = new Map();
    }

    analyzeRequest(req, error = null) {
        const analysis = {
            isSuspicious: false,
            reasons: [],
            riskLevel: 0
        };

        analysis.reasons.push(...this.analyzeHeaders(req.headers));
        
        if (req.body) {
            analysis.reasons.push(...this.analyzeBody(req.body));
        }

        analysis.riskLevel = this.calculateRiskLevel(analysis.reasons);
        analysis.isSuspicious = analysis.riskLevel > 60;

        return analysis;
    }

    analyzeHeaders(headers) {
        const reasons = [];
        
        if (!headers['user-agent'] || headers['user-agent'].length < 10) {
            reasons.push('missing_or_short_user_agent');
        }

        if (headers['user-agent'] && this.isSuspiciousUserAgent(headers['user-agent'])) {
            reasons.push('suspicious_user_agent');
        }

        return reasons;
    }

    analyzeBody(body) {
        const reasons = [];
        const bodyString = JSON.stringify(body).toLowerCase();

        this.suspiciousPatterns.forEach(pattern => {
            if (pattern.test(bodyString)) {
                reasons.push(`suspicious_pattern: ${pattern.toString()}`);
            }
        });

        if (bodyString.length > 10000) {
            reasons.push('large_request_body');
        }

        return reasons;
    }

    isSuspiciousUserAgent(userAgent) {
        const suspiciousAgents = [
            'python', 'curl', 'wget', 'postman', 'insomnia',
            'headless', 'phantomjs', 'selenium', 'puppeteer'
        ];
        return suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent));
    }

    recordError(userId, deviceHash, errorType, analysis) {
        const userErrorInfo = this.userErrors.get(userId) || { count: 0, lastError: Date.now(), errors: [] };
        userErrorInfo.count++;
        userErrorInfo.lastError = Date.now();
        userErrorInfo.errors.push({
            type: errorType,
            timestamp: Date.now(),
            analysis: analysis
        });
        this.userErrors.set(userId, userErrorInfo);

        const deviceErrorInfo = this.deviceErrors.get(deviceHash) || { count: 0, lastError: Date.now() };
        deviceErrorInfo.count++;
        deviceErrorInfo.lastError = Date.now();
        this.deviceErrors.set(deviceHash, deviceErrorInfo);

        if (userErrorInfo.count > 10 || deviceErrorInfo.count > 15) {
            return this.triggerAutoBan(userId, deviceHash, 'excessive_errors');
        }

        return false;
    }

    triggerAutoBan(userId, deviceHash, reason) {
        const banDuration = this.calculateBanDuration(reason);
        
        deviceFingerprint.banDevice(deviceHash, reason, banDuration);

        return true;
    }

    calculateRiskLevel(reasons) {
        let score = 0;
        reasons.forEach(reason => {
            if (reason.includes('suspicious_pattern')) score += 30;
            if (reason.includes('suspicious_user_agent')) score += 25;
            if (reason.includes('missing_or_short_user_agent')) score += 20;
            if (reason.includes('large_request_body')) score += 15;
        });
        return Math.min(100, score);
    }

    calculateBanDuration(reason) {
        const durations = {
            'excessive_errors': 24 * 60 * 60 * 1000,
            'multiple_accounts': 30 * 24 * 60 * 60 * 1000,
            'excessive_suspicious_activity': 24 * 60 * 60 * 1000
        };
        return durations[reason] || 24 * 60 * 60 * 1000;
    }

    // 🔒 نظام تحديد معدل الطلبات
    checkRateLimit(deviceHash, endpoint) {
        const key = `${deviceHash}:${endpoint}`;
        const now = Date.now();
        const windowStart = now - 60000; // نافذة 60 ثانية

        if (!this.requestLimits.has(key)) {
            this.requestLimits.set(key, []);
        }

        const requests = this.requestLimits.get(key);
        
        // إزالة الطلبات القديمة
        const recentRequests = requests.filter(time => time > windowStart);
        this.requestLimits.set(key, recentRequests);

        // التحقق من الحد
        if (recentRequests.length >= 60) { // 60 طلب في الدقيقة
            return false;
        }

        // تسجيل الطلب الجديد
        recentRequests.push(now);
        return true;
    }
}

// 🔒 نظام التحقق من التليجرام فقط
class TelegramOnlyEnforcer {
    constructor() {
        this.allowedUserAgents = [
            'TelegramBot',
            'Mozilla/5.0 (iPhone; CPU iPhone OS',
            'Mozilla/5.0 (Android; Mobile;',
            'Mozilla/5.0 (Linux; Android'
        ];
    }

    validateTelegramOrigin(req) {
        const userAgent = req.headers['user-agent'] || '';
        const origin = req.headers['origin'] || req.headers['referer'] || '';

        const isTelegramUserAgent = this.allowedUserAgents.some(agent => 
            userAgent.includes(agent)
        );

        const isTelegramOrigin = origin.includes('web.telegram.org') || 
                                origin.includes('telegram.org');

        if (!isTelegramUserAgent && !isTelegramOrigin) {
            return false;
        }

        return true;
    }
}

// 🔧 نظام التوكن الديناميكي
class DynamicTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenHistory = [];
        this.tokenCounter = 0;
        this.intervalId = null;
        
        this.config = {
            tokenRefreshInterval: 9000,
            tokenValidityWindow: 25000,
            maxTokens: 20,
            secretKey: process.env.TOKEN_SECRET || 'ton-rewards-dynamic-token-secret-2024'
        };
    }

    generateToken() {
        const timestamp = Date.now();
        this.tokenCounter++;
        
        const tokenData = {
            timestamp,
            counter: this.tokenCounter,
            random: crypto.randomBytes(32).toString('hex'),
            userAgent: 'ton-rewards-webapp'
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
        this.updateToken();
        
        this.intervalId = setInterval(() => {
            this.updateToken();
        }, this.config.tokenRefreshInterval);
    }

    updateToken() {
        const newToken = this.generateToken();
        this.tokens.set(newToken.token, newToken);
        this.currentToken = newToken.token;
        
        this.tokenHistory.unshift({
            token: newToken.token.substring(0, 20) + '...',
            timestamp: new Date(newToken.timestamp).toLocaleTimeString(),
            counter: newToken.counter
        });
        
        if (this.tokenHistory.length > this.config.maxTokens) {
            this.tokenHistory.pop();
        }

        this.cleanExpiredTokens();
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

    getStats() {
        return {
            currentToken: this.currentToken ? this.currentToken.substring(0, 20) + '...' : null,
            activeTokens: this.tokens.size,
            totalGenerated: this.tokenCounter,
            refreshInterval: this.config.tokenRefreshInterval
        };
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

// 🌍 نظام كشف الدولة والمنع الجغرافي
class GeoLocationSystem {
    constructor() {
        this.bannedCountries = [
            'IN', 'RU', 'LY', 'AF', 'NL', 'MN', 'US', 'LK', 'UA'
        ];
        this.countryCache = new Map();
    }

    async detectCountry(ip) {
        try {
            if (this.countryCache.has(ip)) {
                return this.countryCache.get(ip);
            }

            const response = await fetch(`http://ip-api.com/json/${ip}`);
            const data = await response.json();
            
            const countryInfo = {
                countryCode: data.countryCode,
                countryName: data.country,
                region: data.regionName,
                city: data.city,
                ip: ip
            };

            this.countryCache.set(ip, countryInfo);
            
            // تنظيف الكاش بعد ساعة
            setTimeout(() => {
                this.countryCache.delete(ip);
            }, 60 * 60 * 1000);

            return countryInfo;
        } catch (error) {
            return {
                countryCode: 'UNKNOWN',
                countryName: 'Unknown',
                ip: ip
            };
        }
    }

    isCountryAllowed(countryCode) {
        return !this.bannedCountries.includes(countryCode);
    }

    getBannedCountries() {
        return this.bannedCountries;
    }
}

// تهيئة أنظمة الحماية
const deviceFingerprint = new AdvancedDeviceFingerprint();
const requestMonitor = new RequestErrorMonitor();
const telegramEnforcer = new TelegramOnlyEnforcer();
const tokenSystem = new DynamicTokenSystem();
const geolocationSystem = new GeoLocationSystem();
tokenSystem.start();

// 🔧 middleware محسن للتحقق من التوكن والحماية
const advancedSecurityMiddleware = (req, res, next) => {
    const publicEndpoints = [
        '/', 
        '/api/token/current', 
        '/api/token/stats', 
        '/api/check-tables', 
        '/api/setup-database', 
        '/api/config',
        '/api/fix-all-tables', 
        '/api/fix-withdrawals-table', 
        '/api/debug-tables', 
        '/api/repair-database', 
        '/api/debug-user',
        '/api/reward-codes/validate', 
        '/api/reward-codes/redeem',
        '/api/fix-contest-data', 
        '/api/fix-all-contest-data',
        '/api/database/status', 
        '/api/health', 
        '/api/test-connection',
        '/api/contest/leaderboard',
        '/api/contest/user-rank/:userId',
        '/api/contest/user/:userId',
        '/api/validate-initdata',
        '/api/stats',
        '/api/security/status'
    ];
    
    const isPublicEndpoint = publicEndpoints.some(endpoint => {
        if (endpoint.includes(':')) {
            const basePath = endpoint.split('/:')[0];
            return req.path.startsWith(basePath);
        }
        return req.path === endpoint;
    });
    
    if (isPublicEndpoint) {
        return next();
    }

    // 1. التحقق من التليجرام فقط
    if (!telegramEnforcer.validateTelegramOrigin(req)) {
        return res.status(403).json({ 
            success: false,
            error: 'Access denied - Telegram only',
            code: 'TELEGRAM_ONLY'
        });
    }

    // 2. التحقق من التوكن
    const token = req.headers['x-dynamic-token'] || 
                  req.headers['authorization']?.replace('Bearer ', '') || 
                  req.query.dynamicToken;

    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'التوكن الديناميكي مطلوب',
            code: 'DYNAMIC_TOKEN_REQUIRED'
        });
    }

    if (!tokenSystem.validateToken(token)) {
        tokenSystem.updateToken();
        
        return res.status(401).json({ 
            success: false,
            error: 'توكن ديناميكي غير صالح أو منتهي',
            code: 'INVALID_DYNAMIC_TOKEN',
            hint: 'جرب تحديث الصفحة'
        });
    }

    // 3. تحديد معدل الطلبات
    const deviceHash = deviceFingerprint.generateDeviceFingerprint(req, req.body?.initData);
    if (!requestMonitor.checkRateLimit(deviceHash, req.path)) {
        return res.status(429).json({ 
            success: false,
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED'
        });
    }

    // 4. التحقق من initData لطلبات POST
    if (req.method === 'POST' && req.body && req.body.initData) {
        const deviceValidation = deviceFingerprint.validateDeviceUser(req, req.body.initData);
        if (!deviceValidation.success) {
            return res.status(403).json({ 
                success: false,
                error: deviceValidation.error,
                code: 'DEVICE_VALIDATION_FAILED',
                banReason: deviceValidation.banReason
            });
        }

        // تحليل الطلب لاكتشاف الاسكربتات
        const requestAnalysis = requestMonitor.analyzeRequest(req);
        if (requestAnalysis.isSuspicious) {
            requestMonitor.recordError(
                deviceValidation.userId, 
                deviceValidation.deviceHash, 
                'suspicious_request', 
                requestAnalysis
            );
            
            return res.status(429).json({ 
                success: false,
                error: 'Suspicious activity detected',
                code: 'SUSPICIOUS_REQUEST'
            });
        }
    }

    next();
};

app.use(advancedSecurityMiddleware);

// 🔧 دوال مساعدة محسنة
async function checkDatabaseConnection() {
    try {
        await dbManager.waitForInitialization();
        const result = await dbManager.query('SELECT NOW() as current_time');
        return true;
    } catch (error) {
        return false;
    }
}

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
        return null;
    }
}

async function getUserFromDB(userId) {
    try {
        await dbManager.waitForInitialization();
        const result = await dbManager.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        return result.rows[0] || null;
    } catch (error) {
        return null;
    }
}

async function createUserInDB(userData) {
    try {
        await dbManager.waitForInitialization();
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
        return null;
    }
}

// 📺 مشاهدة إعلان - مع الحماية المضافة
app.post('/api/watch-ad', async (req, res) => {
    let client;
    
    try {
        const { initData } = req.body;

        if (!initData) {
            return res.status(400).json({ 
                success: false,
                error: 'initData is required' 
            });
        }

        if (!validateTelegramInitData(initData)) {
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
        
        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1 FOR UPDATE',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
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
            return res.status(400).json({ 
                success: false,
                error: 'Daily ad limit reached' 
            });
        }

        const adReward = config.adValue;
        
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
            } catch (contestError) {
                // تجاهل خطأ المسابقة
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
            res.status(500).json({ 
                success: false,
                error: 'Failed to process ad' 
            });
        }

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        
        if (req.body.initData) {
            const telegramUser = parseTelegramUser(req.body.initData);
            const deviceHash = deviceFingerprint.generateDeviceFingerprint(req, req.body.initData);
            requestMonitor.recordError(telegramUser?.id, deviceHash, 'watch_ad_error', {});
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to process ad: ' + error.message 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 👤 جلب بيانات المستخدم من قاعدة البيانات + تسجيل تلقائي
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

        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
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
                isNewUser: isNewUser,
                welcomeMessage: isNewUser ? `🎉 أهلاً وسهلاً ${user.first_name}!` : `مرحباً بعودتك ${user.first_name}!`
            });
        } else {
            res.status(404).json({ 
                success: false,
                error: 'User not found - Registration failed' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user data: ' + error.message 
        });
    }
});

// 👤 تسجيل مستخدم جديد في قاعدة البيانات
app.post('/api/register', async (req, res) => {
    try {
        const { initData } = req.body;

        if (!validateTelegramInitData(initData)) {
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
        res.status(500).json({ 
            success: false,
            error: 'Registration failed: ' + error.message 
        });
    }
});

// 💰 تحويل المحفظة إلى الرصيد
app.post('/api/move-to-balance', async (req, res) => {
    try {
        const { initData } = req.body;

        if (!validateTelegramInitData(initData)) {
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
        
        const user = await getUserFromDB(userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const earningWallet = parseFloat(user.earning_wallet || 0);
        
        if (earningWallet < 0.0001) {
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
            res.json({
                success: true,
                newBalance: parseFloat(updatedUser.balance || 0),
                earningWallet: 0
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Transfer failed' 
            });
        }

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Transfer failed' 
        });
    }
});

// 💳 طلب سحب - مع الحماية المضافة
app.post('/api/withdraw', async (req, res) => {
    let client;
    
    try {
        const { initData, amount, walletAddress, method = 'TON Wallet', memo = '' } = req.body;

        if (!initData || !amount || !walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'بيانات ناقصة: initData, amount, walletAddress مطلوبة'
            });
        }

        if (!validateTelegramInitData(initData)) {
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
        
        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1 FOR UPDATE',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const user = userResult.rows[0];
        const userBalance = parseFloat(user.balance || 0);
        const withdrawAmount = parseFloat(amount);

        if (userBalance < withdrawAmount) {
            await client.query('ROLLBACK');
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
        
        if (req.body.initData) {
            const telegramUser = parseTelegramUser(req.body.initData);
            const deviceHash = deviceFingerprint.generateDeviceFingerprint(req, req.body.initData);
            requestMonitor.recordError(telegramUser?.id, deviceHash, 'withdrawal_error', {});
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed: ' + error.message 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 📋 الحصول على تاريخ السحوبات - مع الإصلاح
app.get('/api/withdrawals/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }
        
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
        
        res.json({
            success: true,
            contestData: result.rows[0],
            message: 'تم تحديث نقاط المسابقة بنجاح'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب المتصدرين مرتبين حسب النقاط
app.get('/api/contest/leaderboard', async (req, res) => {
    try {
        const leaderboard = await updateContestLeaderboard();
        
        res.json({
            success: true,
            leaderboard: leaderboard,
            totalParticipants: leaderboard.length,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب ترتيب مستخدم معين
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
        
        res.json({
            success: true,
            userId: userId,
            rank: userRank,
            inLeaderboard: userRank > 0
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب بيانات مسابقة مستخدم معين
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔥 دالة مساعدة لتحديث قائمة المتصدرين - مع الإصلاح
async function updateContestLeaderboard() {
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
        
        return leaderboard?.rows || [];
    } catch (error) {
        return [];
    }
}

// 👥 نظام الإحالات
app.post('/api/referrals/add', async (req, res) => {
    try {
        const { referrerId, referredId } = req.body;
        
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
        
        res.json({
            success: true,
            referral: result.rows[0],
            contestPoints: 15,
            message: 'تم تسجيل الإحالة بنجاح +15 نقطة مسابقة'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔒 نظام الحماية - نقاط نهاية جديدة
app.post('/api/validate-initdata', async (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ success: false, error: 'initData is required' });
        }
        
        const isValid = validateTelegramInitData(initData);
        
        if (isValid) {
            const telegramUser = parseTelegramUser(initData);
            const deviceHash = deviceFingerprint.generateDeviceFingerprint(req, initData);
            
            res.json({
                success: true,
                userId: telegramUser?.id,
                deviceHash: deviceHash,
                message: 'Telegram initData is valid'
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Invalid Telegram initData'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/security/status', async (req, res) => {
    try {
        res.json({
            success: true,
            security: {
                deviceFingerprint: {
                    totalDevices: deviceFingerprint.deviceUsers.size,
                    bannedDevices: deviceFingerprint.bannedDevices.size,
                    deviceProfiles: deviceFingerprint.deviceProfiles.size,
                    suspiciousActivities: deviceFingerprint.suspiciousActivities.size
                },
                requestMonitor: {
                    userErrors: requestMonitor.userErrors.size,
                    deviceErrors: requestMonitor.deviceErrors.size,
                    requestLimits: requestMonitor.requestLimits.size
                },
                telegramEnforcer: 'active',
                tokenSystem: tokenSystem.getStats(),
                geolocation: {
                    bannedCountries: geolocationSystem.getBannedCountries(),
                    countryCache: geolocationSystem.countryCache.size
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/security/report', async (req, res) => {
    try {
        const { initData, activityType, details } = req.body;
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ success: false, error: 'Invalid initData' });
        }
        
        const telegramUser = parseTelegramUser(initData);
        const deviceHash = deviceFingerprint.generateDeviceFingerprint(req, initData);
        
        deviceFingerprint.recordSuspiciousActivity(deviceHash, activityType, details);
        
        res.json({
            success: true,
            message: 'Suspicious activity reported successfully',
            activityType: activityType,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🌍 نظام كشف الدولة
app.get('/api/geolocation/detect', async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress;
        
        const countryInfo = await geolocationSystem.detectCountry(ip);
        const isAllowed = geolocationSystem.isCountryAllowed(countryInfo.countryCode);
        
        res.json({
            success: true,
            ip: ip,
            country: countryInfo,
            isAllowed: isAllowed,
            message: isAllowed ? 'Country is allowed' : 'Country is banned'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🩹 فحص وإصلاح الجداول
app.get('/api/check-tables', async (req, res) => {
    try {
        const tables = [
            'bot_users',
            'withdrawals', 
            'contest_leaderboard',
            'reward_codes',
            'code_redemptions',
            'referrals'
        ];
        
        const results = {};
        
        for (const table of tables) {
            try {
                const result = await dbManager.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = $1
                    )
                `, [table]);
                
                results[table] = result.rows[0].exists;
            } catch (error) {
                results[table] = false;
            }
        }
        
        res.json({
            success: true,
            tables: results,
            database: dbManager.isConnected ? 'متصل' : 'غير متصل'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔧 إنشاء الجداول إذا لم تكن موجودة
app.get('/api/setup-database', async (req, res) => {
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

        res.json({
            success: true,
            message: 'تم إنشاء جميع الجداول بنجاح'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🏥 endpoint للصحة العامة
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await checkDatabaseConnection();
        const tokenStats = tokenSystem.getStats();
        
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbStatus ? 'connected' : 'disconnected',
            tokenSystem: tokenStats,
            security: {
                deviceFingerprint: deviceFingerprint.deviceUsers.size,
                bannedDevices: deviceFingerprint.bannedDevices.size,
                requestMonitor: requestMonitor.userErrors.size
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

// 🔧 endpoints إضافية للتحكم
app.get('/api/token/current', (req, res) => {
    res.json({
        success: true,
        token: tokenSystem.getCurrentToken(),
        stats: tokenSystem.getStats()
    });
});

app.get('/api/token/stats', (req, res) => {
    res.json({
        success: true,
        stats: tokenSystem.getStats()
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
            initialized: dbManager.initialized,
            retryCount: dbManager.retryCount
        });
    } catch (error) {
        res.json({
            success: false,
            connected: false,
            error: error.message
        });
    }
});

// 🛑 إيقاف نظيف للسيرفر
process.on('SIGINT', () => {
    tokenSystem.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    tokenSystem.stop();
    process.exit(0);
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

setTimeout(() => {
    app.listen(PORT, HOST, () => {
        console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
        
        checkDatabaseConnection();
        
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
                
            } catch (error) {
                // تجاهل الخطأ
            }
        }, 3000);
    });
}, 1000);
