const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();

// 🔧 التهيئة الأساسية المحسنة
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Dynamic-Token', 'Authorization', 'Origin', 'Accept', 'X-Device-Fingerprint'],
    credentials: true,
    maxAge: 86400
}));

app.options('*', cors());
app.use(express.json({ 
    limit: '5mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ success: false, error: 'Invalid JSON' });
        }
    }
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '5mb',
    parameterLimit: 100
}));

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHkhaFLpI4J7uYL4xpAEp4_-hc5DnW5yno";

// 🛡️ نظام إدارة قاعدة البيانات المحسن
class SecureDatabaseManager {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 8;
        this.initialized = false;
        this.healthCheckInterval = null;
        this.initPromise = this.init();
    }

    async init() {
        try {
            console.log('🔧 بدء تهيئة اتصال قاعدة البيانات الآمن...');
            
            this.pool = new Pool({
                connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
                ssl: { 
                    rejectUnauthorized: false,
                    ca: process.env.DB_SSL_CA
                },
                connectionTimeoutMillis: 15000,
                idleTimeoutMillis: 30000,
                max: 15,
                min: 2,
                acquireTimeoutMillis: 15000,
                createTimeoutMillis: 15000,
                destroyTimeoutMillis: 5000,
                maxUses: 5000,
            });

            // 🛡️ معالجة الأخطاء في الاتصال
            this.pool.on('error', (err, client) => {
                console.error('❌ خطأ غير متوقع في قاعدة البيانات:', err);
                this.isConnected = false;
            });

            await this.testConnection();
            this.isConnected = true;
            this.retryCount = 0;
            this.initialized = true;
            
            // 🔄 فحص صحة دوري
            this.startHealthCheck();
            
            console.log('✅ تم الاتصال الآمن بقاعدة البيانات بنجاح');
            
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
            
            // ✅ التحقق من وجود الجداول الأساسية
            await this.ensureBasicTables();
            
        } finally {
            client.release();
        }
    }

    async ensureBasicTables() {
        const client = await this.pool.connect();
        try {
            // إنشاء الجداول إذا لم تكن موجودة
            const tables = [
                `CREATE TABLE IF NOT EXISTS bot_users (
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
                )`,
                
                `CREATE TABLE IF NOT EXISTS withdrawals (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    amount DECIMAL(15,8) NOT NULL,
                    wallet_address TEXT NOT NULL,
                    status VARCHAR(50) DEFAULT 'pending',
                    method VARCHAR(100) DEFAULT 'TON Wallet',
                    memo TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS contest_leaderboard (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT UNIQUE NOT NULL,
                    username VARCHAR(255),
                    first_name VARCHAR(255),
                    points INTEGER DEFAULT 0,
                    ads_watched INTEGER DEFAULT 0,
                    referrals_count INTEGER DEFAULT 0,
                    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS referrals (
                    id SERIAL PRIMARY KEY,
                    referrer_id BIGINT NOT NULL,
                    referred_id BIGINT NOT NULL,
                    status VARCHAR(50) DEFAULT 'active',
                    referrer_earnings DECIMAL(15,8) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS security_logs (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT,
                    ip_address INET,
                    user_agent TEXT,
                    action_type VARCHAR(100),
                    severity VARCHAR(20),
                    details JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            ];

            for (const tableQuery of tables) {
                await client.query(tableQuery);
            }
            
            console.log('✅ تم إنشاء/التأكد من الجداول الأساسية');
            
        } catch (error) {
            console.error('❌ خطأ في إنشاء الجداول:', error);
        } finally {
            client.release();
        }
    }

    startHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.pool.query('SELECT 1');
                this.isConnected = true;
            } catch (error) {
                console.error('❌ فحص صحة قاعدة البيانات فشل:', error.message);
                this.isConnected = false;
                await this.handleConnectionError(error);
            }
        }, 30000); // كل 30 ثانية
    }

    async handleConnectionError(error) {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            const delay = Math.min(2000 * this.retryCount, 30000);
            console.log(`🔄 محاولة إعادة الاتصال ${this.retryCount}/${this.maxRetries} بعد ${delay}ms...`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            await this.init();
        } else {
            console.error('❌ فشل جميع محاولات الاتصال بقاعدة البيانات');
            this.createEmergencyPool();
        }
    }

    createEmergencyPool() {
        console.log('🆘 إنشاء اتصال طوارئ...');
        this.pool = new Pool({
            connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 30000,
            idleTimeoutMillis: 60000,
            max: 5,
        });
        
        this.isConnected = true;
        console.log('⚠️  تم تهيئة الاتصال الاحتياطي للطوارئ');
    }

    async waitForInitialization() {
        if (!this.initialized) {
            console.log('⏳ انتظار تهيئة قاعدة البيانات...');
            await this.initPromise;
        }
    }

    async query(text, params, client = null) {
        await this.waitForInitialization();
        
        if (!this.isConnected) {
            throw new Error('قاعدة البيانات غير متصلة');
        }
        
        const startTime = Date.now();
        
        try {
            const result = client ? 
                await client.query(text, params) : 
                await this.pool.query(text, params);
                
            const duration = Date.now() - startTime;
            
            if (duration > 1000) {
                console.warn(`⚠️  استعلام بطيء: ${text.substring(0, 100)}... (${duration}ms)`);
            }
            
            return result;
        } catch (error) {
            console.error('❌ خطأ في استعلام قاعدة البيانات:', {
                error: error.message,
                query: text.substring(0, 200),
                params: params ? JSON.stringify(params).substring(0, 200) : 'none'
            });
            
            if (this.shouldReconnect(error)) {
                console.log('🔄 محاولة إعادة الاتصال بعد الخطأ...');
                this.isConnected = false;
                await this.init();
                return await this.query(text, params, client);
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
            'terminating connection',
            'no connection',
            'Connection lost'
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

    async healthCheck() {
        try {
            await this.query('SELECT 1 as health_check');
            return { healthy: true, connected: this.isConnected };
        } catch (error) {
            console.error('❌ فحص صحة قاعدة البيانات فشل:', error.message);
            return { healthy: false, error: error.message, connected: this.isConnected };
        }
    }

    async logSecurityEvent(event) {
        try {
            await this.query(
                `INSERT INTO security_logs (user_id, ip_address, user_agent, action_type, severity, details) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [event.userId, event.ip, event.userAgent, event.actionType, event.severity, event.details]
            );
        } catch (error) {
            console.error('❌ خطأ في تسجيل حدث الأمان:', error);
        }
    }
}

// 🔥 الإعدادات الآمنة
const config = {
    adValue: 0.0001,
    dailyAdLimit: 100,
    minWithdrawal: 0.0001,
    referralBonus: 0.0005,
    contestAdPoints: 1,
    contestReferralPoints: 15,
    botUsername: "UfnpBot_bot",
    minimumWithdrawReferrals: 0,
    security: {
        maxLoginAttempts: 5,
        lockoutDuration: 900000, // 15 دقيقة
        sessionDuration: 86400000, // 24 ساعة
        rateLimitWindow: 60000, // 1 دقيقة
        rateLimitMax: 60
    }
};

