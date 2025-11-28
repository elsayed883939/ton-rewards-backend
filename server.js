const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();

// 🔧 إعداد CORS محسن
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Dynamic-Token', 'Authorization', 'X-Device-Fingerprint']
}));

app.use(express.json());

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHkhaFLpI4J7uYL4xpAEp4_-hc5DnW5yno"; 

// 🔧 نظام إدارة اتصال قاعدة البيانات المحسن والمصلح
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
            console.log(`📝 تنفيذ استعلام: ${text.substring(0, 100)}...`);
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

// 🔥 الإعدادات الجديدة - 100 إعلان يومياً + نقطة واحدة فقط لكل إعلان
const config = {
    adValue: 0.0001,
    dailyAdLimit: 100,
    minWithdrawal: 0.0001,
    referralBonus: 0.0005,
    contestAdPoints: 1,
    contestReferralPoints: 15
};

// 🛡️ نظام بصمة الجهاز المحسن
class DeviceFingerprintSystem {
    constructor() {
        this.deviceUsers = new Map(); // deviceHash -> userId
        this.userDevices = new Map(); // userId -> deviceHash
        this.blockedDevices = new Set();
        this.suspiciousRequests = new Map(); // ip -> request count
    }

    // 🔍 إنشاء بصمة فريدة للجهاز
    generateDeviceFingerprint(req, telegramUser) {
        const fingerprintData = {
            // بيانات تليجرام
            telegramId: telegramUser.id,
            username: telegramUser.username,
            
            // بيانات الشبكة
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            
            // بيانات الجهاز
            platform: req.headers['sec-ch-ua-platform'] || 'unknown',
            accept: req.headers['accept'],
            language: req.headers['accept-language'],
            
            // طابع زمني
            timestamp: Date.now()
        };

        return crypto.createHash('sha512')
            .update(JSON.stringify(fingerprintData))
            .digest('hex')
            .substring(0, 64);
    }

    // ✅ التحقق من جهاز المستخدم
    async validateDevice(userId, deviceHash, req) {
        // 🚫 التحقق من الجهاز المحظور في الذاكرة
        if (this.blockedDevices.has(deviceHash)) {
            throw new Error('DEVICE_BANNED');
        }

        // 🔍 التحقق من الجهاز المحظور في قاعدة البيانات
        const isBlockedInDB = await this.isDeviceBlocked(deviceHash);
        if (isBlockedInDB) {
            this.blockedDevices.add(deviceHash);
            throw new Error('DEVICE_BANNED');
        }

        // 🔍 البحث إذا كان الجهاز مستخدم من قبل
        const existingUser = this.deviceUsers.get(deviceHash);
        
        if (existingUser && existingUser !== userId) {
            // 🚨 جهاز مستخدم من قبل حساب آخر - حظر فوري
            await this.blockDevice(deviceHash, 'MULTI_ACCOUNT_DETECTED');
            throw new Error('DEVICE_ALREADY_USED');
        }

        // ✅ حفظ بيانات الجهاز
        this.deviceUsers.set(deviceHash, userId);
        this.userDevices.set(userId, deviceHash);

        return true;
    }

    // 🚫 حظر الجهاز
    async blockDevice(deviceHash, reason) {
        this.blockedDevices.add(deviceHash);
        
        // حفظ في قاعدة البيانات
        await this.saveBlockedDevice(deviceHash, reason);
        
        console.log(`🚫 Device blocked: ${deviceHash.substring(0, 16)}... - Reason: ${reason}`);
    }

    // 💾 حفظ الجهاز المحظور في قاعدة البيانات
    async saveBlockedDevice(deviceHash, reason) {
        try {
            await dbManager.query(`
                INSERT INTO blocked_devices (device_hash, reason, banned_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (device_hash) DO UPDATE SET 
                    reason = EXCLUDED.reason,
                    banned_at = CURRENT_TIMESTAMP
            `, [deviceHash, reason]);
        } catch (error) {
            console.error('Error saving blocked device:', error);
        }
    }

