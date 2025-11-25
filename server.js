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
    allowedHeaders: ['Content-Type', 'X-Dynamic-Token', 'Authorization']
}));

app.use(express.json());

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHkhaFLpI4J7uYL4xpAEp4_-hc5DnW5yno"; 

// 🔧 نظام إدارة اتصال قاعدة البيانات المحسن
class DatabaseManager {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.init();
    }

    async init() {
        try {
            this.pool = new Pool({
                connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 10000,
                idleTimeoutMillis: 30000,
                max: 20,
            });

            // اختبار الاتصال
            await this.testConnection();
            this.isConnected = true;
            this.retryCount = 0;
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
            await new Promise(resolve => setTimeout(resolve, 5000));
            await this.init();
        } else {
            console.error('❌ فشل جميع محاولات الاتصال بقاعدة البيانات');
            // لا نوقف التطبيق، بل نستمر في المحاولة
            setTimeout(() => {
                this.retryCount = 0;
                this.init();
            }, 30000);
        }
    }

    async query(text, params) {
        if (!this.isConnected) {
            throw new Error('قاعدة البيانات غير متصلة');
        }
        
        try {
            return await this.pool.query(text, params);
        } catch (error) {
            console.error('❌ خطأ في استعلام قاعدة البيانات:', error.message);
            
            // محاولة إعادة الاتصال عند الخطأ
            if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
                this.isConnected = false;
                await this.init();
            }
            
            throw error;
        }
    }

    async connect() {
        if (!this.isConnected) {
            throw new Error('قاعدة البيانات غير متصلة');
        }
        return await this.pool.connect();
    }

    getPool() {
        return this.pool;
    }
}

// تهيئة مدير قاعدة البيانات
const dbManager = new DatabaseManager();
const pool = dbManager.getPool();

// 🔥 الإعدادات الجديدة - 100 إعلان يومياً + نقطة واحدة فقط لكل إعلان
const config = {
    adValue: 0.0001,          // 0.0001 TON لكل إعلان
    dailyAdLimit: 100,        // 100 إعلان يومياً  
    minWithdrawal: 0.0001,    // الحد الأدنى للسحب 0.0001 TON
    referralBonus: 0.0005,    // مكافأة الإحالة
    contestAdPoints: 1,       // ⚡ نقطة واحدة فقط لكل إعلان
    contestReferralPoints: 15 // نقاط المسابقة لكل إحالة
};

// 🔧 نظام التوكن الديناميكي - الإصدار المحسن
class DynamicTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenHistory = [];
        this.tokenCounter = 0;
        this.intervalId = null;
        
        this.config = {
            tokenRefreshInterval: 10000,
            tokenValidityWindow: 30000,
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
        console.log('🚀 بدء نظام التوكن الديناميكي المحسن...');
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
            currentToken: this.currentToken ? this.currentToken.substring(0, 20) + '...' : null,
            activeTokens: this.tokens.size,
            totalGenerated: this.tokenCounter
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

// 🔧 middleware محسن للتحقق من التوكن
const validateDynamicToken = (req, res, next) => {
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
        // 🔥 إضافة endpoints المسابقة
        '/api/contest/leaderboard',
        '/api/contest/user-rank/:userId',
        '/api/contest/user/:userId',
        // 🔥 إضافة endpoint التحقق من initData
        '/api/validate-initdata'
    ];
    
    // التحقق إذا كان الـ endpoint عام
    const isPublicEndpoint = publicEndpoints.some(endpoint => {
        if (endpoint.includes(':')) {
            // معالجة الـ endpoints التي تحتوي على parameters
            const basePath = endpoint.split('/:')[0];
            return req.path.startsWith(basePath);
        }
        return req.path === endpoint;
    });
    
    if (isPublicEndpoint) {
        return next();
    }

    const token = req.headers['x-dynamic-token'] || 
                  req.headers['authorization']?.replace('Bearer ', '') || 
                  req.query.dynamicToken;

    if (!token) {
        console.log('❌ طلب بدون توكن:', req.path);
        return res.status(401).json({ 
            success: false,
            error: 'التوكن الديناميكي مطلوب',
            code: 'DYNAMIC_TOKEN_REQUIRED'
        });
    }

    if (!tokenSystem.validateToken(token)) {
        console.log('🔄 محاولة تجديد التوكن تلقائياً...');
        tokenSystem.updateToken();
        
        return res.status(401).json({ 
            success: false,
            error: 'توكن ديناميكي غير صالح أو منتهي',
            code: 'INVALID_DYNAMIC_TOKEN',
            hint: 'جرب تحديث الصفحة'
        });
    }

    next();
};