// 🛡️ نظام البصمة الرقمية المتقدم
class AdvancedDeviceFingerprint {
    constructor() {
        this.deviceUsers = new Map();
        this.userDevices = new Map();
        this.deviceProfiles = new Map();
        this.bannedDevices = new Map();
        this.suspiciousActivities = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), 3600000); // تنظيف كل ساعة
    }

    generateDeviceFingerprint(req, initData) {
        try {
            const fingerprintData = {
                userAgent: req.headers['user-agent'] || '',
                acceptLanguage: req.headers['accept-language'] || '',
                acceptEncoding: req.headers['accept-encoding'] || '',
                ip: this.extractIP(req),
                xForwardedFor: req.headers['x-forwarded-for'] || '',
                telegramInitData: initData ? this.hashData(initData.substring(0, 100)) : '',
                timestamp: Date.now(),
                session: crypto.randomBytes(8).toString('hex')
            };

            return crypto
                .createHash('sha512')
                .update(JSON.stringify(fingerprintData))
                .digest('hex')
                .substring(0, 32);
        } catch (error) {
            console.error('❌ خطأ في توليد البصمة:', error);
            return 'fallback-fingerprint';
        }
    }

    hashData(data) {
        return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
    }

    extractIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               'unknown';
    }

    validateDeviceUser(req, initData) {
        try {
            const deviceHash = this.generateDeviceFingerprint(req, initData);
            const telegramUser = this.parseTelegramUser(initData);
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
        console.log(`🚫 تم حظر الجهاز ${deviceHash}: ${reason}`);
    }

    updateDeviceProfile(deviceHash, req) {
        const profile = this.deviceProfiles.get(deviceHash) || {
            firstSeen: Date.now(),
            requestCount: 0,
            lastSeen: Date.now(),
            userAgent: req.headers['user-agent'],
            ip: this.extractIP(req)
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

        console.log(`⚠️  نشاط مشبوه مسجل: ${activityType} للجهاز ${deviceHash}`);
    }

    parseTelegramUser(initData) {
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

    cleanup() {
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        
        // تنظيف الأنشطة القديمة
        for (let [deviceHash, activities] of this.suspiciousActivities) {
            const recentActivities = activities.filter(activity => activity.timestamp > oneDayAgo);
            if (recentActivities.length === 0) {
                this.suspiciousActivities.delete(deviceHash);
            } else {
                this.suspiciousActivities.set(deviceHash, recentActivities);
            }
        }
        
        console.log('🧹 تم تنظيف بيانات البصمة الرقمية');
    }
}

// 🚨 نظام مراقبة الطلبات والأخطاء المتقدم
class AdvancedRequestMonitor {
    constructor() {
        this.userErrors = new Map();
        this.deviceErrors = new Map();
        this.requestLimits = new Map();
        this.loginAttempts = new Map();
        
        this.suspiciousPatterns = [
            // SQL Injection
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/i,
            /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
            /('|"|;|--|\/\*|\*\/)/,
            
            // XSS
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            
            // Path Traversal
            /\.\.\//g,
            /\.\.\\/g,
            
            // Command Injection
            /(\b(run|exec|system|eval|execute)\s*\(|`)/gi,
            /(\|\||&&)/g,
            
                        // Miscellaneous
            /bin\/sh|cmd\.exe|powershell/i,
            /<iframe|<object|<embed/gi,
            /\.\.%2f|\.\.%5c/i
        ];

        this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // تنظيف كل 5 دقائق
    }

    analyzeRequest(req, error = null) {
        const analysis = {
            isSuspicious: false,
            threats: [],
            riskLevel: 0,
            recommendations: []
        };

        // تحليل الهيدرات
        analysis.threats.push(...this.analyzeHeaders(req.headers));
        
        // تحليل البودي
        if (req.body) {
            analysis.threats.push(...this.analyzeBody(req.body));
        }

        // تحليل الباراميترات
        if (req.query && Object.keys(req.query).length > 0) {
            analysis.threats.push(...this.analyzeQueryParams(req.query));
        }

        // تحليل الـ URL
        analysis.threats.push(...this.analyzeURL(req.url));

        // حساب مستوى الخطورة
        analysis.riskLevel = this.calculateRiskLevel(analysis.threats);
        analysis.isSuspicious = analysis.riskLevel > 60;

        // إضافة توصيات
        if (analysis.isSuspicious) {
            analysis.recommendations.push('Block request', 'Log incident', 'Alert admin');
        }

        return analysis;
    }

    analyzeHeaders(headers) {
        const threats = [];
        
        if (!headers['user-agent'] || headers['user-agent'].length < 10) {
            threats.push({ type: 'missing_or_short_user_agent', severity: 'medium' });
        }

        if (headers['user-agent'] && this.isSuspiciousUserAgent(headers['user-agent'])) {
            threats.push({ type: 'suspicious_user_agent', severity: 'high' });
        }

        if (headers['content-length'] && parseInt(headers['content-length']) > 5000000) {
            threats.push({ type: 'large_content_length', severity: 'medium' });
        }

        return threats;
    }

    analyzeBody(body) {
        const threats = [];
        const bodyString = JSON.stringify(body).toLowerCase();

        this.suspiciousPatterns.forEach((pattern, index) => {
            if (pattern.test(bodyString)) {
                threats.push({
                    type: `suspicious_pattern_${index}`,
                    severity: 'critical',
                    pattern: pattern.toString().substring(0, 50)
                });
            }
        });

        if (bodyString.length > 100000) {
            threats.push({ type: 'large_request_body', severity: 'medium' });
        }

        return threats;
    }

    analyzeQueryParams(query) {
        const threats = [];
        const queryString = JSON.stringify(query).toLowerCase();

        this.suspiciousPatterns.forEach(pattern => {
            if (pattern.test(queryString)) {
                threats.push({ type: 'suspicious_query_param', severity: 'high' });
            }
        });

        return threats;
    }

    analyzeURL(url) {
        const threats = [];
        
        if (url.length > 500) {
            threats.push({ type: 'long_url', severity: 'low' });
        }

        if (url.includes('../') || url.includes('..\\')) {
            threats.push({ type: 'path_traversal_attempt', severity: 'critical' });
        }

        return threats;
    }

    isSuspiciousUserAgent(userAgent) {
        const suspiciousAgents = [
            'python', 'curl', 'wget', 'postman', 'insomnia',
            'headless', 'phantomjs', 'selenium', 'puppeteer',
            'scanner', 'bot', 'spider', 'crawler'
        ];
        const ua = userAgent.toLowerCase();
        return suspiciousAgents.some(agent => ua.includes(agent));
    }

    recordError(userId, deviceHash, errorType, analysis) {
        const userErrorInfo = this.userErrors.get(userId) || { 
            count: 0, 
            lastError: Date.now(), 
            errors: [],
            firstError: Date.now()
        };
        
        userErrorInfo.count++;
        userErrorInfo.lastError = Date.now();
        userErrorInfo.errors.push({
            type: errorType,
            timestamp: Date.now(),
            analysis: analysis
        });
        
        this.userErrors.set(userId, userErrorInfo);

        const deviceErrorInfo = this.deviceErrors.get(deviceHash) || { 
            count: 0, 
            lastError: Date.now(),
            firstError: Date.now()
        };
        
        deviceErrorInfo.count++;
        deviceErrorInfo.lastError = Date.now();
        this.deviceErrors.set(deviceHash, deviceErrorInfo);

        // الحظر التلقائي للأنشطة الخطيرة
        if (userErrorInfo.count > 10 || deviceErrorInfo.count > 15) {
            return this.triggerAutoBan(userId, deviceHash, 'excessive_errors');
        }

        return false;
    }

    triggerAutoBan(userId, deviceHash, reason) {
        const banDuration = this.calculateBanDuration(reason);
        
        deviceFingerprint.banDevice(deviceHash, reason, banDuration);

        console.log(`🚨 AUTO-BAN: User ${userId}, Device ${deviceHash} - ${reason}`);
        
        // تسجيل الحظر
        securityLogger.logSecurityEvent({
            type: 'auto_ban',
            severity: 'high',
            userId: userId,
            ip: 'unknown',
            userAgent: 'system',
            endpoint: 'security',
            details: { reason, deviceHash, banDuration },
            riskLevel: 90,
            actionTaken: 'device_banned'
        });
        
        return true;
    }

    calculateRiskLevel(threats) {
        let score = 0;
        const severityWeights = {
            'low': 10,
            'medium': 25,
            'high': 50,
            'critical': 75
        };

        threats.forEach(threat => {
            score += severityWeights[threat.severity] || 10;
        });

        return Math.min(100, score);
    }

    calculateBanDuration(reason) {
        const durations = {
            'excessive_errors': 24 * 60 * 60 * 1000, // 24 ساعة
            'multiple_accounts': 30 * 24 * 60 * 60 * 1000, // 30 يوم
            'excessive_suspicious_activity': 24 * 60 * 60 * 1000, // 24 ساعة
            'brute_force': 60 * 60 * 1000 // 1 ساعة
        };
        
        return durations[reason] || 24 * 60 * 60 * 1000;
    }

    // 🔒 نظام تحديد معدل الطلبات المحسن
    checkRateLimit(deviceHash, endpoint) {
        const key = `${deviceHash}:${endpoint}`;
        const now = Date.now();
        const minuteWindow = now - 60000; // نافذة 60 ثانية
        const hourWindow = now - 3600000; // نافذة 60 دقيقة

        if (!this.requestLimits.has(key)) {
            this.requestLimits.set(key, {
                minute: [],
                hour: [],
                lastReset: now
            });
        }

        const limits = this.requestLimits.get(key);
        
        // تنظيف الطلبات القديمة
        limits.minute = limits.minute.filter(time => time > minuteWindow);
        limits.hour = limits.hour.filter(time => time > hourWindow);

        // التحقق من الحدود
        if (limits.minute.length >= 60) { // 60 طلب في الدقيقة
            return { allowed: false, reason: 'minute_limit' };
        }

        if (limits.hour.length >= 1000) { // 1000 طلب في الساعة
            return { allowed: false, reason: 'hour_limit' };
        }

        // تسجيل الطلب الجديد
        limits.minute.push(now);
        limits.hour.push(now);
        
        return { allowed: true };
    }

    // 🔐 نظام مراقبة محاولات الدخول
    recordLoginAttempt(userId, ip, success) {
        const key = `${userId}:${ip}`;
        const now = Date.now();
        const windowStart = now - 900000; // 15 دقيقة

        if (!this.loginAttempts.has(key)) {
            this.loginAttempts.set(key, []);
        }

        const attempts = this.loginAttempts.get(key);
        const recentAttempts = attempts.filter(time => time > windowStart);
        
        recentAttempts.push(now);
        this.loginAttempts.set(key, recentAttempts);

        // التحقق من محاولات الدخول الفاشلة
        if (!success && recentAttempts.length >= 5) {
            this.triggerAutoBan(userId, ip, 'brute_force');
            return false;
        }

        return true;
    }

    cleanup() {
        const now = Date.now();
        const fiveMinutesAgo = now - 300000;

        // تنظيف بيانات الطلبات القديمة
        for (let [key, limits] of this.requestLimits) {
            limits.minute = limits.minute.filter(time => time > fiveMinutesAgo);
            limits.hour = limits.hour.filter(time => time > (now - 3600000));
            
            if (limits.minute.length === 0 && limits.hour.length === 0) {
                this.requestLimits.delete(key);
            }
        }

        // تنظيف محاولات الدخول القديمة
        for (let [key, attempts] of this.loginAttempts) {
            const recentAttempts = attempts.filter(time => time > (now - 900000));
            if (recentAttempts.length === 0) {
                this.loginAttempts.delete(key);
            } else {
                this.loginAttempts.set(key, recentAttempts);
            }
        }

        console.log('🧹 تم تنظيف بيانات المراقبة');
    }
}

// 🔒 نظام التحقق من التليجرام فقط المحسن
class EnhancedTelegramEnforcer {
    constructor() {
        this.allowedUserAgents = [
            'TelegramBot',
            'Mozilla/5.0 (iPhone; CPU iPhone OS',
            'Mozilla/5.0 (Android; Mobile;',
            'Mozilla/5.0 (Linux; Android',
            'Mozilla/5.0 (Windows Phone',
            'Mozilla/5.0 (iPad; CPU OS'
        ];
        
        this.allowedOrigins = [
            'web.telegram.org',
            'telegram.org',
            't.me'
        ];
    }

    validateTelegramOrigin(req) {
        const userAgent = req.headers['user-agent'] || '';
        const origin = req.headers['origin'] || req.headers['referer'] || '';

        const isTelegramUserAgent = this.allowedUserAgents.some(agent => 
            userAgent.includes(agent)
        );

        const isTelegramOrigin = this.allowedOrigins.some(allowedOrigin => 
            origin.includes(allowedOrigin)
        );

        // السماح لطلبات الاختبار المحلية
        const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
        
        if (!isTelegramUserAgent && !isTelegramOrigin && !isLocalhost) {
            console.log('🚫 محاولة دخول من خارج التليجرام:', { 
                userAgent: userAgent.substring(0, 100), 
                origin: origin.substring(0, 100) 
            });
            
            securityLogger.logSecurityEvent({
                type: 'non_telegram_access',
                severity: 'high',
                userId: 'unknown',
                ip: req.ip,
                userAgent: userAgent,
                endpoint: req.path,
                details: { userAgent, origin },
                riskLevel: 70,
                actionTaken: 'request_blocked'
            });
            
            return false;
        }

        return true;
    }
}

// 🔧 نظام التوكن الديناميكي المحسن
class EnhancedDynamicTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenHistory = [];
        this.tokenCounter = 0;
        this.intervalId = null;
        
        this.config = {
            tokenRefreshInterval: 8000, // 8 ثواني
            tokenValidityWindow: 20000, // 20 ثانية
            maxTokens: 25,
            secretKey: process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex'),
            cleanupInterval: 60000 // تنظيف كل دقيقة
        };
    }

    generateToken() {
        const timestamp = Date.now();
        this.tokenCounter++;
        
        const tokenData = {
            timestamp,
            counter: this.tokenCounter,
            random: crypto.randomBytes(64).toString('hex'),
            userAgent: 'ton-rewards-secure-app',
            session: crypto.randomBytes(16).toString('hex'),
            version: '2.0'
        };

        const tokenString = JSON.stringify(tokenData);
        const token = crypto
            .createHmac('sha512', this.config.secretKey)
            .update(tokenString)
            .digest('hex');

        const tokenObject = {
            token,
            timestamp,
            expiresAt: timestamp + this.config.tokenValidityWindow,
            counter: this.tokenCounter,
            session: tokenData.session,
            data: tokenData
        };

        this.tokens.set(token, tokenObject);
        this.currentToken = token;
        
        // حفظ السجل
        this.tokenHistory.unshift({
            token: token.substring(0, 16) + '...',
            timestamp: new Date(timestamp).toISOString(),
            counter: this.tokenCounter,
            session: tokenData.session.substring(0, 8)
        });
        
        if (this.tokenHistory.length > this.config.maxTokens) {
            this.tokenHistory = this.tokenHistory.slice(0, this.config.maxTokens);
        }

        console.log(`🔄 تحديث التوكن #${this.tokenCounter}`);
        return tokenObject;
    }

    start() {
        console.log('🚀 بدء نظام التوكن الديناميكي المحسن...');
        console.log(`🔄 معدل التحديث: ${this.config.tokenRefreshInterval/1000} ثواني`);
        
        this.updateToken();
        
        this.intervalId = setInterval(() => {
            this.updateToken();
        }, this.config.tokenRefreshInterval);

        // تنظيف التوكنات المنتهية
        setInterval(() => {
            this.cleanExpiredTokens();
        }, this.config.cleanupInterval);
    }

    updateToken() {
        try {
            const newToken = this.generateToken();
            console.log(`✅ تم إنشاء توكن جديد #${newToken.counter}`);
        } catch (error) {
            console.error('❌ خطأ في تحديث التوكن:', error);
        }
    }

    cleanExpiredTokens() {
        const now = Date.now();
        let deletedCount = 0;
        
        for (let [token, data] of this.tokens.entries()) {
            if (data.expiresAt < now) {
                this.tokens.delete(token);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`🧹 تم تنظيف ${deletedCount} توكن منتهي`);
        }
    }

    validateToken(token, userAgent = '') {
        if (!token || typeof token !== 'string' || token.length < 10) {
            console.log('❌ توكن غير صالح - فارغ أو قصير');
            return { valid: false, reason: 'invalid_token' };
        }

        const tokenData = this.tokens.get(token);
        if (!tokenData) {
            console.log('❌ توكن غير معترف به');
            return { valid: false, reason: 'unknown_token' };
        }
        
        const now = Date.now();
        if (tokenData.expiresAt < now) {
            this.tokens.delete(token);
            console.log('⏰ توكن منتهي');
            return { valid: false, reason: 'expired_token' };
        }
        
        // تحقق إضافي من الجلسة
        if (userAgent && !userAgent.includes('Telegram')) {
            console.log('⚠️  تحذير: user-agent غير معتاد');
        }

        console.log('✅ توكن صالح');
        return { 
            valid: true, 
            tokenData,
            timeRemaining: tokenData.expiresAt - now
        };
    }

    getCurrentToken() {
        return this.currentToken;
    }

    getStats() {
        return {
            currentToken: this.currentToken ? this.currentToken.substring(0, 20) + '...' : null,
            activeTokens: this.tokens.size,
            totalGenerated: this.tokenCounter,
            refreshInterval: this.config.tokenRefreshInterval,
            validityWindow: this.config.tokenValidityWindow
        };
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

// 🌍 نظام كشف الدولة والمنع الجغرافي المحسن
class EnhancedGeoLocationSystem {
    constructor() {
        this.bannedCountries = [
            'IN', 'RU', 'LY', 'AF', 'NL', 'MN', 'US', 'LK', 'UA'
        ];
        this.countryCache = new Map();
        this.cacheTimeout = 60 * 60 * 1000; // 1 ساعة
        this.updateInterval = setInterval(() => this.updateBannedCountries(), 24 * 60 * 60 * 1000); // يومياً
    }

    async detectCountry(ip) {
        try {
            if (this.countryCache.has(ip)) {
                const cached = this.countryCache.get(ip);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            // استخدام خدمة متعددة للكشف
            const countryInfo = await this.fetchFromMultipleServices(ip);
            
            if (countryInfo) {
                this.countryCache.set(ip, {
                    data: countryInfo,
                    timestamp: Date.now()
                });
                
                // تنظيف الكاش بعد ساعة
                setTimeout(() => {
                    this.countryCache.delete(ip);
                }, this.cacheTimeout);

                return countryInfo;
            }
            
            return {
                countryCode: 'UNKNOWN',
                countryName: 'Unknown',
                ip: ip,
                source: 'fallback'
            };
            
        } catch (error) {
            console.error('❌ خطأ في كشف الدولة:', error);
            return {
                countryCode: 'UNKNOWN',
                countryName: 'Unknown',
                ip: ip,
                source: 'error'
            };
        }
    }

    async fetchFromMultipleServices(ip) {
        try {
            // المحاولة الأولى: ip-api.com
            const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);
            const data = await response.json();
            
            if (data.status === 'success') {
                return {
                    countryCode: data.countryCode,
                    countryName: data.country,
                    region: data.regionName,
                    city: data.city,
                    isp: data.isp,
                    org: data.org,
                    ip: data.query,
                    source: 'ip-api'
                };
            }
        } catch (error) {
            console.error('❌ فشل في جلب بيانات الموقع:', error);
        }

        return null;
    }

    isCountryAllowed(countryCode) {
        return !this.bannedCountries.includes(countryCode);
    }

    async updateBannedCountries() {
        try {
            // يمكن جلب قائمة محظورة محدثة من مصدر خارجي
            console.log('🔄 التحقق من تحديثات قائمة الدول المحظورة...');
        } catch (error) {
            console.error('❌ خطأ في تحديث الدول المحظورة:', error);
        }
    }

    getBannedCountries() {
        return [...this.bannedCountries];
    }

    addBannedCountry(countryCode) {
        if (!this.bannedCountries.includes(countryCode)) {
            this.bannedCountries.push(countryCode);
            console.log(`🚫 تم إضافة ${countryCode} إلى القائمة المحظورة`);
        }
    }

    removeBannedCountry(countryCode) {
        const index = this.bannedCountries.indexOf(countryCode);
        if (index > -1) {
            this.bannedCountries.splice(index, 1);
            console.log(`✅ تم إزالة ${countryCode} من القائمة المحظورة`);
        }
    }
}

// 📝 نظام التسجيل الأمني المحسن
class SecurityLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 5000;
        this.alertThresholds = {
            highRisk: 5,
            critical: 3,
            failedAuth: 10
        };
    }

    logSecurityEvent(event) {
        const logEntry = {
            id: crypto.randomBytes(8).toString('hex'),
            timestamp: new Date().toISOString(),
            type: event.type,
            severity: event.severity,
            userId: event.userId || 'unknown',
            ip: event.ip || 'unknown',
            userAgent: event.userAgent || 'unknown',
            endpoint: event.endpoint || 'unknown',
            details: event.details || {},
            riskLevel: event.riskLevel || 0,
            actionTaken: event.actionTaken || 'logged',
            session: event.session || 'unknown'
        };

        this.logs.unshift(logEntry);
        
        // الحفاظ على حجم اللوجز
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        // 📨 إرسال إنذار للأنشطة عالية الخطورة
        if (event.severity === 'critical' || event.riskLevel > 80) {
            this.sendSecurityAlert(logEntry);
        }

        // تسجيل في قاعدة البيانات
        dbManager.logSecurityEvent(logEntry);

        console.log(`🔒 [${event.severity.toUpperCase()}] ${event.type}:`, {
            userId: event.userId,
            ip: event.ip,
            endpoint: event.endpoint,
            riskLevel: event.riskLevel
        });

        return logEntry.id;
    }

    sendSecurityAlert(logEntry) {
        // يمكن إضافة إرسال إشعارات إلى Telegram أو Email هنا
        console.log('🚨 إنذار أمني:', {
            type: logEntry.type,
            severity: logEntry.severity,
            userId: logEntry.userId,
            ip: logEntry.ip,
            endpoint: logEntry.endpoint,
            timestamp: logEntry.timestamp,
            riskLevel: logEntry.riskLevel
        });
    }

    // 📊 إحصائيات الأمان
    getSecurityStats(timeRange = 3600000) { // آخر ساعة
        const startTime = Date.now() - timeRange;
        const recentLogs = this.logs.filter(log => new Date(log.timestamp).getTime() > startTime);
        
        const stats = {
            totalRequests: this.logs.length,
            recentRequests: recentLogs.length,
            highRiskRequests: recentLogs.filter(log => log.riskLevel > 70).length,
            criticalEvents: recentLogs.filter(log => log.severity === 'critical').length,
            blockedRequests: recentLogs.filter(log => log.actionTaken.includes('block')).length,
            failedAuth: recentLogs.filter(log => log.type.includes('auth') && !log.details.success).length,
            topThreats: this.getTopThreats(recentLogs),
            riskDistribution: this.getRiskDistribution(recentLogs)
        };

        return stats;
    }

    getTopThreats(logs) {
        const threatCount = {};
        logs.forEach(log => {
            threatCount[log.type] = (threatCount[log.type] || 0) + 1;
        });
        
        return Object.entries(threatCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8)
            .map(([type, count]) => ({ type, count }));
    }

    getRiskDistribution(logs) {
        const distribution = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0
        };

        logs.forEach(log => {
            if (log.riskLevel >= 80) distribution.critical++;
            else if (log.riskLevel >= 60) distribution.high++;
            else if (log.riskLevel >= 40) distribution.medium++;
            else distribution.low++;
        });

        return distribution;
    }

    searchLogs(criteria) {
        return this.logs.filter(log => {
            return Object.keys(criteria).every(key => {
                if (key === 'timestamp') {
                    return new Date(log[key]) >= new Date(criteria[key]);
                }
                return log[key] === criteria[key];
            });
        });
    }
}

// تهيئة أنظمة الحماية
const dbManager = new SecureDatabaseManager();
const deviceFingerprint = new AdvancedDeviceFingerprint();
const requestMonitor = new AdvancedRequestMonitor();
const telegramEnforcer = new EnhancedTelegramEnforcer();
const tokenSystem = new EnhancedDynamicTokenSystem();
const geolocationSystem = new EnhancedGeoLocationSystem();
const securityLogger = new SecurityLogger();

// بدء الأنظمة
tokenSystem.start();

// 🔧 دوال مساعدة محسنة
async function checkDatabaseConnection() {
    try {
        await dbManager.waitForInitialization();
        const result = await dbManager.query('SELECT NOW() as current_time');
        console.log('✅ قاعدة البيانات متصلة - الوقت الحالي:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
        return false;
    }
}

function validateTelegramInitData(initData) {
    try {
        console.log('=== بدء التحقق من التوقيع ===');
        
        if (!initData) {
            console.log('❌ initData غير موجود');
            return false;
        }

        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        
        const hash = parsedData.hash;
        
        console.log('🔑 الهاش المستلم:', hash);

        if (!hash) {
            console.log('❌ لا يوجد هاش في initData');
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
        
        console.log('🔑 الهاش المتوقع:', expectedHash);
        console.log('🔑 الهاش المستلم:', hash);

        const isValid = expectedHash === hash;
        console.log('✅ نتيجة التحقق:', isValid ? 'صالح' : 'غير صالح');
        
        return isValid;
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
        await dbManager.waitForInitialization();
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
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        return null;
    }
}

// 🛡️ middleware محسن للتحقق من التوكن والحماية
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
        '/api/security/status',
        '/api/security/stats'
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
        securityLogger.logSecurityEvent({
            type: 'non_telegram_blocked',
            severity: 'high',
            userId: 'unknown',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            details: { 
                origin: req.headers['origin'],
                referer: req.headers['referer']
            },
            riskLevel: 80,
            actionTaken: 'request_blocked'
        });
        
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
        console.log('❌ طلب بدون توكن:', req.path);
        
        securityLogger.logSecurityEvent({
            type: 'missing_token',
            severity: 'medium',
            userId: 'unknown',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            details: { headers: req.headers },
            riskLevel: 50,
            actionTaken: 'request_blocked'
        });
        
        return res.status(401).json({ 
            success: false,
            error: 'التوكن الديناميكي مطلوب',
            code: 'DYNAMIC_TOKEN_REQUIRED'
        });
    }

    const tokenValidation = tokenSystem.validateToken(token, req.headers['user-agent']);
    if (!tokenValidation.valid) {
        console.log('🔄 محاولة تجديد التوكن تلقائياً...');
        tokenSystem.updateToken();
        
        securityLogger.logSecurityEvent({
            type: 'invalid_token',
            severity: 'medium',
            userId: 'unknown',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            details: { 
                reason: tokenValidation.reason,
                token: token.substring(0, 10) + '...'
            },
            riskLevel: 60,
            actionTaken: 'token_refreshed'
        });
        
        return res.status(401).json({ 
            success: false,
            error: 'توكن ديناميكي غير صالح أو منتهي',
            code: 'INVALID_DYNAMIC_TOKEN',
            hint: 'جرب تحديث الصفحة'
        });
    }

    // 3. تحديد معدل الطلبات
    const deviceHash = deviceFingerprint.generateDeviceFingerprint(req, req.body?.initData);
    const rateLimitCheck = requestMonitor.checkRateLimit(deviceHash, req.path);
    
    if (!rateLimitCheck.allowed) {
        securityLogger.logSecurityEvent({
            type: 'rate_limit_exceeded',
            severity: 'medium',
            userId: 'unknown',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            details: { 
                reason: rateLimitCheck.reason,
                deviceHash 
            },
            riskLevel: 70,
            actionTaken: 'request_blocked'
        });
        
        return res.status(429).json({ 
            success: false,
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: 60
        });
    }

    // 4. فحص الطلب لاكتشاف الهجمات
    const requestAnalysis = requestMonitor.analyzeRequest(req);
    if (requestAnalysis.isSuspicious) {
        securityLogger.logSecurityEvent({
            type: 'suspicious_request',
            severity: 'high',
            userId: 'unknown',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            details: { 
                analysis: requestAnalysis,
                deviceHash 
            },
            riskLevel: requestAnalysis.riskLevel,
            actionTaken: 'request_analyzed'
        });
        
        if (requestAnalysis.riskLevel > 80) {
            return res.status(429).json({ 
                success: false,
                error: 'Suspicious activity detected',
                code: 'SUSPICIOUS_REQUEST'
            });
        }
    }

    // 5. التحقق من initData لطلبات POST
    if (req.method === 'POST' && req.body && req.body.initData) {
        const deviceValidation = deviceFingerprint.validateDeviceUser(req, req.body.initData);
        if (!deviceValidation.success) {
            securityLogger.logSecurityEvent({
                type: 'device_validation_failed',
                severity: 'high',
                userId: deviceValidation.userId,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                endpoint: req.path,
                details: { 
                    error: deviceValidation.error,
                    banReason: deviceValidation.banReason,
                    deviceHash: deviceValidation.deviceHash
                },
                riskLevel: 85,
                actionTaken: 'request_blocked'
            });
            
            return res.status(403).json({ 
                success: false,
                error: deviceValidation.error,
                code: 'DEVICE_VALIDATION_FAILED',
                banReason: deviceValidation.banReason
            });
        }

        // ربط الجهاز بالطلب
        req.deviceHash = deviceValidation.deviceHash;
        req.userId = deviceValidation.userId;
    }

    next();
};

app.use(advancedSecurityMiddleware);
// 📺 مشاهدة إعلان - مع الحماية المضافة
app.post('/api/watch-ad', async (req, res) => {
    let client;
    
    try {
        const { initData } = req.body;

        console.log('📥 طلب مشاهدة إعلان');

        if (!initData) {
            console.log('❌ initData غير موجود');
            return res.status(400).json({ 
                success: false,
                error: 'initData is required' 
            });
        }

        // 🔒 التحقق المكثف من التوقيع
        if (!validateTelegramInitData(initData)) {
            securityLogger.logSecurityEvent({
                type: 'invalid_signature',
                severity: 'high',
                userId: req.userId,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                endpoint: '/api/watch-ad',
                details: { initData: initData.substring(0, 50) + '...' },
                riskLevel: 80,
                actionTaken: 'request_blocked'
            });
            
            console.log('❌ فشل التحقق - رفض مشاهدة الإعلان');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة مشاهدة الإعلان');
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            console.log('❌ بيانات المستخدم غير صالحة');
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
        console.log(`👤 معالجة مشاهدة إعلان للمستخدم: ${userId}`);
        
        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        // 🔒 استخدام SELECT FOR UPDATE لمنع التنافس
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

        // 📅 التحقق من الحد اليومي
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
        
        console.log(`💰 مكافأة الإعلان: ${adReward} TON`);
        
        // 💰 تحديث رصيد المستخدم
        const updateResult = await client.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1,
                daily_ad_count = $2,
                last_ad_date = CURRENT_DATE,
                last_ad_timestamp = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
             WHERE telegram_id = $3 
             RETURNING *`,
            [adReward, dailyAdCount + 1, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            try {
                // 🏆 تحديث المسابقة
                const existingContest = await client.query(
                    'SELECT * FROM contest_leaderboard WHERE user_id = $1',
                    [userId]
                );

                if (existingContest.rows.length > 0) {
                    await client.query(`
                        UPDATE contest_leaderboard SET 
                            points = points + $1,
                            ads_watched = ads_watched + 1,
                            last_activity = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = $2
                    `, [config.contestAdPoints, userId]);
                } else {
                    await client.query(`
                        INSERT INTO contest_leaderboard 
                        (user_id, username, first_name, points, ads_watched, last_activity, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    `, [userId, user.username || '', user.first_name || 'User', config.contestAdPoints]);
                }
                
                console.log('✅ تمت مشاهدة الإعلان بنجاح + نقطة مسابقة واحدة');
            } catch (contestError) {
                console.log('⚠️  خطأ في تحديث المسابقة:', contestError.message);
            }

            await client.query('COMMIT');
            
            // 🔢 حساب رصيد RR
            const userRRBalance = Math.floor((parseFloat(updatedUser.earning_wallet || 0) * 10000000));
            
            // 📝 تسجيل النشاط
            securityLogger.logSecurityEvent({
                type: 'ad_watched',
                severity: 'low',
                userId: userId,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                endpoint: '/api/watch-ad',
                details: { 
                    reward: adReward,
                    dailyCount: dailyAdCount + 1,
                    contestPoints: config.contestAdPoints
                },
                riskLevel: 0,
                actionTaken: 'ad_processed'
            });
            
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (dailyAdCount + 1),
                totalEarned: parseFloat(updatedUser.total_earned || 0),
                contestPoints: config.contestAdPoints,
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
        
        securityLogger.logSecurityEvent({
            type: 'ad_watch_error',
            severity: 'medium',
            userId: req.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/watch-ad',
            details: { error: error.message },
            riskLevel: 30,
            actionTaken: 'error_logged'
        });
        
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

        console.log(`📥 طلب جلب بيانات المستخدم: ${userId}`);

        if (!initData) {
            return res.status(400).json({ 
                success: false,
                error: 'initData مطلوب' 
            });
        }

        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - رفض الطلب');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة الطلب');
        
        let user = await getUserFromDB(userId);
        let isNewUser = false;
        
        if (!user) {
            console.log('🆕 المستخدم غير موجود - تسجيل تلقائي...');
            
            const telegramUser = parseTelegramUser(initData);
            
            if (telegramUser?.id) {
                const newUser = {
                    telegram_id: telegramUser.id.toString(),
                    username: telegramUser.username || '',
                    first_name: telegramUser.first_name || 'مستخدم'
                };

                user = await createUserInDB(newUser);
                isNewUser = true;
                
                if (user) {
                    console.log('✅ تم التسجيل التلقائي بنجاح');
                    
                    securityLogger.logSecurityEvent({
                        type: 'user_registered',
                        severity: 'low',
                        userId: userId,
                        ip: req.ip,
                        userAgent: req.headers['user-agent'],
                        endpoint: '/api/user/:userId',
                        details: { 
                            username: newUser.username,
                            firstName: newUser.first_name,
                            isNewUser: true
                        },
                        riskLevel: 0,
                        actionTaken: 'user_created'
                    });
                } else {
                    console.log('❌ فشل في التسجيل التلقائي');
                }
            }
        }

        if (user) {
            console.log('✅ تم العثور على المستخدم');
            
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
            console.log('❌ فشل في التسجيل التلقائي');
            res.status(404).json({ 
                success: false,
                error: 'User not found - Registration failed' 
            });
        }
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات المستخدم:', error.message);
        
        securityLogger.logSecurityEvent({
            type: 'user_fetch_error',
            severity: 'medium',
            userId: req.params.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/user/:userId',
            details: { error: error.message },
            riskLevel: 40,
            actionTaken: 'error_logged'
        });
        
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

        console.log('📥 طلب تسجيل مستخدم جديد');

        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - رفض التسجيل');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة التسجيل');
        
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            console.log('❌ بيانات المستخدم غير صالحة');
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
        console.log(`👤 معالجة المستخدم: ${userId}`);
        
        let user = await getUserFromDB(userId);
        
        if (user) {
            console.log('✅ المستخدم موجود بالفعل');
            
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

        console.log('🆕 إنشاء مستخدم جديد...');
        const newUser = {
            telegram_id: userId,
            username: telegramUser.username || '',
            first_name: telegramUser.first_name || 'مستخدم'
        };

        user = await createUserInDB(newUser);

        if (user) {
            console.log('✅ تم إنشاء المستخدم بنجاح');
            
            securityLogger.logSecurityEvent({
                type: 'user_registered_direct',
                severity: 'low',
                userId: userId,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                endpoint: '/api/register',
                details: { 
                    username: newUser.username,
                    firstName: newUser.first_name
                },
                riskLevel: 0,
                actionTaken: 'user_created'
            });
            
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
            console.log('❌ فشل في إنشاء المستخدم');
            res.status(500).json({ 
                success: false,
                error: 'Failed to create user' 
            });
        }

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error.message);
        
        securityLogger.logSecurityEvent({
            type: 'registration_error',
            severity: 'medium',
            userId: 'unknown',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/register',
            details: { error: error.message },
            riskLevel: 50,
            actionTaken: 'error_logged'
        });
        
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

        console.log('📥 طلب تحويل الرصيد');

        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - رفض التحويل');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة التحويل');
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            console.log('❌ بيانات المستخدم غير صالحة');
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
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
                earning_wallet = 0,
                updated_at = CURRENT_TIMESTAMP
             WHERE telegram_id = $2 
             RETURNING *`,
            [earningWallet, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            console.log('✅ تم تحويل الرصيد بنجاح');
            
            securityLogger.logSecurityEvent({
                type: 'balance_transfer',
                severity: 'low',
                userId: userId,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                endpoint: '/api/move-to-balance',
                details: { 
                    amount: earningWallet,
                    from: 'earning_wallet',
                    to: 'balance'
                },
                riskLevel: 0,
                actionTaken: 'transfer_completed'
            });
            
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
        
        securityLogger.logSecurityEvent({
            type: 'balance_transfer_error',
            severity: 'medium',
            userId: req.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/move-to-balance',
            details: { error: error.message },
            riskLevel: 40,
            actionTaken: 'error_logged'
        });
        
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

        console.log('📥 طلب سحب:', { amount, walletAddress, method, memo });

        if (!initData || !amount || !walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'بيانات ناقصة: initData, amount, walletAddress مطلوبة'
            });
        }

        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - رفض السحب');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة السحب');
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            console.log('❌ بيانات المستخدم غير صالحة');
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
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

        // التحقق من متطلبات الإحالات
        const minRefsRequired = config.minimumWithdrawReferrals || 0;
        const userReferrals = await client.query(
            'SELECT COUNT(*) as ref_count FROM referrals WHERE referrer_id = $1',
            [userId]
        );
        const referralCount = parseInt(userReferrals.rows[0].ref_count) || 0;

        if (minRefsRequired > 0 && referralCount < minRefsRequired) {
            await client.query('ROLLBACK');
            console.log(`❌ متطلبات الإحالات غير مكتملة: ${referralCount}/${minRefsRequired}`);
            return res.status(400).json({ 
                success: false,
                error: `You need at least ${minRefsRequired} referrals to withdraw. You have ${referralCount}.` 
            });
        }

        // خصم المبلغ من الرصيد
        await client.query(
            'UPDATE bot_users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = $2',
            [withdrawAmount, userId]
        );

        // إنشاء طلب السحب
        const withdrawalResult = await client.query(
            `INSERT INTO withdrawals 
             (user_id, amount, wallet_address, status, method, memo, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
             RETURNING *`,
            [userId, withdrawAmount, walletAddress, 'pending', method, memo || '']
        );

        await client.query('COMMIT');

        const withdrawal = withdrawalResult.rows[0];
        
        console.log('✅ تم إنشاء طلب السحب بنجاح:', withdrawal.id);
        
        securityLogger.logSecurityEvent({
            type: 'withdrawal_created',
            severity: 'low',
            userId: userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/withdraw',
            details: { 
                amount: withdrawAmount,
                method: method,
                wallet: walletAddress.substring(0, 10) + '...',
                withdrawalId: withdrawal.id
            },
            riskLevel: 20,
            actionTaken: 'withdrawal_created'
        });
        
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
        
        securityLogger.logSecurityEvent({
            type: 'withdrawal_error',
            severity: 'high',
            userId: req.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/withdraw',
            details: { 
                error: error.message,
                amount: req.body.amount,
                method: req.body.method
            },
            riskLevel: 60,
            actionTaken: 'error_logged'
        });
        
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

        console.log(`📥 طلب تاريخ السحوبات للمستخدم: ${userId}`);

        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - رفض الطلب');
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
                created_at,
                updated_at
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
        
        securityLogger.logSecurityEvent({
            type: 'withdrawals_fetch_error',
            severity: 'medium',
            userId: req.params.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/withdrawals/:userId',
            details: { error: error.message },
            riskLevel: 30,
            actionTaken: 'error_logged'
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
        
        // التأكد من وجود جدول المسابقة
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const actualPoints = points;
        const actualAds = adsWatched;
        
        const result = await dbManager.query(`
            INSERT INTO contest_leaderboard 
            (user_id, username, first_name, points, ads_watched, referrals_count, last_activity, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                points = contest_leaderboard.points + $4,
                ads_watched = contest_leaderboard.ads_watched + $5,
                referrals_count = contest_leaderboard.referrals_count + $6,
                last_activity = EXCLUDED.last_activity,
                updated_at = EXCLUDED.updated_at
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
        
        securityLogger.logSecurityEvent({
            type: 'contest_update_error',
            severity: 'medium',
            userId: req.body.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/contest/update-points',
            details: { error: error.message },
            riskLevel: 40,
            actionTaken: 'error_logged'
        });
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب المتصدرين مرتبين حسب النقاط
app.get('/api/contest/leaderboard', async (req, res) => {
    try {
        const leaderboard = await updateContestLeaderboard();
        
        console.log(`📊 جلب ${leaderboard.length} متسابق من المسابقة`);
        
        res.json({
            success: true,
            leaderboard: leaderboard,
            totalParticipants: leaderboard.length,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المتصدرين:', error);
        
        securityLogger.logSecurityEvent({
            type: 'leaderboard_fetch_error',
            severity: 'medium',
            userId: 'unknown',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/contest/leaderboard',
            details: { error: error.message },
            riskLevel: 30,
            actionTaken: 'error_logged'
        });
        
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
        
        console.log(`🏆 ترتيب المستخدم ${userId}: ${userRank}`);
        
        res.json({
            success: true,
            userId: userId,
            rank: userRank,
            inLeaderboard: userRank > 0
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الترتيب:', error);
        
        securityLogger.logSecurityEvent({
            type: 'user_rank_fetch_error',
            severity: 'medium',
            userId: req.params.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/contest/user-rank/:userId',
            details: { error: error.message },
            riskLevel: 30,
            actionTaken: 'error_logged'
        });
        
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
        console.error('❌ خطأ في جلب بيانات مسابقة المستخدم:', error);
        
        securityLogger.logSecurityEvent({
            type: 'user_contest_data_error',
            severity: 'medium',
            userId: req.params.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/contest/user/:userId',
            details: { error: error.message },
            riskLevel: 30,
            actionTaken: 'error_logged'
        });
        
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
        
        console.log(`⚡ تم تحديث قائمة المتصدرين: ${leaderboard?.rows?.length || 0} متسابق`);
        return leaderboard?.rows || [];
    } catch (error) {
        console.error('❌ خطأ في تحديث المتصدرين:', error);
        return [];
    }
}

// 👥 نظام الإحالات
app.post('/api/referrals/add', async (req, res) => {
    try {
        const { referrerId, referredId } = req.body;
        
        console.log(`👥 محاولة إضافة إحالة: ${referrerId} أحال ${referredId}`);
        
        // التحقق من وجود المستخدم المُحال
        const referredUser = await getUserFromDB(referredId);
        if (!referredUser) {
            return res.status(404).json({ success: false, error: 'Referred user not found' });
        }
        
        // التحقق من عدم وجود الإحالة مسبقاً
        const existingReferral = await dbManager.query(
            'SELECT * FROM referrals WHERE referred_id = $1',
            [referredId]
        );
        
        if (existingReferral.rows.length > 0) {
            return res.json({ success: true, message: 'User already referred', referral: existingReferral.rows[0] });
        }
        
        // إنشاء الإحالة
        const result = await dbManager.query(`
            INSERT INTO referrals (referrer_id, referred_id, status, created_at)
            VALUES ($1, $2, 'active', CURRENT_TIMESTAMP)
            RETURNING *
        `, [referrerId, referredId]);
        
        // تحديث نقاط المسابقة للمُحيل
        await dbManager.query(`
            INSERT INTO contest_leaderboard (user_id, referrals_count, points, last_activity, created_at, updated_at)
            VALUES ($1, 1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                referrals_count = contest_leaderboard.referrals_count + 1,
                points = contest_leaderboard.points + $2,
                last_activity = EXCLUDED.last_activity,
                updated_at = EXCLUDED.updated_at
        `, [referrerId, config.contestReferralPoints]);
        
        console.log(`✅ تم تسجيل الإحالة بنجاح: +${config.contestReferralPoints} نقطة للمستخدم ${referrerId}`);
        
        securityLogger.logSecurityEvent({
            type: 'referral_added',
            severity: 'low',
            userId: referrerId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/referrals/add',
            details: { 
                referredId: referredId,
                points: config.contestReferralPoints
            },
            riskLevel: 0,
            actionTaken: 'referral_created'
        });
        
        res.json({
            success: true,
            referral: result.rows[0],
            contestPoints: config.contestReferralPoints,
            message: `تم تسجيل الإحالة بنجاح +${config.contestReferralPoints} نقطة مسابقة`
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل الإحالة:', error);
        
        securityLogger.logSecurityEvent({
            type: 'referral_error',
            severity: 'medium',
            userId: req.body.referrerId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/referrals/add',
            details: { error: error.message },
            riskLevel: 40,
            actionTaken: 'error_logged'
        });
        
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
        console.error('❌ خطأ في جلب بيانات الإحالات:', error);
        
        securityLogger.logSecurityEvent({
            type: 'referrals_fetch_error',
            severity: 'medium',
            userId: req.params.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/referrals/user/:userId',
            details: { error: error.message },
            riskLevel: 30,
            actionTaken: 'error_logged'
        });
        
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
            securityLogger.logSecurityEvent({
                type: 'initdata_validation_failed',
                severity: 'medium',
                userId: 'unknown',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                endpoint: '/api/validate-initdata',
                details: { initData: initData.substring(0, 50) + '...' },
                riskLevel: 60,
                actionTaken: 'validation_failed'
            });
            
            res.status(401).json({
                success: false,
                error: 'Invalid Telegram initData'
            });
        }
    } catch (error) {
        console.error('❌ خطأ في التحقق من initData:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/security/status', async (req, res) => {
    try {
        const securityStats = securityLogger.getSecurityStats();
        const dbHealth = await dbManager.healthCheck();
        const tokenStats = tokenSystem.getStats();
        
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
                    requestLimits: requestMonitor.requestLimits.size,
                    loginAttempts: requestMonitor.loginAttempts.size
                },
                telegramEnforcer: 'active',
                tokenSystem: tokenStats,
                geolocation: {
                    bannedCountries: geolocationSystem.getBannedCountries(),
                    countryCache: geolocationSystem.countryCache.size
                },
                logging: securityStats
            },
            database: dbHealth,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ خطأ في جلب حالة الحماية:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/security/stats', async (req, res) => {
    try {
        const stats = securityLogger.getSecurityStats();
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات الأمان:', error);
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
        
        console.log(`⚠️  تم الإبلاغ عن نشاط مشبوه: ${activityType} من المستخدم ${telegramUser?.id}`);
        
        securityLogger.logSecurityEvent({
            type: 'suspicious_activity_reported',
            severity: 'medium',
            userId: telegramUser?.id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: '/api/security/report',
            details: { 
                activityType: activityType,
                userDetails: details,
                deviceHash: deviceHash
            },
            riskLevel: 50,
            actionTaken: 'activity_reported'
        });
        
        res.json({
            success: true,
            message: 'Suspicious activity reported successfully',
            activityType: activityType,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ خطأ في الإبلاغ عن النشاط المشبوه:', error);
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
        console.error('❌ خطأ في كشف الدولة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🩹 فحص وإصلاح الجداول
app.get('/api/check-tables', async (req, res) => {
    try {
        console.log('🔍 فحص حالة الجداول...');
        
        const tables = [
            'bot_users',
            'withdrawals', 
            'contest_leaderboard',
            'referrals',
            'security_logs'
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
                console.log(`📊 ${table}: ${result.rows[0].exists ? '✅ موجود' : '❌ غير موجود'}`);
            } catch (error) {
                results[table] = false;
                console.log(`❌ خطأ في فحص جدول ${table}:`, error.message);
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
        console.log('🔧 بدء إعداد الجداول...');
        
        await dbManager.ensureBasicTables();
        
        res.json({
            success: true,
            message: 'تم إنشاء جميع الجداول بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في إعداد الجداول:', error);
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
        const securityStats = securityLogger.getSecurityStats(300000); // آخر 5 دقائق
        
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbStatus ? 'connected' : 'disconnected',
            tokenSystem: tokenStats,
            security: securityStats,
            uptime: process.uptime(),
            memory: process.memoryUsage()
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
            connected: status.healthy,
            initialized: dbManager.initialized,
            retryCount: dbManager.retryCount,
            details: status
        });
    } catch (error) {
        res.json({
            success: false,
            connected: false,
            error: error.message
        });
    }
});

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 TON Rewards Backend is Running!',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        features: [
            'Advanced Security System',
            'Dynamic Token Protection',
            'Device Fingerprinting',
            'Geo-Location Filtering',
            'Real-time Monitoring',
            'Comprehensive Logging'
        ]
    });
});

// 🛑 معالج الأخطاء العام
app.use((error, req, res, next) => {
    console.error('❌ خطأ غير متوقع:', error);
    
    securityLogger.logSecurityEvent({
        type: 'unhandled_error',
        severity: 'critical',
        userId: req.userId || 'unknown',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        endpoint: req.path,
        details: { 
            error: error.message,
            stack: error.stack
        },
        riskLevel: 90,
        actionTaken: 'error_handled'
    });
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});

// 404 معالج
app.use('*', (req, res) => {
    securityLogger.logSecurityEvent({
        type: '404_not_found',
        severity: 'low',
        userId: 'unknown',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        endpoint: req.originalUrl,
        details: { method: req.method },
        riskLevel: 10,
        actionTaken: 'route_not_found'
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
    if (dbManager.healthCheckInterval) {
        clearInterval(dbManager.healthCheckInterval);
    }
    console.log('✅ تم الإيقاف الآمن');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 إيقاف نظام التوكن...');
    tokenSystem.stop();
    if (dbManager.healthCheckInterval) {
        clearInterval(dbManager.healthCheckInterval);
    }
    console.log('✅ تم الإيقاف الآمن');
    process.exit(0);
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// بدء السيرفر بعد تهيئة قاعدة البيانات
setTimeout(() => {
    app.listen(PORT, HOST, () => {
        console.log(`\n🎉 🟢 TON Rewards Backend running on port ${PORT}`);
        console.log(`💰 Ad reward: ${config.adValue} TON`);
        console.log(`📊 Daily ads: ${config.dailyAdLimit} ads`);
        console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
        console.log(`👥 Referral bonus: ${config.referralBonus} TON`);
        console.log(`🏆 Contest points per ad: ${config.contestAdPoints}`);
        console.log(`🔐 Telegram verification: ENABLED`);
        console.log(`🔄 Dynamic token system: ACTIVE (${tokenSystem.config.tokenRefreshInterval/1000} seconds)`);
        console.log(`🗄️ Database manager: ${dbManager.initialized ? 'ACTIVE' : 'INITIALIZING'}`);
        console.log(`🛡️ Enhanced Security Systems: ENABLED`);
        console.log(`   ├─ Device Fingerprinting: ACTIVE`);
        console.log(`   ├─ Multiple Accounts Prevention: ACTIVE`);
        console.log(`   ├─ Request Monitoring: ACTIVE`);
        console.log(`   ├─ Rate Limiting: ACTIVE`);
        console.log(`   ├─ Telegram Only: ACTIVE`);
        console.log(`   ├─ Geolocation Filtering: ACTIVE`);
        console.log(`   ├─ Security Logging: ACTIVE`);
        console.log(`   └─ Comprehensive Scanning: ACTIVE`);
        console.log(`\n📊 Endpoints Available:`);
        console.log(`   ├─ GET  /api/health - System health check`);
console.log(`   ├─ GET  /api/config - Get configuration`);
console.log(`   ├─ GET  /api/token/current - Get current token`);
console.log(`   ├─ POST /api/watch-ad - Watch advertisement`);
console.log(`   ├─ GET  /api/user/:userId - Get user data`);
console.log(`   ├─ POST /api/register - Register user`);
console.log(`   ├─ POST /api/withdraw - Create withdrawal`);
console.log(`   ├─ GET  /api/withdrawals/:userId - Get withdrawal history`);
console.log(`   ├─ GET  /api/contest/leaderboard - Get contest leaderboard`);
console.log(`   ├─ POST /api/security/report - Report suspicious activity`);
console.log(`   └─ GET  /api/security/status - Get security status`);
console.log(`\n🚀 Server is fully operational and secure!`);

// التحقق النهائي من الأنظمة
setTimeout(async () => {
    try {
        const dbHealth = await dbManager.healthCheck();
        console.log(`\n✅ النظام جاهز بالكامل:`);
        console.log(`   📊 قاعدة البيانات: ${dbHealth.healthy ? '🟢 متصلة' : '🔴 غير متصلة'}`);
        console.log(`   🔐 نظام التوكن: 🟢 نشط (${tokenSystem.tokens.size} توكن نشط)`);
        console.log(`   🛡️  أنظمة الحماية: 🟢 جميع الأنظمة نشطة`);
        console.log(`   📝 نظام التسجيل: 🟢 نشط (${securityLogger.logs.length} حدث)`);
        
        // بدء المهام الدورية
        startPeriodicTasks();
        
    } catch (error) {
        console.error('❌ خطأ في التحقق النهائي:', error);
    }
}, 2000);

// 🔄 المهام الدورية
function startPeriodicTasks() {
    // تنظيف البيانات كل 30 دقيقة
    setInterval(() => {
        console.log('🧹 تنظيف بيانات النظام الدوري...');
        deviceFingerprint.cleanup();
        requestMonitor.cleanup();
    }, 30 * 60 * 1000);

    // تحديث إحصائيات الأمان كل 5 دقائق
    setInterval(() => {
        const stats = securityLogger.getSecurityStats();
        if (stats.recentRequests > 100) {
            console.log(`📊 إحصائيات الأمان - الطلبات: ${stats.recentRequests}, عالية الخطورة: ${stats.highRiskRequests}`);
        }
    }, 5 * 60 * 1000);

    // التحقق من صحة قاعدة البيانات كل دقيقة
    setInterval(async () => {
        try {
            await dbManager.query('SELECT 1');
        } catch (error) {
            console.error('❌ فحص صحة قاعدة البيانات فشل:', error.message);
        }
    }, 60 * 1000);

    console.log('✅ تم بدء المهام الدورية');
}
}, 1000);