    // 🔍 التحقق من حظر الجهاز في قاعدة البيانات
    async isDeviceBlocked(deviceHash) {
        try {
            const result = await dbManager.query(
                'SELECT * FROM blocked_devices WHERE device_hash = $1',
                [deviceHash]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error checking blocked device:', error);
            return false;
        }
    }

    // 🚨 تتبع الطلبات المشبوهة
    trackSuspiciousRequest(ip, errorType) {
        const key = `ip_${ip}`;
        if (!this.suspiciousRequests.has(key)) {
            this.suspiciousRequests.set(key, {
                count: 0,
                firstSeen: Date.now(),
                lastError: errorType
            });
        }
        
        const requestData = this.suspiciousRequests.get(key);
        requestData.count++;
        requestData.lastError = errorType;
        
        // 🚫 إذا تجاوز 10 طلبات خاطئة في 5 دقائق - حظر IP
        if (requestData.count > 10 && (Date.now() - requestData.firstSeen) < 300000) {
            this.blockIP(ip, `TOO_MANY_INVALID_REQUESTS: ${errorType}`);
        }
    }

    // 🚫 حظر عنوان IP
    async blockIP(ip, reason) {
        try {
            await dbManager.query(`
                INSERT INTO blocked_ips (ip_address, reason, banned_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
            `, [ip, reason]);
            
            console.log(`🚫 IP blocked: ${ip} - Reason: ${reason}`);
        } catch (error) {
            console.error('Error blocking IP:', error);
        }
    }

    // 🔍 التحقق من IP محظور
    async isIPBlocked(ip) {
        try {
            const result = await dbManager.query(
                'SELECT * FROM blocked_ips WHERE ip_address = $1',
                [ip]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error checking blocked IP:', error);
            return false;
        }
    }
}

// تهيئة نظام بصمة الجهاز
const deviceSystem = new DeviceFingerprintSystem();

// 🛡️ نظام تحليل السلوك المشبوه
class BehaviorAnalysisSystem {
    constructor() {
        this.userActivities = new Map();
        this.suspiciousPatterns = new Map();
        this.maxRequestsPerMinute = 30;
        this.blockedUsers = new Set();
    }

    // 🔍 تحليل سلوك المستخدم
    analyzeUserBehavior(userId, action, metadata = {}) {
        const userKey = `user_${userId}`;
        const now = Date.now();
        
        if (!this.userActivities.has(userKey)) {
            this.userActivities.set(userKey, {
                firstSeen: now,
                lastActivity: now,
                actions: new Map(),
                requestCount: 0,
                suspiciousScore: 0,
                activityHistory: []
            });
        }

        const userData = this.userActivities.get(userKey);
        
        // 📊 حساب الوقت بين الطلبات
        const timeDiff = now - userData.lastActivity;
        userData.lastActivity = now;
        userData.requestCount++;
        
        // 🚩 كشف السرعة غير الطبيعية
        if (timeDiff < 100) { // أقل من 100ms بين الطلبات
            userData.suspiciousScore += 10;
        }
        
        // 🚩 إذا تجاوز الحد المسموح للطلبات
        if (userData.requestCount > this.maxRequestsPerMinute) {
            userData.suspiciousScore += 30;
        }

        // 📈 تحليل نمط الإعلانات
        if (action === 'watch_ad') {
            this.analyzeAdPattern(userId, metadata, userData);
        }

        // 💾 حفظ التاريخ النشاط
        userData.activityHistory.push({
            action,
            timestamp: now,
            suspiciousScore: userData.suspiciousScore
        });

        // الاحتفاظ بآخر 50 نشاط فقط
        if (userData.activityHistory.length > 50) {
            userData.activityHistory = userData.activityHistory.slice(-50);
        }

        // 🚨 إذا تجاوز عتبة الشك
        if (userData.suspiciousScore > 50) {
            this.flagSuspiciousUser(userId, 'HIGH_SUSPICIOUS_SCORE');
            return {
                allowed: false,
                reason: 'SUSPICIOUS_BEHAVIOR_DETECTED',
                cooldown: 300000 // 5 دقائق
            };
        }

        return {
            allowed: true,
            suspiciousScore: userData.suspiciousScore
        };
    }

    // 📺 تحليل نمط مشاهدة الإعلانات
    analyzeAdPattern(userId, metadata, userData) {
        const patternKey = `ad_pattern_${userId}`;
        const now = Date.now();
        
        if (!this.suspiciousPatterns.has(patternKey)) {
            this.suspiciousPatterns.set(patternKey, {
                lastAdTime: 0,
                adCount: 0,
                intervals: [],
                averageInterval: 0
            });
        }

        const adData = this.suspiciousPatterns.get(patternKey);
        
        if (adData.lastAdTime > 0) {
            const timeSinceLastAd = now - adData.lastAdTime;
            adData.intervals.push(timeSinceLastAd);
            
            // 🚩 إذا كان الوقت بين الإعلانات أقل من 3 ثواني
            if (timeSinceLastAd < 3000) {
                userData.suspiciousScore += 15;
            }
            
            // 🚩 إذا كانت الفترات متطابقة بشكل غير طبيعي
            if (this.isRoboticTiming(adData.intervals)) {
                userData.suspiciousScore += 20;
            }
            
            // حساب متوسط الفترة
            if (adData.intervals.length > 5) {
                adData.averageInterval = adData.intervals.reduce((a, b) => a + b) / adData.intervals.length;
                
                // 🚩 إذا كان المتوسط أقل من 5 ثواني
                if (adData.averageInterval < 5000) {
                    userData.suspiciousScore += 10;
                }
            }
            
            // الاحتفاظ بآخر 20 فاصل زمني
            if (adData.intervals.length > 20) {
                adData.intervals = adData.intervals.slice(-20);
            }
        }
        
        adData.lastAdTime = now;
        adData.adCount++;
    }

    // 🔍 كشف التوقيت الآلي
    isRoboticTiming(intervals) {
        if (intervals.length < 5) return false;
        
        // حساب الانحراف المعياري
        const mean = intervals.reduce((a, b) => a + b) / intervals.length;
        const squareDiffs = intervals.map(value => Math.pow(value - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b) / intervals.length;
        const stdDev = Math.sqrt(avgSquareDiff);
        
        // إذا كان الانحراف المعياري صغير جداً (توقيت دقيق)
        return stdDev < 100;
    }

    // 🚨 وضع علامة على مستخدم مشبوه
    flagSuspiciousUser(userId, reason) {
        this.blockedUsers.add(userId);
        console.log(`🚨 User flagged as suspicious: ${userId} - Reason: ${reason}`);
        
        // حفظ في قاعدة البيانات
        this.saveSuspiciousUser(userId, reason);
    }

    // 💾 حفظ المستخدم المشبوه في قاعدة البيانات
    async saveSuspiciousUser(userId, reason) {
        try {
            await dbManager.query(`
                INSERT INTO suspicious_users (user_id, reason, flagged_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET 
                    reason = EXCLUDED.reason,
                    flagged_at = CURRENT_TIMESTAMP
            `, [userId, reason]);
        } catch (error) {
            console.error('Error saving suspicious user:', error);
        }
    }

    // 🔍 التحقق من حظر المستخدم
    async isUserBlocked(userId) {
        try {
            const result = await dbManager.query(
                'SELECT * FROM suspicious_users WHERE user_id = $1',
                [userId]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error checking blocked user:', error);
            return false;
        }
    }
}

// تهيئة نظام تحليل السلوك
const behaviorSystem = new BehaviorAnalysisSystem();

// 🔧 نظام التوكن الديناميكي المحسن
class DynamicTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenHistory = [];
        this.tokenCounter = 0;
        this.intervalId = null;
        
        this.config = {
            tokenRefreshInterval: 5000, // 5 ثواني فقط!
            tokenValidityWindow: 15000, // 15 ثانية صلاحية
            maxTokens: 10,
            secretKey: process.env.TOKEN_SECRET || 'ton-rewards-dynamic-token-secret-2024-ultra-secure'
        };
    }

    generateToken() {
        const timestamp = Date.now();
        this.tokenCounter++;
        
        const tokenData = {
            timestamp,
            counter: this.tokenCounter,
            random: crypto.randomBytes(64).toString('hex'),
            userAgent: 'ton-rewards-webapp-telegram-only',
            version: '2.0-secure'
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
        console.log('🚀 بدء نظام التوكن الديناميكي المحسن...');
        console.log(`🔄 معدل التحديث: ${this.config.tokenRefreshInterval/1000} ثواني`);
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
            token: newToken.token.substring(0, 16) + '...',
            timestamp: new Date(newToken.timestamp).toLocaleTimeString(),
            counter: newToken.counter
        });
        
        if (this.tokenHistory.length > this.config.maxTokens) {
            this.tokenHistory.pop();
        }

        this.cleanExpiredTokens();
        console.log(`🔄 تحديث التوكن #${newToken.counter} (${new Date().toLocaleTimeString()})`);
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
            console.log('❌ توكن غير صالح - فارغ أو قصير');
            return false;
        }

        const tokenData = this.tokens.get(token);
        if (!tokenData) {
            console.log('❌ توكن غير معترف به');
            return false;
        }
        
        const now = Date.now();
        if (tokenData.expiresAt < now) {
            this.tokens.delete(token);
            console.log('⏰ توكن منتهي');
            return false;
        }
        
        console.log('✅ توكن صالح');
        return true;
    }