// تطبيق middleware التوكن الديناميكي على جميع ال routes
app.use(validateDynamicToken);

// 🔧 دالة للتحقق من اتصال قاعدة البيانات
async function checkDatabaseConnection() {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        console.log('✅ قاعدة البيانات متصلة - الوقت الحالي:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
        return false;
    }
}

// 🔐 التحقق من توقيع تليجرام - الإصدار المصحح
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

        // بناء البيانات للتحقق
        const dataToCheck = [];
        for (const [key, value] of Object.entries(parsedData)) {
            if (key !== 'hash' && value) {
                dataToCheck.push(`${key}=${value}`);
            }
        }
        
        dataToCheck.sort();
        const dataCheckString = dataToCheck.join('\n');
        
        // إنشاء المفتاح السري
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        // حساب الهاش المتوقع
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

// 🔧 دالة لتحليل بيانات تليجرام
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
        const result = await pool.query(
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
        const result = await pool.query(
            `INSERT INTO bot_users (telegram_id, username, first_name, balance, earning_wallet, total_earned) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING *`,
            [
                userData.telegram_id,
                userData.username,
                userData.first_name,
                0, // balance
                0, // earning_wallet
                0  // total_earned
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        return null;
    }
}

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

// 📺 مشاهدة إعلان - الإصدار المصحح مع الإعلان الإجباري
app.post('/api/watch-ad', async (req, res) => {
    const client = await pool.connect();
    
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

        if (!validateTelegramInitData(initData)) {
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
        
        await client.query('BEGIN');

        // 🔥 جلب المستخدم مع قفل الصف لمنع التكرار
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

        // 🔥 التحقق من الحد اليومي للإعلانات
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

        // 🔥 تحديث البيانات في قاعدة البيانات
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
            // 🔥 تحديث نقاط المسابقة - نقطة واحدة فقط
            try {
                // التحقق أولاً من وجود المستخدم في المسابقة
                const existingContest = await client.query(
                    'SELECT * FROM contest_leaderboard WHERE user_id = $1',
                    [userId]
                );

                if (existingContest.rows.length > 0) {
                    // ⚡ نقطة واحدة فقط
                    await client.query(`
                        UPDATE contest_leaderboard SET 
                            points = points + 1,
                            ads_watched = ads_watched + 1,
                            last_activity = CURRENT_TIMESTAMP
                        WHERE user_id = $1
                    `, [userId]);
                    
                    console.log(`✅ تم تحديث المسابقة: +1 نقطة للمستخدم ${userId}`);
                } else {
                    // ⚡ نقطة واحدة فقط
                    await client.query(`
                        INSERT INTO contest_leaderboard 
                        (user_id, username, first_name, points, ads_watched, last_activity)
                        VALUES ($1, $2, $3, 1, 1, CURRENT_TIMESTAMP)
                    `, [userId, user.username || '', user.first_name || 'User']);
                    
                    console.log(`✅ تم إدخال جديد في المسابقة: +1 نقطة للمستخدم ${userId}`);
                }
                
                console.log('✅ تمت مشاهدة الإعلان بنجاح + نقطة مسابقة واحدة');
            } catch (contestError) {
                console.log('⚠️  خطأ في تحديث المسابقة:', contestError.message);
                // لا نوقف العملية إذا فشل تحديث المسابقة
            }

            await client.query('COMMIT');
            
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (dailyAdCount + 1),
                totalEarned: parseFloat(updatedUser.total_earned || 0),
                contestPoints: 1 // ⚡ نقطة واحدة فقط
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
        await client.query('ROLLBACK');
        console.error('❌ خطأ في مشاهدة الإعلان:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process ad: ' + error.message 
        });
    } finally {
        client.release();
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
        
        // جلب المستخدم من قاعدة البيانات
        let user = await getUserFromDB(userId);
        let isNewUser = false;
        
        // 🔥 إذا المستخدم مش موجود، سجله تلقائياً
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
                } else {
                    console.log('❌ فشل في التسجيل التلقائي');
                }
            }
        }

        if (user) {
            console.log('✅ تم العثور على المستخدم');
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
        
        // التحقق إذا المستخدم موجود في قاعدة البيانات
        let user = await getUserFromDB(userId);
        
        if (user) {
            console.log('✅ المستخدم موجود بالفعل');
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
                },
                message: `مرحباً بعودتك ${user.first_name}!`
            });
        }

        // إنشاء مستخدم جديد في قاعدة البيانات
        console.log('🆕 إنشاء مستخدم جديد...');
        const newUser = {
            telegram_id: userId,
            username: telegramUser.username || '',
            first_name: telegramUser.first_name || 'مستخدم'
        };

        user = await createUserInDB(newUser);

        if (user) {
            console.log('✅ تم إنشاء المستخدم بنجاح');
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

        // تحديث الرصيد في قاعدة البيانات
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
        res.status(500).json({ 
            success: false,
            error: 'Transfer failed' 
        });
    }
});

