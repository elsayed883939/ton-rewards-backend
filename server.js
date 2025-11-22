const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 البوت توكن
const BOT_TOKEN = "8257278435:AAHbzrJxIHytXdD1sNftjC8DnDz18kdvbOU";

// 🚀 Rate Limiting متقدم
const advancedLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    message: {
        success: false,
        error: 'Too many requests - try again later',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
        return req.headers['x-telegram-id'] || req.ip;
    }
});

// 📊 قاعدة البيانات
const pool = new Pool({
    connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
    ssl: { rejectUnauthorized: false }
});

// ⚙️ الإعدادات
const config = {
    adValue: 0.0001,
    dailyAdLimit: 100,
    minWithdrawal: 0.0001,
    referralBonus: 0.0005,
    contestAdPoints: 1,
    contestReferralPoints: 15,
    minAdDuration: 10000
};

// 🔐 نظام التوكن فائق السرعة
class UltraFastTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenCounter = 0;
        this.intervalId = null;
        this.failedAttempts = new Map();
        
        this.config = {
            tokenRefreshInterval: 3000, // ⚡ كل 3 ثواني
            tokenValidityWindow: 6000,  // 6 ثواني صلاحية
            maxFailedAttempts: 3,
            blockDuration: 600000
        };
    }

    generateToken() {
        const timestamp = Date.now();
        this.tokenCounter++;
        
        const tokenData = {
            timestamp,
            counter: this.tokenCounter,
            random: crypto.randomBytes(64).toString('hex'),
            signature: crypto.createHmac('sha512', 'ultra-secure-' + timestamp)
                .update(this.tokenCounter + timestamp.toString())
                .digest('hex')
        };

        const tokenString = JSON.stringify(tokenData);
        const token = crypto
            .createHmac('sha512', 'hyper-secure-key-' + Date.now())
            .update(tokenString)
            .digest('hex')
            .substring(0, 80);

        const tokenObject = {
            token,
            timestamp,
            expiresAt: timestamp + this.config.tokenValidityWindow,
            counter: this.tokenCounter
        };

        return tokenObject;
    }

    validateToken(token, clientIP = '') {
        this.cleanFailedAttempts();

        const attempts = this.failedAttempts.get(clientIP) || 0;
        
        if (attempts >= this.config.maxFailedAttempts) {
            console.log(`🚫 Client blocked: ${clientIP}`);
            return false;
        }

        if (!token || token.length < 10) {
            this.recordFailedAttempt(clientIP);
            return false;
        }

        const tokenData = this.tokens.get(token);
        if (!tokenData) {
            this.recordFailedAttempt(clientIP);
            return false;
        }
        
        const now = Date.now();
        if (tokenData.expiresAt < now) {
            this.tokens.delete(token);
            this.recordFailedAttempt(clientIP);
            return false;
        }

        this.failedAttempts.delete(clientIP);
        return true;
    }

    recordFailedAttempt(clientKey) {
        const attempts = this.failedAttempts.get(clientKey) || 0;
        this.failedAttempts.set(clientKey, {
            count: attempts + 1,
            timestamp: Date.now()
        });
        
        if (attempts + 1 >= this.config.maxFailedAttempts) {
            setTimeout(() => {
                this.failedAttempts.delete(clientKey);
            }, this.config.blockDuration);
        }
    }

    cleanFailedAttempts() {
        const now = Date.now();
        for (let [key, value] of this.failedAttempts.entries()) {
            if (now - value.timestamp > this.config.blockDuration) {
                this.failedAttempts.delete(key);
            }
        }
    }

    start() {
        console.log('⚡ بدء نظام التوكن فائق السرعة (كل 3 ثواني)...');
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
    }

    cleanExpiredTokens() {
        const now = Date.now();
        for (let [token, data] of this.tokens.entries()) {
            if (data.expiresAt < now) {
                this.tokens.delete(token);
            }
        }
    }

    getCurrentToken() {
        return this.currentToken;
    }

    getStats() {
        return {
            currentToken: this.currentToken ? this.currentToken.substring(0, 20) + '...' : null,
            activeTokens: this.tokens.size,
            totalGenerated: this.tokenCounter,
            failedAttempts: this.failedAttempts.size
        };
    }
}