    getCurrentToken() {
        return this.currentToken;
    }

    getStats() {
        return {
            currentToken: this.currentToken ? this.currentToken.substring(0, 16) + '...' : null,
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

// تهيئة نظام التوكن المحسن
const tokenSystem = new DynamicTokenSystem();
tokenSystem.start();

// 🔒 middleware محسن للتحقق من التوكن والجهاز
const validateSecurity = async (req, res, next) => {
    try {
        // 📱 التحقق من أن الطلب من تليجرام ويب آب فقط
        const userAgent = req.headers['user-agent'] || '';
        if (!userAgent.includes('Telegram') && !userAgent.includes('TelegramBot')) {
            console.log('🚫 طلب غير مصرح به - ليس من تليجرام');
            await deviceSystem.trackSuspiciousRequest(req.ip, 'NON_TELEGRAM_ACCESS');
            return res.status(403).json({ 
                success: false,
                error: 'Access allowed only from Telegram WebApp',
                code: 'TELEGRAM_ONLY'
            });
        }

        // 🔍 التحقق من IP محظور
        const isIPBlocked = await deviceSystem.isIPBlocked(req.ip);
        if (isIPBlocked) {
            console.log('🚫 IP محظور:', req.ip);
            return res.status(403).json({ 
                success: false,
                error: 'IP address blocked',
                code: 'IP_BLOCKED'
            });
        }

        // 🔐 التحقق من التوكن الديناميكي
        const token = req.headers['x-dynamic-token'] || 
                      req.headers['authorization']?.replace('Bearer ', '') || 
                      req.query.dynamicToken;

        if (!token) {
            console.log('❌ طلب بدون توكن:', req.path);
            await deviceSystem.trackSuspiciousRequest(req.ip, 'MISSING_TOKEN');
            return res.status(401).json({ 
                success: false,
                error: 'التوكن الديناميكي مطلوب',
                code: 'DYNAMIC_TOKEN_REQUIRED'
            });
        }

        if (!tokenSystem.validateToken(token)) {
            console.log('🔄 محاولة تجديد التوكن تلقائياً...');
            await deviceSystem.trackSuspiciousRequest(req.ip, 'INVALID_TOKEN');
            
            tokenSystem.updateToken();
            return res.status(401).json({ 
                success: false,
                error: 'توكن ديناميكي غير صالح أو منتهي',
                code: 'INVALID_DYNAMIC_TOKEN',
                hint: 'جرب تحديث الصفحة'
            });
        }

        next();
    } catch (error) {
        console.error('❌ خطأ في التحقق الأمني:', error);
        res.status(500).json({ 
            success: false,
            error: 'Security validation failed'
        });
    }
};

// 🔒 middleware للتحقق من الجهاز والمستخدم
const validateDeviceAndUser = async (req, res, next) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ 
                success: false,
                error: 'initData مطلوب' 
            });
        }

        // 🔐 التحقق من توقيع تليجرام
        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - توقيع تليجرام غير صالح');
            await deviceSystem.trackSuspiciousRequest(req.ip, 'INVALID_TELEGRAM_SIGNATURE');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid Telegram security signature' 
            });
        }

        // 👤 تحليل بيانات تليجرام
        const telegramUser = parseTelegramUser(initData);
        
        if (!telegramUser?.id) {
            console.log('❌ بيانات المستخدم غير صالحة');
            await deviceSystem.trackSuspiciousRequest(req.ip, 'INVALID_USER_DATA');
            return res.status(400).json({ 
                success: false,
                error: 'Invalid user data' 
            });
        }

        const userId = telegramUser.id.toString();
        
        // 🚫 التحقق من حظر المستخدم
        const isUserBlocked = await behaviorSystem.isUserBlocked(userId);
        if (isUserBlocked) {
            console.log('🚫 مستخدم محظور:', userId);
            return res.status(403).json({ 
                success: false,
                error: 'User account suspended',
                code: 'USER_BLOCKED'
            });
        }

        // 📱 إنشاء بصمة الجهاز والتحقق منها
        const deviceHash = deviceSystem.generateDeviceFingerprint(req, telegramUser);
        
        try {
            await deviceSystem.validateDevice(userId, deviceHash, req);
        } catch (deviceError) {
            console.log('🚫 خطأ في التحقق من الجهاز:', deviceError.message);
            
            if (deviceError.message === 'DEVICE_BANNED') {
                return res.status(403).json({ 
                    success: false,
                    error: 'Device banned from service',
                    code: 'DEVICE_BANNED'
                });
            } else if (deviceError.message === 'DEVICE_ALREADY_USED') {
                return res.status(403).json({ 
                    success: false,
                    error: 'This device is already associated with another account',
                    code: 'DEVICE_ALREADY_USED'
                });
            }
        }

        // 🔍 تحليل سلوك المستخدم
        const behaviorCheck = behaviorSystem.analyzeUserBehavior(userId, req.method, {
            userAgent: req.headers['user-agent'],
            ip: req.ip,
            endpoint: req.path,
            timestamp: Date.now()
        });

        if (!behaviorCheck.allowed) {
            console.log('🚫 سلوك مشبوه:', userId, behaviorCheck.reason);
            await deviceSystem.trackSuspiciousRequest(req.ip, behaviorCheck.reason);
            
            return res.status(429).json({ 
                success: false,
                error: 'Suspicious activity detected',
                code: 'SUSPICIOUS_BEHAVIOR',
                cooldown: behaviorCheck.cooldown
            });
        }

        // ✅ إضافة بيانات المستخدم للطلب
        req.telegramUser = telegramUser;
        req.userId = userId;
        req.deviceHash = deviceHash;

        next();
    } catch (error) {
        console.error('❌ خطأ في التحقق من الجهاز والمستخدم:', error);
        await deviceSystem.trackSuspiciousRequest(req.ip, 'VALIDATION_ERROR');
        
        res.status(500).json({ 
            success: false,
            error: 'Device and user validation failed' 
        });
    }
};