// 💳 طلب سحب - الإصدار المحسن والمصلح
app.post('/api/withdraw', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { initData, amount, walletAddress, method = 'TON Wallet', memo = '' } = req.body;

        console.log('📥 طلب سحب:', { amount, walletAddress, method, memo });

        // 🔥 تحقق بسيط من البيانات الأساسية أولاً
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
        
        await client.query('BEGIN');

        // جلب المستخدم مع قفل الصف لمنع التنافس
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

        // التحقق من الرصيد
        if (userBalance < withdrawAmount) {
            await client.query('ROLLBACK');
            console.log('❌ رصيد غير كافي');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance' 
            });
        }

        // التحقق من الحد الأدنى للسحب بناءً على الطريقة
        let minWithdrawal = config.minWithdrawal;
        if (method === 'TON Wallet') {
            minWithdrawal = 0.05; // الحد الأدنى لـ TON
        }

        if (withdrawAmount < minWithdrawal) {
            await client.query('ROLLBACK');
            console.log(`❌ الحد الأدنى للسحب ${minWithdrawal} TON`);
            return res.status(400).json({ 
                success: false,
                error: `Minimum withdrawal is ${minWithdrawal} TON` 
            });
        }

        // خصم المبلغ من رصيد المستخدم
        await client.query(
            'UPDATE bot_users SET balance = balance - $1 WHERE telegram_id = $2',
            [withdrawAmount, userId]
        );

        // تسجيل طلب السحب
        const withdrawalResult = await client.query(
            `INSERT INTO withdrawals 
             (user_id, amount, wallet_address, status, method, memo) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING *`,
            [userId, withdrawAmount, walletAddress, 'pending', method, memo]
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
        await client.query('ROLLBACK');
        console.error('❌ خطأ في السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed: ' + error.message 
        });
    } finally {
        client.release();
    }
});

// 📋 الحصول على تاريخ السحوبات - الإصدار المصحح
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
        
        // 🔥 الإصلاح الكامل: استخدام تنسيق التاريخ بشكل صحيح
        const withdrawals = await pool.query(
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
        
        // معالجة التاريخ بشكل صحيح
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
                createdat: createdAt // ⚡ استخدام نفس الاسم الموجود في Frontend
            };
        });
        
        res.json({
            success: true,
            withdrawals: processedWithdrawals
        });

    } catch (error) {
        console.error('❌ خطأ في جلب تاريخ السحوبات:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
    }
});