const tokenSystem = new UltraFastTokenSystem();
tokenSystem.start();

// 🚨 نظام الحظر الفعلي في قاعدة البيانات
class RealBanSystem {
    constructor() {
        this.config = {
            maxTokenViolations: 3,
            violationWindow: 60000,
            autoBanDuration: 3600000,
            permanentBanThreshold: 5
        };
    }

    // 🔥 حظر فعلي في الداتابيز
    async banUser(userId, reason, duration = null) {
        try {
            const banExpiry = duration ? new Date(Date.now() + duration) : null;
            
            await pool.query(
                `INSERT INTO banned_users (user_id, ban_reason, ban_expiry, banned_at) 
                 VALUES ($1, $2, $3, NOW()) 
                 ON CONFLICT (user_id) 
                 DO UPDATE SET 
                    ban_reason = EXCLUDED.ban_reason,
                    ban_expiry = EXCLUDED.ban_expiry,
                    banned_at = NOW()`,
                [userId, reason, banExpiry]
            );

            console.log(`🔒 تم حظر المستخدم ${userId} ${duration ? 'مؤقت' : 'دائم'} - السبب: ${reason}`);
            return true;
        } catch (error) {
            console.error('❌ خطأ في حظر المستخدم:', error);
            return false;
        }
    }