app.use(validateSecurity);

// 📋 إنشاء الجداول الأمنية
async function createSecurityTables() {
    try {
        console.log('🔧 بدء إنشاء الجداول الأمنية...');
        
        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS blocked_devices (
                id SERIAL PRIMARY KEY,
                device_hash VARCHAR(255) UNIQUE NOT NULL,
                reason VARCHAR(500),
                banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول blocked_devices جاهز');

        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS blocked_ips (
                id SERIAL PRIMARY KEY,
                ip_address VARCHAR(45) UNIQUE NOT NULL,
                reason VARCHAR(500),
                banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول blocked_ips جاهز');

        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS suspicious_users (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                reason VARCHAR(500),
                flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول suspicious_users جاهز');

        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS security_logs (
                id SERIAL PRIMARY KEY,
                user_id BIGINT,
                action VARCHAR(100),
                ip_address VARCHAR(45),
                device_hash VARCHAR(255),
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول security_logs جاهز');

    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول الأمنية:', error);
    }
}

// 📝 دوال مساعدة للتحقق من تليجرام
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

// 👤 دوال مساعدة للتعامل مع قاعدة البيانات
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

// 🔧 دالة للتحقق من اتصال قاعدة البيانات
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
                activeDevices: deviceSystem.deviceUsers.size,
                blockedDevices: deviceSystem.blockedDevices.size,
                suspiciousUsers: behaviorSystem.blockedUsers.size
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

// 🔥 إضافة endpoint جديد للتحقق من صحة initData
app.post('/api/validate-initdata', async (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({
                success: false,
                error: 'initData مطلوب'
            });
        }

        const isValid = validateTelegramInitData(initData);
        
        res.json({
            success: true,
            valid: isValid,
            message: isValid ? 'التوقيع صالح' : 'التوقيع غير صالح'
        });
    } catch (error) {
        console.error('❌ خطأ في التحقق من initData:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📺 مشاهدة إعلان - الإصدار المحمي
app.post('/api/watch-ad', validateDeviceAndUser, async (req, res) => {
    let client;
    
    try {
        const userId = req.userId;
        const deviceHash = req.deviceHash;
        const { initData } = req.body;

        console.log('📥 طلب مشاهدة إعلان من:', userId);

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
        
        console.log(`💰 مكافأة الإعلان: ${adReward} TON`);
        
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
                
                console.log('✅ تمت مشاهدة الإعلان بنجاح + نقطة مسابقة واحدة');
            } catch (contestError) {
                console.log('⚠️  خطأ في تحديث المسابقة:', contestError.message);
            }

            await client.query('COMMIT');
            
            // 📝 تسجيل النشاط الأمني
            try {
                await dbManager.query(`
                    INSERT INTO security_logs (user_id, action, ip_address, device_hash, details)
                    VALUES ($1, $2, $3, $4, $5)
                `, [userId, 'watch_ad', req.ip, deviceHash, {
                    reward: adReward,
                    dailyCount: dailyAdCount + 1,
                    timestamp: new Date().toISOString()
                }]);
            } catch (logError) {
                console.log('⚠️  خطأ في تسجيل النشاط:', logError.message);
            }
            
            setTimeout(async () => {
                try {
                    await updateContestLeaderboard();
                } catch (error) {
                    console.log('⚠️  خطأ في التحديث الفوري:', error.message);
                }
            }, 500);
            
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (dailyAdCount + 1),
                totalEarned: parseFloat(updatedUser.total_earned || 0),
                contestPoints: 1,
                userRRBalance: Math.floor((parseFloat(updatedUser.earning_wallet || 0) * 10000000))
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `AD_ERROR: ${error.message}`);
        
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
app.get('/api/user/:userId', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.params.userId;
        const deviceHash = req.deviceHash;

        console.log(`📥 طلب جلب بيانات المستخدم: ${userId}`);
        
        let user = await getUserFromDB(userId);
        let isNewUser = false;
        
        if (!user) {
            console.log('🆕 المستخدم غير موجود - تسجيل تلقائي...');
            
            const telegramUser = req.telegramUser;
            
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
                    
                    // 📝 تسجيل النشاط الأمني للتسجيل
                    try {
                        await dbManager.query(`
                            INSERT INTO security_logs (user_id, action, ip_address, device_hash, details)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [userId, 'register', req.ip, deviceHash, {
                            isNewUser: true,
                            timestamp: new Date().toISOString()
                        }]);
                    } catch (logError) {
                        console.log('⚠️  خطأ في تسجيل النشاط:', logError.message);
                    }
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `USER_FETCH_ERROR: ${error.message}`);
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user data: ' + error.message 
        });
    }
});

// 👤 تسجيل مستخدم جديد في قاعدة البيانات
app.post('/api/register', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.userId;
        const deviceHash = req.deviceHash;

        console.log('📥 طلب تسجيل مستخدم جديد:', userId);
        
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
        const telegramUser = req.telegramUser;
        const newUser = {
            telegram_id: userId,
            username: telegramUser.username || '',
            first_name: telegramUser.first_name || 'مستخدم'
        };

        user = await createUserInDB(newUser);

        if (user) {
            console.log('✅ تم إنشاء المستخدم بنجاح');
            
            // 📝 تسجيل النشاط الأمني للتسجيل
            try {
                await dbManager.query(`
                    INSERT INTO security_logs (user_id, action, ip_address, device_hash, details)
                    VALUES ($1, $2, $3, $4, $5)
                `, [userId, 'register', req.ip, deviceHash, {
                    isNewUser: true,
                    timestamp: new Date().toISOString()
                }]);
            } catch (logError) {
                console.log('⚠️  خطأ في تسجيل النشاط:', logError.message);
            }
            
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `REGISTER_ERROR: ${error.message}`);
        
        res.status(500).json({ 
            success: false,
            error: 'Registration failed: ' + error.message 
        });
    }
});

// 💰 تحويل المحفظة إلى الرصيد
app.post('/api/move-to-balance', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.userId;
        const deviceHash = req.deviceHash;

        console.log('📥 طلب تحويل الرصيد من:', userId);
        
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
            
            // 📝 تسجيل النشاط الأمني
            try {
                await dbManager.query(`
                    INSERT INTO security_logs (user_id, action, ip_address, device_hash, details)
                    VALUES ($1, $2, $3, $4, $5)
                `, [userId, 'move_to_balance', req.ip, deviceHash, {
                    amount: earningWallet,
                    timestamp: new Date().toISOString()
                }]);
            } catch (logError) {
                console.log('⚠️  خطأ في تسجيل النشاط:', logError.message);
            }
            
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `BALANCE_TRANSFER_ERROR: ${error.message}`);
        
        res.status(500).json({ 
            success: false,
            error: 'Transfer failed' 
        });
    }
});

// 💳 طلب سحب - الإصدار المحمي
app.post('/api/withdraw', validateDeviceAndUser, async (req, res) => {
    let client;
    
    try {
        const userId = req.userId;
        const deviceHash = req.deviceHash;
        const { amount, walletAddress, method = 'TON Wallet', memo = '' } = req.body;

        console.log('📥 طلب سحب من:', userId, { amount, walletAddress, method, memo });

        if (!amount || !walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'بيانات ناقصة: amount, walletAddress مطلوبة'
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
        
        // 📝 تسجيل النشاط الأمني
        try {
            await dbManager.query(`
                INSERT INTO security_logs (user_id, action, ip_address, device_hash, details)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, 'withdraw', req.ip, deviceHash, {
                amount: withdrawAmount,
                method: method,
                wallet: walletAddress,
                withdrawalId: withdrawal.id,
                timestamp: new Date().toISOString()
            }]);
        } catch (logError) {
            console.log('⚠️  خطأ في تسجيل النشاط:', logError.message);
        }
        
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `WITHDRAW_ERROR: ${error.message}`);
        
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

// 📋 الحصول على تاريخ السحوبات - الإصدار المحمي
app.get('/api/withdrawals/:userId', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.userId;
        const deviceHash = req.deviceHash;

        console.log(`📥 طلب تاريخ السحوبات للمستخدم: ${userId}`);
        
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `WITHDRAWALS_FETCH_ERROR: ${error.message}`);
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
    }
});

// 🏆 نظام المسابقة المحمي
app.post('/api/contest/update-points', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.userId;
        const deviceHash = req.deviceHash;
        const { points = 1, adsWatched = 1, referralsCount = 0 } = req.body;
        
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
        
        // 📝 تسجيل النشاط الأمني
        try {
            await dbManager.query(`
                INSERT INTO security_logs (user_id, action, ip_address, device_hash, details)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, 'contest_update', req.ip, deviceHash, {
                points: actualPoints,
                adsWatched: actualAds,
                referralsCount: referralsCount,
                timestamp: new Date().toISOString()
            }]);
        } catch (logError) {
            console.log('⚠️  خطأ في تسجيل النشاط:', logError.message);
        }
        
        setTimeout(async () => {
            try {
                await updateContestLeaderboard();
            } catch (error) {
                console.log('⚠️  خطأ في التحديث الفوري:', error.message);
            }
        }, 300);
        
        res.json({
            success: true,
            contestData: result.rows[0],
            message: 'تم تحديث نقاط المسابقة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث نقاط المسابقة:', error);
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `CONTEST_UPDATE_ERROR: ${error.message}`);
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب المتصدرين مرتبين حسب النقاط
app.get('/api/contest/leaderboard', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.userId;
        const leaderboard = await updateContestLeaderboard();
        
        console.log(`📊 جلب ${leaderboard.length} متسابق من المسابقة للمستخدم: ${userId}`);
        
        res.json({
            success: true,
            leaderboard: leaderboard,
            totalParticipants: leaderboard.length,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المتصدرين:', error);
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `LEADERBOARD_FETCH_ERROR: ${error.message}`);
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب ترتيب مستخدم معين
app.get('/api/contest/user-rank/:userId', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.params.userId;
        const deviceHash = req.deviceHash;
        
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `RANK_FETCH_ERROR: ${error.message}`);
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب بيانات مسابقة مستخدم معين
app.get('/api/contest/user/:userId', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.params.userId;
        const deviceHash = req.deviceHash;
        
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `CONTEST_USER_FETCH_ERROR: ${error.message}`);
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔥 دالة مساعدة لتحديث قائمة المتصدرين
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
        
        console.log(`⚡ تم تحديث قائمة المتصدرين: ${leaderboard.rows.length} متسابق`);
        return leaderboard.rows;
    } catch (error) {
        console.error('❌ خطأ في تحديث المتصدرين:', error);
        return [];
    }
}

// 👥 نظام الإحالات المحمي
app.post('/api/referrals/add', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.userId;
        const deviceHash = req.deviceHash;
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
        
        // 📝 تسجيل النشاط الأمني
        try {
            await dbManager.query(`
                INSERT INTO security_logs (user_id, action, ip_address, device_hash, details)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, 'referral_add', req.ip, deviceHash, {
                referrerId: referrerId,
                referredId: referredId,
                points: 15,
                timestamp: new Date().toISOString()
            }]);
        } catch (logError) {
            console.log('⚠️  خطأ في تسجيل النشاط:', logError.message);
        }
        
        res.json({
            success: true,
            referral: result.rows[0],
            contestPoints: 15,
            message: 'تم تسجيل الإحالة بنجاح +15 نقطة مسابقة'
        });
    } catch (error) {
        console.error('❌ خطأ في تسجيل الإحالة:', error);
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `REFERRAL_ADD_ERROR: ${error.message}`);
        
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/referrals/user/:userId', validateDeviceAndUser, async (req, res) => {
    try {
        const userId = req.params.userId;
        const deviceHash = req.deviceHash;
        
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
        
        // 🚨 تتبع الخطأ كطلب مشبوه
        await deviceSystem.trackSuspiciousRequest(req.ip, `REFERRALS_FETCH_ERROR: ${error.message}`);
        
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
            'reward_codes',
            'code_redemptions',
            'referrals',
            'blocked_devices',
            'blocked_ips',
            'suspicious_users',
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

        // إنشاء الجداول الأمنية
        await createSecurityTables();

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

// 🛡️ endpoints إدارة الأمن
app.get('/api/security/stats', validateDeviceAndUser, async (req, res) => {
    try {
        const blockedDevicesCount = await dbManager.query('SELECT COUNT(*) FROM blocked_devices');
        const blockedIPsCount = await dbManager.query('SELECT COUNT(*) FROM blocked_ips');
        const suspiciousUsersCount = await dbManager.query('SELECT COUNT(*) FROM suspicious_users');
        
        res.json({
            success: true,
            stats: {
                blockedDevices: parseInt(blockedDevicesCount.rows[0].count),
                blockedIPs: parseInt(blockedIPsCount.rows[0].count),
                suspiciousUsers: parseInt(suspiciousUsersCount.rows[0].count),
                activeDevices: deviceSystem.deviceUsers.size,
                activeTokens: tokenSystem.tokens.size
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🚫 endpoint لحظر مستخدم يدوياً (للاستخدام الإداري فقط)
app.post('/api/security/block-user', async (req, res) => {
    try {
        const { userId, reason } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        await behaviorSystem.flagSuspiciousUser(userId, reason || 'MANUAL_BLOCK');
        
        res.json({
            success: true,
            message: `User ${userId} blocked successfully`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🛑 إيقاف نظيف للسيرفر
process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف نظام التوكن...');
    tokenSystem.stop();
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
        console.log(`🏆 Contest points per ad: ${config.contestAdPoints}`);
        console.log(`🔐 Telegram verification: ENABLED`);
        console.log(`🔄 Dynamic token system: ACTIVE (5 seconds)`);
        console.log(`🗄️ Database manager: ${dbManager.initialized ? 'ACTIVE' : 'INITIALIZING'}`);
        console.log(`🛡️ Security system: ACTIVE`);
        console.log(`📱 Device fingerprinting: ENABLED`);
        console.log(`🚫 Telegram-only access: ENABLED`);
        
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
                console.log('✅ جدول bot_users جاهز');
                
                // إنشاء الجداول الأمنية
                await createSecurityTables();
                
            } catch (error) {
                console.log('⚠️  خطأ في إنشاء الجداول:', error.message);
            }
        }, 3000);
    });
}, 1000);