// 🏆 نظام المسابقة المحسن (نقطة واحدة فقط لكل إعلان)
app.post('/api/contest/update-points', async (req, res) => {
    try {
        const { userId, points = 1, adsWatched = 1, referralsCount = 0 } = req.body; // ⚡ نقطة واحدة فقط
        
        console.log(`🔄 تحديث نقاط المسابقة للمستخدم: ${userId}`, { points, adsWatched, referralsCount });
        
        // جلب بيانات المستخدم أولاً
        const userResult = await pool.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        // التأكد من وجود جدول المسابقة
        await pool.query(`
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
        
        // ⚡ نقطة واحدة فقط لكل إعلان
        const actualPoints = 1; // ⚡ نقطة واحدة فقط بغض النظر عن القيمة الممررة
        const actualAds = 1; // ⚡ إعلان واحد فقط
        
        // تحديث أو إدخال بيانات المسابقة
        const result = await pool.query(`
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

// 🏆 جلب المتصدرين مرتبين حسب النقاط - تحديث فوري
app.get('/api/contest/leaderboard', async (req, res) => {
    try {
        const leaderboard = await pool.query(`
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

// 🏆 جلب ترتيب مستخدم معين - تحديث فوري
app.get('/api/contest/user-rank/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const rankResult = await pool.query(`
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

// 🏆 جلب بيانات مسابقة مستخدم معين
app.get('/api/contest/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const result = await pool.query(`
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

// 👥 endpoints نظام الإحالات
app.post('/api/referrals/add', async (req, res) => {
    try {
        const { referrerId, referredId } = req.body;
        
        console.log(`👥 محاولة إضافة إحالة: ${referrerId} أحال ${referredId}`);
        
        // تحقق إذا المستخدم الجديد موجود
        const referredUser = await getUserFromDB(referredId);
        if (!referredUser) {
            return res.status(404).json({ success: false, error: 'Referred user not found' });
        }
        
        // تحقق إذا تمت الإحالة مسبقاً
        const existingReferral = await pool.query(
            'SELECT * FROM referrals WHERE referred_id = $1',
            [referredId]
        );
        
        if (existingReferral.rows.length > 0) {
            return res.json({ success: true, message: 'User already referred', referral: existingReferral.rows[0] });
        }
        
        // تسجيل الإحالة الجديدة
        const result = await pool.query(`
            INSERT INTO referrals (referrer_id, referred_id, status)
            VALUES ($1, $2, 'active')
            RETURNING *
        `, [referrerId, referredId]);
        
        // تحديث عدد الإحالات في المسابقة - 15 نقطة لكل إحالة
        await pool.query(`
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

app.get('/api/referrals/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // جلب الإحالات
        const referrals = await pool.query(`
            SELECT r.*, bu.first_name, bu.username 
            FROM referrals r
            LEFT JOIN bot_users bu ON r.referred_id = bu.telegram_id
            WHERE r.referrer_id = $1
            ORDER BY r.created_at DESC
        `, [userId]);
        
        // إحصائيات الإحالات
        const stats = await pool.query(`
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

// 🔥 إضافة endpoint لإعداد الأكواد المميزة
app.get('/api/reward-codes/setup', async (req, res) => {
    try {
        console.log('🔧 بدء إعداد الأكواد المميزة...');
        
        // الأكواد المطلوبة
        const rewardCodes = [
            { code: 'WELCOME100', reward_type: 'RR', reward_value: 10000, max_uses: 1000 },
            { code: 'BONUS500', reward_type: 'RR', reward_value: 50000, max_uses: 500 },
            { code: 'START1000', reward_type: 'RR', reward_value: 100000, max_uses: 100 },
            { code: 'QWFP1234', reward_type: 'TON', reward_value: 0.001, max_uses: 1000 },
            { code: 'PFWQ4321', reward_type: 'RR', reward_value: 5000, max_uses: 1000 }
        ];

        let addedCount = 0;
        let updatedCount = 0;

        for (const codeData of rewardCodes) {
            try {
                // التحقق إذا الكود موجود
                const existingCode = await pool.query(
                    'SELECT * FROM reward_codes WHERE code = $1',
                    [codeData.code]
                );

                if (existingCode.rows.length > 0) {
                    // تحديث الكود الموجود
                    await pool.query(`
                        UPDATE reward_codes SET 
                            reward_type = $1,
                            reward_value = $2,
                            max_uses = $3
                        WHERE code = $4
                    `, [codeData.reward_type, codeData.reward_value, codeData.max_uses, codeData.code]);
                    updatedCount++;
                    console.log(`🔄 تم تحديث الكود: ${codeData.code}`);
                } else {
                    // إضافة كود جديد
                    await pool.query(`
                        INSERT INTO reward_codes (code, reward_type, reward_value, max_uses)
                        VALUES ($1, $2, $3, $4)
                    `, [codeData.code, codeData.reward_type, codeData.reward_value, codeData.max_uses]);
                    addedCount++;
                    console.log(`✅ تم إضافة الكود: ${codeData.code}`);
                }
            } catch (error) {
                console.error(`❌ خطأ في معالجة الكود ${codeData.code}:`, error.message);
            }
        }

        res.json({
            success: true,
            message: 'تم إعداد الأكواد المميزة بنجاح',
            added: addedCount,
            updated: updatedCount,
            total: rewardCodes.length
        });

    } catch (error) {
        console.error('❌ خطأ في إعداد الأكواد:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔥 endpoint للتحقق من صحة الكود
app.get('/api/reward-codes/validate/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        
        console.log(`🔍 التحقق من صحة الكود: ${code}`);
        
        const codeResult = await pool.query(
            `SELECT * FROM reward_codes WHERE code = $1`,
            [code]
        );

        if (codeResult.rows.length === 0) {
            return res.json({
                success: false,
                valid: false,
                error: 'الكود غير صحيح'
            });
        }

        const rewardCode = codeResult.rows[0];
        
        // التحقق من انتهاء الصلاحية
        if (rewardCode.expires_at && new Date(rewardCode.expires_at) < new Date()) {
            return res.json({
                success: false,
                valid: false,
                error: 'الكود منتهي الصلاحية'
            });
        }

        // التحقق من عدد الاستخدامات
        if (rewardCode.used_count >= rewardCode.max_uses) {
            return res.json({
                success: false,
                valid: false,
                error: 'تم استخدام هذا الكود بالكامل'
            });
        }

        res.json({
            success: true,
            valid: true,
            code: rewardCode.code,
            reward_type: rewardCode.reward_type,
            reward_value: parseFloat(rewardCode.reward_value),
            max_uses: rewardCode.max_uses,
            used_count: rewardCode.used_count
        });

    } catch (error) {
        console.error('❌ خطأ في التحقق من الكود:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔥 endpoint لاستبدال الكود
app.post('/api/reward-codes/redeem', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { initData, code } = req.body;
        
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
        const codeUpper = code.toUpperCase();
        
        console.log(`🎁 محاولة استبدال الكود: ${codeUpper} للمستخدم: ${userId}`);

        await client.query('BEGIN');

        // التحقق من صحة الكود
        const codeResult = await client.query(
            `SELECT * FROM reward_codes WHERE code = $1 FOR UPDATE`,
            [codeUpper]
        );

        if (codeResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                error: 'الكود غير صحيح'
            });
        }

        const rewardCode = codeResult.rows[0];
        
        // التحقق من انتهاء الصلاحية
        if (rewardCode.expires_at && new Date(rewardCode.expires_at) < new Date()) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                error: 'الكود منتهي الصلاحية'
            });
        }

        // التحقق من عدد الاستخدامات
        if (rewardCode.used_count >= rewardCode.max_uses) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                error: 'تم استخدام هذا الكود بالكامل'
            });
        }

        // التحقق إذا كان المستخدم قد استخدم هذا الكود مسبقاً
        const redemptionCheck = await client.query(
            `SELECT * FROM code_redemptions WHERE user_id = $1 AND code = $2`,
            [userId, codeUpper]
        );

        if (redemptionCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                error: 'لقد استخدمت هذا الكود مسبقاً'
            });
        }

        // جلب بيانات المستخدم
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
        const rewardValue = parseFloat(rewardCode.reward_value);
        const rewardType = rewardCode.reward_type;

        // تطبيق المكافأة بناءً على النوع
        if (rewardType === 'TON') {
            // مكافأة TON
            await client.query(
                `UPDATE bot_users SET 
                    balance = COALESCE(balance, 0) + $1,
                    total_earned = COALESCE(total_earned, 0) + $1
                 WHERE telegram_id = $2`,
                [rewardValue, userId]
            );
        } else if (rewardType === 'RR') {
            // مكافأة RR (يتم التعامل معها في الواجهة الأمامية)
            console.log(`💰 مكافأة RR: ${rewardValue} RR للمستخدم ${userId}`);
        }

        // تحديث عدد استخدامات الكود
        await client.query(
            'UPDATE reward_codes SET used_count = used_count + 1 WHERE code = $1',
            [codeUpper]
        );

        // تسجيل عملية الاستبدال
        await client.query(
            `INSERT INTO code_redemptions (user_id, code, reward_type, reward_value)
             VALUES ($1, $2, $3, $4)`,
            [userId, codeUpper, rewardType, rewardValue]
        );

        await client.query('COMMIT');

        console.log(`✅ تم استبدال الكود بنجاح: ${codeUpper} للمستخدم ${userId}`);

        res.json({
            success: true,
            message: 'تم استبدال الكود بنجاح',
            reward_type: rewardType,
            reward_value: rewardValue,
            code: codeUpper
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ خطأ في استبدال الكود:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
});

// 🔧 إصلاح بيانات المسابقة والإعلانات
app.post('/api/fix-contest-data', async (req, res) => {
    try {
        const { userId } = req.body;
        
        console.log(`🔧 إصلاح بيانات المسابقة للمستخدم: ${userId}`);
        
        // جلب بيانات المستخدم
        const userResult = await pool.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        const dailyAdCount = user.daily_ad_count || 0;
        
        // تصحيح بيانات المسابقة
        const contestResult = await pool.query(
            'SELECT * FROM contest_leaderboard WHERE user_id = $1',
            [userId]
        );
        
        if (contestResult.rows.length > 0) {
            const contestData = contestResult.rows[0];
            
            // ⚡ الإصلاح: إذا كان عدد النقاط أكثر من عدد الإعلانات، نصحح البيانات
            if (contestData.points > contestData.ads_watched) {
                const correctPoints = contestData.ads_watched; // نقطة واحدة لكل إعلان
                await pool.query(`
                    UPDATE contest_leaderboard 
                    SET points = $1 
                    WHERE user_id = $2
                `, [correctPoints, userId]);
                
                console.log(`✅ تم تصحيح بيانات المسابقة: ${correctPoints} نقطة لـ ${contestData.ads_watched} إعلان`);
            }
        }
        
        res.json({
            success: true,
            message: 'تم تصحيح بيانات المسابقة بنجاح',
            dailyAdCount: dailyAdCount,
            contestData: contestResult.rows[0] || null
        });
        
    } catch (error) {
        console.error('❌ خطأ في إصلاح بيانات المسابقة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔧 إصلاح جميع بيانات المسابقة لتكون نقطة واحدة فقط
app.post('/api/fix-all-contest-data', async (req, res) => {
    try {
        console.log('🔧 بدء إصلاح جميع بيانات المسابقة...');
        
        // جلب جميع بيانات المسابقة
        const allContestData = await pool.query(`
            SELECT * FROM contest_leaderboard 
            WHERE points > ads_watched
        `);
        
        let fixedCount = 0;
        
        for (const contest of allContestData.rows) {
            // تصحيح البيانات: جعل النقاط مساوية لعدد الإعلانات (نقطة واحدة لكل إعلان)
            if (contest.points > contest.ads_watched) {
                await pool.query(`
                    UPDATE contest_leaderboard 
                    SET points = ads_watched 
                    WHERE user_id = $1
                `, [contest.user_id]);
                
                fixedCount++;
                console.log(`✅ تم تصحيح بيانات المستخدم ${contest.user_id}: ${contest.ads_watched} نقطة لـ ${contest.ads_watched} إعلان`);
            }
        }
        
        res.json({
            success: true,
            message: `تم تصحيح ${fixedCount} سجل في المسابقة`,
            fixedCount: fixedCount,
            totalChecked: allContestData.rows.length
        });
        
    } catch (error) {
        console.error('❌ خطأ في إصلاح بيانات المسابقة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔍 فحص بيانات مستخدم معين
app.get('/api/debug-user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // بيانات المستخدم
        const userResult = await pool.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        
        // بيانات المسابقة
        const contestResult = await pool.query(
            'SELECT * FROM contest_leaderboard WHERE user_id = $1',
            [userId]
        );
        
        // تاريخ السحوبات
        const withdrawalsResult = await pool.query(
            'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
            [userId]
        );
        
        res.json({
            success: true,
            user: userResult.rows[0] || null,
            contest: contestResult.rows[0] || null,
            withdrawals: withdrawalsResult.rows,
            analysis: {
                dailyAdCount: userResult.rows[0]?.daily_ad_count || 0,
                contestPoints: contestResult.rows[0]?.points || 0,
                contestAds: contestResult.rows[0]?.ads_watched || 0,
                pointsPerAd: contestResult.rows[0]?.points / contestResult.rows[0]?.ads_watched || 0
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في فحص بيانات المستخدم:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔍 فحص مفصل للجداول
app.get('/api/debug-tables', async (req, res) => {
    try {
        // فحص جدول bot_users
        const botUsersColumns = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'bot_users'
            ORDER BY ordinal_position
        `);

        // فحص جدول withdrawals
        const withdrawalsColumns = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'withdrawals'
            ORDER BY ordinal_position
        `);

        // فحص جدول contest_leaderboard
        const contestColumns = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'contest_leaderboard'
            ORDER BY ordinal_position
        `);

        // فحص جدول reward_codes
        const rewardCodesColumns = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'reward_codes'
            ORDER BY ordinal_position
        `);

        res.json({
            success: true,
            bot_users_columns: botUsersColumns.rows,
            withdrawals_columns: withdrawalsColumns.rows,
            contest_leaderboard_columns: contestColumns.rows,
            reward_codes_columns: rewardCodesColumns.rows,
            missing_memo: !withdrawalsColumns.rows.find(col => col.column_name === 'memo')
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📊 جلب الإحصائيات العامة
app.get('/api/stats', async (req, res) => {
    try {
        // إجمالي المستخدمين
        const usersResult = await pool.query('SELECT COUNT(*) as total_users FROM bot_users');
        
        // إجمالي الأرباح
        const earningsResult = await pool.query('SELECT COALESCE(SUM(total_earned), 0) as total_earnings FROM bot_users');
        
        // إجمالي السحوبات
        const withdrawalsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_withdrawals,
                COALESCE(SUM(amount), 0) as total_withdrawn
            FROM withdrawals 
            WHERE status = 'completed'
        `);
        
        // إحصائيات المسابقة
        const contestResult = await pool.query(`
            SELECT 
                COUNT(*) as total_contestants,
                COALESCE(SUM(points), 0) as total_points,
                COALESCE(SUM(ads_watched), 0) as total_ads
            FROM contest_leaderboard
        `);

        res.json({
            success: true,
            stats: {
                totalUsers: parseInt(usersResult.rows[0].total_users),
                totalEarnings: parseFloat(earningsResult.rows[0].total_earnings),
                totalWithdrawals: parseInt(withdrawalsResult.rows[0].total_withdrawals),
                totalWithdrawn: parseFloat(withdrawalsResult.rows[0].total_withdrawn),
                totalContestants: parseInt(contestResult.rows[0].total_contestants),
                totalPoints: parseInt(contestResult.rows[0].total_points),
                totalAds: parseInt(contestResult.rows[0].total_ads)
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔥 endpoints التوكن - تم إصلاحها
app.get('/api/token/current', (req, res) => {
    try {
        const currentToken = tokenSystem.getCurrentToken();
        res.json({
            success: true,
            token: currentToken,
            timestamp: Date.now(),
            message: 'التوكن الحالي'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'فشل في جلب التوكن'
        });
    }
});

app.get('/api/token/stats', (req, res) => {
    try {
        const stats = tokenSystem.getStats();
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'فشل في جلب إحصائيات التوكن'
        });
    }
});

// 🔥 endpoint للإعدادات
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: config
    });
});

// 🔍 فحص حالة الاتصال بقاعدة البيانات
app.get('/api/database/status', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as db_time, version() as db_version');
        
        res.json({
            success: true,
            database: {
                connected: true,
                timestamp: result.rows[0].db_time,
                version: result.rows[0].db_version,
                connection: 'Active'
            },
            server: {
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'فشل الاتصال بقاعدة البيانات',
            details: error.message
        });
    }
});

// 🩹 فحص وإصلاح الجداول
app.get('/api/check-tables', async (req, res) => {
    try {
        console.log('🔍 فحص حالة الجداول...');
        
        // التحقق من وجود الجداول
        const tables = [
            'bot_users',
            'withdrawals', 
            'contest_leaderboard',
            'reward_codes',
            'code_redemptions'
        ];
        
        const results = {};
        
        for (const table of tables) {
            try {
                const result = await pool.query(`
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
        
        // جدول المستخدمين
        await pool.query(`
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

        // جدول السحوبات
        await pool.query(`
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

        // جدول المسابقة
        await pool.query(`
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

        // جدول الأكواد المميزة
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reward_codes (
                id SERIAL PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                reward_type VARCHAR(20) NOT NULL,
                reward_value DECIMAL(15,8) NOT NULL,
                max_uses INTEGER DEFAULT 1,
                used_count INTEGER DEFAULT 0,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول reward_codes جاهز');

        // جدول استبدال الأكواد
        await pool.query(`
            CREATE TABLE IF NOT EXISTS code_redemptions (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                code VARCHAR(100) NOT NULL,
                reward_type VARCHAR(20) NOT NULL,
                reward_value DECIMAL(15,8) NOT NULL,
                redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول code_redemptions جاهز');

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
        
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbStatus ? 'connected' : 'disconnected',
            tokenSystem: tokenStats,
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

// 🔧 إصلاح جميع الجداول
app.get('/api/repair-database', async (req, res) => {
    try {
        console.log('🔧 بدء إصلاح قاعدة البيانات...');
        
        // إعادة إنشاء جميع الجداول
        await pool.query('DROP TABLE IF EXISTS code_redemptions CASCADE');
        await pool.query('DROP TABLE IF EXISTS reward_codes CASCADE');
        await pool.query('DROP TABLE IF EXISTS contest_leaderboard CASCADE');
        await pool.query('DROP TABLE IF EXISTS withdrawals CASCADE');
        await pool.query('DROP TABLE IF EXISTS bot_users CASCADE');
        
        // إعادة الإنشاء
        await pool.query(`
            CREATE TABLE bot_users (
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

        await pool.query(`
            CREATE TABLE withdrawals (
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

        await pool.query(`
            CREATE TABLE contest_leaderboard (
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

        await pool.query(`
            CREATE TABLE reward_codes (
                id SERIAL PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                reward_type VARCHAR(20) NOT NULL,
                reward_value DECIMAL(15,8) NOT NULL,
                max_uses INTEGER DEFAULT 1,
                used_count INTEGER DEFAULT 0,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE code_redemptions (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                code VARCHAR(100) NOT NULL,
                reward_type VARCHAR(20) NOT NULL,
                reward_value DECIMAL(15,8) NOT NULL,
                redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        res.json({
            success: true,
            message: 'تم إصلاح قاعدة البيانات بنجاح'
        });

    } catch (error) {
        console.error('❌ خطأ في إصلاح قاعدة البيانات:', error);
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
app.listen(PORT, HOST, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`📊 Daily ads: ${config.dailyAdLimit} ads`);
    console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
    console.log(`👥 Referral bonus: ${config.referralBonus} TON`);
    console.log(`🏆 Contest points per ad: ${config.contestAdPoints} (نقطة واحدة فقط)`);
    console.log(`🔐 Telegram verification: ENABLED`);
    console.log(`🔄 Dynamic token system: ACTIVE (10 seconds)`);
    console.log(`🗄️ Database manager: ACTIVE`);
    
    // فحص الاتصال بقاعدة البيانات عند البدء
    checkDatabaseConnection();
    
    // إعداد الجداول تلقائياً
    setTimeout(async () => {
        try {
            await pool.query(`
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
        } catch (error) {
            console.log('⚠️  خطأ في إنشاء الجداول:', error.message);
        }
    }, 2000);
});