    // 🔥 فك الحظر
    async unbanUser(userId) {
        try {
            await pool.query(
                'DELETE FROM banned_users WHERE user_id = $1',
                [userId]
            );
            console.log(`🔓 تم فك حظر المستخدم ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ خطأ في فك الحظر:', error);
            return false;
        }
    }

    // 🔥 التحقق إذا المستخدم محظور
    async isUserBanned(userId) {
        try {
            const result = await pool.query(
                'SELECT * FROM banned_users WHERE user_id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return false;
            }

            const ban = result.rows[0];
            
            // إذا كان حظر دائم
            if (!ban.ban_expiry) {
                return { banned: true, permanent: true, reason: ban.ban_reason };
            }

            // إذا كان حظر مؤقت وانتهى
            if (new Date() > ban.ban_expiry) {
                await this.unbanUser(userId);
                return false;
            }

            return { 
                banned: true, 
                permanent: false, 
                reason: ban.ban_reason,
                expiresIn: ban.ban_expiry - new Date()
            };
        } catch (error) {
            console.error('❌ خطأ في التحقق من الحظر:', error);
            return false;
        }
    }

    // 🔥 تسجيل مخالفة
    async recordViolation(userId, type, details = {}) {
        try {
            await pool.query(
                `INSERT INTO security_violations (user_id, violation_type, details, created_at) 
                 VALUES ($1, $2, $3, NOW())`,
                [userId, type, JSON.stringify(details)]
            );

            // 🔍 عد المخالفات الحديثة
            const violationsResult = await pool.query(
                `SELECT COUNT(*) as count FROM security_violations 
                 WHERE user_id = $1 AND violation_type = $2 
                 AND created_at > NOW() - INTERVAL '1 minute'`,
                [userId, type]
            );

            const recentViolations = parseInt(violationsResult.rows[0].count);

            // 🚨 إذا وصل للحد، حظر تلقائي
            if (recentViolations >= this.config.maxTokenViolations) {
                const isPermanent = recentViolations >= this.config.permanentBanThreshold;
                const banDuration = isPermanent ? null : this.config.autoBanDuration;
                const reason = `تجاوز حد مخالفات الأمان (${recentViolations} مخالفات في دقيقة)`;
                
                await this.banUser(userId, reason, banDuration);
                return { banned: true, violations: recentViolations, permanent: isPermanent };
            }

            return { banned: false, violations: recentViolations };
        } catch (error) {
            console.error('❌ خطأ في تسجيل المخالفة:', error);
            return { banned: false, violations: 0 };
        }
    }

    // 📊 إحصائيات
    async getStats() {
        try {
            const bannedResult = await pool.query(
                'SELECT COUNT(*) as total FROM banned_users'
            );
            const permanentResult = await pool.query(
                'SELECT COUNT(*) as permanent FROM banned_users WHERE ban_expiry IS NULL'
            );
            const violationsResult = await pool.query(
                'SELECT COUNT(*) as violations FROM security_violations WHERE created_at > NOW() - INTERVAL \'1 hour\''
            );

            return {
                totalBanned: parseInt(bannedResult.rows[0].total),
                permanentBans: parseInt(permanentResult.rows[0].permanent),
                recentViolations: parseInt(violationsResult.rows[0].violations)
            };
        } catch (error) {
            console.error('❌ خطأ في جلب الإحصائيات:', error);
            return { totalBanned: 0, permanentBans: 0, recentViolations: 0 };
        }
    }
}

const banSystem = new RealBanSystem();

// 🕵️ نظام كشف الاحتيال
class FraudDetectionSystem {
    constructor() {
        this.userActivities = new Map();
    }

    recordActivity(userId, action, metadata = {}) {
        const now = Date.now();
        if (!this.userActivities.has(userId)) {
            this.userActivities.set(userId, []);
        }

        const activities = this.userActivities.get(userId);
        activities.push({
            timestamp: now,
            action,
            metadata
        });

        const oneHourAgo = now - 3600000;
        const recentActivities = activities.filter(activity => activity.timestamp > oneHourAgo);
        this.userActivities.set(userId, recentActivities);

        return this.checkSuspiciousPatterns(userId, action, metadata);
    }

    checkSuspiciousPatterns(userId, action, metadata) {
        const activities = this.userActivities.get(userId) || [];
        const recentActivities = activities.filter(a => Date.now() - a.timestamp < 60000);

        if (action === 'watch_ad') {
            const adWatchers = recentActivities.filter(a => a.action === 'watch_ad').length;
            if (adWatchers > 5) {
                console.log(`🚫 سرعة غير طبيعية للمستخدم ${userId}: ${adWatchers} إعلانات في دقيقة`);
                banSystem.recordViolation(userId, 'TOO_FAST_ADS', { adCount: adWatchers });
                return false;
            }
        }

        return true;
    }
}

const fraudSystem = new FraudDetectionSystem();

// 🔧 Middleware الحماية المتكامل
const ultimateSecurity = async (req, res, next) => {
    const publicEndpoints = ['/', '/api/token/current', '/api/token/stats', '/api/config', '/api/check-tables', '/api/setup-database'];
    
    if (publicEndpoints.includes(req.path)) {
        return next();
    }

    const token = req.headers['x-dynamic-token'];
    const userAgent = req.headers['user-agent'] || '';
    const clientIP = req.ip || req.connection.remoteAddress;

    // 🔥 استخراج userId
    let userId = null;
    try {
        const initData = req.body.initData || req.query.initData;
        if (initData) {
            const decodedInitData = decodeURIComponent(initData);
            const parsedData = querystring.parse(decodedInitData);
            const userStr = parsedData.user;
            if (userStr) {
                const user = JSON.parse(userStr);
                userId = user.id.toString();
            }
        }
    } catch (e) {
        // تجاهل الخطأ
    }

    // 🚨 التحقق من الحظر الفعلي
    if (userId) {
        const banStatus = await banSystem.isUserBanned(userId);
        if (banStatus) {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب محظور',
                code: 'ACCOUNT_BANNED',
                banDetails: {
                    reason: banStatus.reason,
                    permanent: banStatus.permanent,
                    expiresIn: banStatus.expiresIn ? Math.ceil(banStatus.expiresIn / 60000) : null
                }
            });
        }
    }

    // 🔐 تحقق من التوكن
    if (!tokenSystem.validateToken(token, clientIP)) {
        if (userId) {
            const violationResult = await banSystem.recordViolation(userId, 'EXPIRED_TOKEN', {
                clientIP: clientIP,
                userAgent: userAgent,
                endpoint: req.path
            });

            if (violationResult.banned) {
                return res.status(403).json({ 
                    success: false,
                    error: 'تم حظر حسابك due to multiple security violations',
                    code: 'AUTO_BANNED',
                    permanent: violationResult.permanent
                });
            }

            return res.status(401).json({ 
                success: false,
                error: 'Invalid or expired security token',
                code: 'INVALID_TOKEN',
                violations: violationResult.violations
            });
        }

        return res.status(401).json({ 
            success: false,
            error: 'Invalid security token',
            code: 'INVALID_TOKEN'
        });
    }

    // ✅ تحقق من User-Agent
    if (!userAgent.includes('Telegram') && !userAgent.includes('Mozilla')) {
        if (userId) {
            await banSystem.recordViolation(userId, 'SUSPICIOUS_USER_AGENT', { userAgent });
        }
        return res.status(403).json({ 
            success: false,
            error: 'Access denied',
            code: 'INVALID_CLIENT'
        });
    }

    // 📍 تسجيل النشاط
    if (userId) {
        fraudSystem.recordActivity(userId, req.path, {
            ip: clientIP,
            userAgent: userAgent
        });
    }

    console.log(`✅ طلب آمن من: ${userId || clientIP}`);
    next();
};

// تطبيق الحماية
app.use(ultimateSecurity);
app.use('/api/watch-ad', advancedLimiter);
app.use('/api/withdraw', advancedLimiter);

// 🔐 تحقق من توقيع تليجرام
function validateTelegramInitData(initData) {
    try {
        if (!initData) return false;

        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        const hash = parsedData.hash;

        if (!hash) return false;

        const authDate = parseInt(parsedData.auth_date);
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 3600) {
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
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        return calculatedHash === hash;
    } catch (error) {
        return false;
    }
}

// 👤 استخراج بيانات المستخدم
function parseTelegramUser(initData) {
    try {
        if (!initData) return null;

        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        const userStr = parsedData.user;
        
        if (!userStr) return null;
        
        const user = JSON.parse(userStr);
        if (!user || !user.id) return null;

        return user;
    } catch (error) {
        return null;
    }
}

// 📊 جلب المستخدم من قاعدة البيانات
async function getUserFromDB(userId) {
    try {
        const result = await pool.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدم:', error);
        return null;
    }
}

// ➕ إنشاء مستخدم جديد
async function createUserInDB(userData) {
    try {
        const query = `
            INSERT INTO bot_users 
            (telegram_id, username, first_name, balance, earning_wallet) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING *
        `;
        
        const values = [
            userData.telegram_id,
            userData.username || '',
            userData.first_name || 'مستخدم',
            0,
            0
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        return null;
    }
}

// 🔧 إصلاح الجداول
async function fixMissingColumns() {
    try {
        const columnsToAdd = [
            { name: 'username', sql: 'ADD COLUMN IF NOT EXISTS username VARCHAR(255)' },
            { name: 'first_name', sql: 'ADD COLUMN IF NOT EXISTS first_name VARCHAR(255) DEFAULT \'مستخدم\'' },
            { name: 'balance', sql: 'ADD COLUMN IF NOT EXISTS balance DECIMAL(15, 8) DEFAULT 0.00000000' },
            { name: 'earning_wallet', sql: 'ADD COLUMN IF NOT EXISTS earning_wallet DECIMAL(15, 8) DEFAULT 0.00000000' },
            { name: 'total_earned', sql: 'ADD COLUMN IF NOT EXISTS total_earned DECIMAL(15, 8) DEFAULT 0.00000000' },
            { name: 'daily_ad_count', sql: 'ADD COLUMN IF NOT EXISTS daily_ad_count INTEGER DEFAULT 0' },
            { name: 'last_ad_date', sql: 'ADD COLUMN IF NOT EXISTS last_ad_date DATE DEFAULT CURRENT_DATE' }
        ];

        for (const column of columnsToAdd) {
            try {
                await pool.query(`ALTER TABLE bot_users ${column.sql}`);
            } catch (error) {
                // تجاهل الخطأ
            }
        }

        // إنشاء جدول المستخدمين المحظورين
        await pool.query(`
            CREATE TABLE IF NOT EXISTS banned_users (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                ban_reason TEXT NOT NULL,
                ban_expiry TIMESTAMP,
                banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إنشاء جدول المخالفات الأمنية
        await pool.query(`
            CREATE TABLE IF NOT EXISTS security_violations (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                violation_type VARCHAR(100) NOT NULL,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        return true;
    } catch (error) {
        console.error('❌ خطأ في إصلاح الجداول:', error);
        return false;
    }
}

// 🏠 الصفحة الرئيسية
app.get('/', async (req, res) => {
    res.json({ 
        message: 'TON Rewards Secure Backend',
        status: '🛡️ Protected & Running',
        timestamp: new Date().toISOString()
    });
});

// 📋 الإعدادات
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: {
            adValue: config.adValue,
            dailyAdLimit: config.dailyAdLimit,
            minWithdrawal: config.minWithdrawal,
            referralBonus: config.referralBonus,
            botUsername: "Aborabie777_bot"
        }
    });
});

// 🔐 endpoints التوكن
app.get('/api/token/current', (req, res) => {
    const currentToken = tokenSystem.getCurrentToken();
    res.json({
        success: true,
        token: currentToken,
        valid_for: '6 seconds',
        refresh_in: '3 seconds'
    });
});

app.get('/api/token/stats', (req, res) => {
    res.json({
        success: true,
        ...tokenSystem.getStats()
    });
});

// 🔧 إعداد الجداول
app.get('/api/setup-database', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255) NOT NULL,
                balance DECIMAL(15, 8) DEFAULT 0.00000000,
                earning_wallet DECIMAL(15, 8) DEFAULT 0.00000000,
                total_earned DECIMAL(15, 8) DEFAULT 0.00000000,
                daily_ad_count INTEGER DEFAULT 0,
                last_ad_date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                amount DECIMAL(15, 8) NOT NULL,
                wallet_address TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await fixMissingColumns();

        res.json({
            success: true,
            message: 'تم إنشاء/تحديث الجداول بنجاح'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📊 إحصائيات الأمان
app.get('/api/security/stats', async (req, res) => {
    try {
        const banStats = await banSystem.getStats();
        res.json({
            success: true,
            tokenSystem: tokenSystem.getStats(),
            banSystem: banStats,
            security: {
                tokenRefresh: '3 seconds',
                maxViolations: 3,
                autoBan: 'ENABLED',
                realTimeProtection: 'ACTIVE'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔓 فك الحظر (للالأدمن)
app.post('/api/security/unban', async (req, res) => {
    try {
        const { userId, adminKey } = req.body;
        
        if (adminKey !== 'ADMIN_SECRET_2024') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const result = await banSystem.unbanUser(userId);
        res.json({
            success: result,
            message: result ? `تم فك حظر المستخدم ${userId}` : 'فشل فك الحظر'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 👤 جلب بيانات المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        // 🚨 التحقق من الحظر
        const banStatus = await banSystem.isUserBanned(userId);
        if (banStatus) {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب محظور',
                code: 'ACCOUNT_BANNED',
                reason: banStatus.reason
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
            res.json({ 
                success: true, 
                user: {
                    id: user.telegram_id,
                    firstName: user.first_name,
                    username: user.username,
                    balance: parseFloat(user.balance || 0),
                    earningWallet: parseFloat(user.earning_wallet || 0),
                    dailyAdCount: user.daily_ad_count || 0,
                    totalEarned: parseFloat(user.total_earned || 0)
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
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user data' 
        });
    }
});

// 👤 تسجيل مستخدم
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
        
        // 🚨 التحقق من الحظر
        const banStatus = await banSystem.isUserBanned(userId);
        if (banStatus) {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب محظور',
                code: 'ACCOUNT_BANNED'
            });
        }

        let user = await getUserFromDB(userId);
        
        if (user) {
            return res.json({ 
                success: true, 
                user: {
                    id: user.telegram_id,
                    firstName: user.first_name,
                    username: user.username,
                    balance: parseFloat(user.balance || 0),
                    earningWallet: parseFloat(user.earning_wallet || 0),
                    dailyAdCount: user.daily_ad_count || 0,
                    totalEarned: parseFloat(user.total_earned || 0)
                }
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
                    totalEarned: parseFloat(user.total_earned || 0)
                }
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Failed to create user' 
            });
        }

    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Registration failed' 
        });
    }
});

// 📺 مشاهدة إعلان
app.post('/api/watch-ad', async (req, res) => {
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
        
        // 🚨 التحقق من الحظر
        const banStatus = await banSystem.isUserBanned(userId);
        if (banStatus) {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب محظور',
                code: 'ACCOUNT_BANNED'
            });
        }

        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // التحقق من الحد اليومي
        const today = new Date().toDateString();
        const lastAdDate = user.last_ad_date ? new Date(user.last_ad_date).toDateString() : null;
        
        let dailyAdCount = user.daily_ad_count || 0;
        if (lastAdDate !== today) {
            dailyAdCount = 0;
            await pool.query(
                'UPDATE bot_users SET last_ad_date = CURRENT_DATE WHERE telegram_id = $1',
                [userId]
            );
        }

        if (dailyAdCount >= config.dailyAdLimit) {
            return res.status(400).json({ 
                success: false,
                error: 'Daily ad limit reached' 
            });
        }

        // معالجة الإعلان
        const adReward = config.adValue;
        
        const updateResult = await pool.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1,
                daily_ad_count = $2,
                last_ad_date = CURRENT_DATE
             WHERE telegram_id = $3 
             RETURNING *`,
            [adReward, dailyAdCount + 1, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (dailyAdCount + 1),
                totalEarned: parseFloat(updatedUser.total_earned || 0)
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Failed to process ad' 
            });
        }

    } catch (error) {
        console.error('❌ خطأ في مشاهدة الإعلان:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process ad' 
        });
    }
});

// 💰 تحويل الرصيد
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
        
        // 🚨 التحقق من الحظر
        const banStatus = await banSystem.isUserBanned(userId);
        if (banStatus) {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب محظور',
                code: 'ACCOUNT_BANNED'
            });
        }

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

        // تحديث الرصيد
        const updateResult = await pool.query(
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
        console.error('❌ خطأ في تحويل الرصيد:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Transfer failed' 
        });
    }
});

// 💳 طلب سحب
app.post('/api/withdraw', async (req, res) => {
    try {
        const { initData, amount, walletAddress } = req.body;

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
        
        // 🚨 التحقق من الحظر
        const banStatus = await banSystem.isUserBanned(userId);
        if (banStatus) {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب محظور',
                code: 'ACCOUNT_BANNED'
            });
        }

        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const userBalance = parseFloat(user.balance || 0);
        const withdrawAmount = parseFloat(amount);

        if (userBalance < withdrawAmount) {
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance' 
            });
        }

        if (withdrawAmount < config.minWithdrawal) {
            return res.status(400).json({ 
                success: false,
                error: `Minimum withdrawal is ${config.minWithdrawal} TON` 
            });
        }

        // معالجة السحب
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE bot_users SET balance = balance - $1 WHERE telegram_id = $2',
                [withdrawAmount, userId]
            );

            const withdrawalResult = await client.query(
                `INSERT INTO withdrawals 
                 (user_id, amount, wallet_address, status) 
                 VALUES ($1, $2, $3, 'pending') 
                 RETURNING *`,
                [userId, withdrawAmount, walletAddress]
            );

            await client.query('COMMIT');

            const withdrawal = withdrawalResult.rows[0];
            
            res.json({
                success: true,
                withdrawalId: withdrawal.id,
                newBalance: userBalance - withdrawAmount,
                message: 'تم تقديم طلب السحب بنجاح'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ خطأ في السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed' 
        });
    }
});

// 📋 تاريخ السحوبات
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

        // 🚨 التحقق من الحظر
        const banStatus = await banSystem.isUserBanned(userId);
        if (banStatus) {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب محظور',
                code: 'ACCOUNT_BANNED'
            });
        }

        const withdrawals = await pool.query(
            `SELECT * FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [userId]
        );
        
        res.json({
            success: true,
            withdrawals: withdrawals.rows.map(w => ({
                id: w.id,
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                createdAt: w.created_at
            }))
        });

    } catch (error) {
        console.error('❌ خطأ في جلب تاريخ السحوبات:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
    }
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🛡️  TON Rewards Ultra Secure Backend running on port ${PORT}`);
    console.log(`⚡ Token refresh: 3 seconds`);
    console.log(`🚨 Auto-ban: ENABLED`);
    console.log(`🔒 Real-time protection: ACTIVE`);
});
