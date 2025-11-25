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

// 🔧 نظام التوكن الديناميكي - الإصدار المحسن والمعدل
class DynamicTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenHistory = [];
        this.tokenCounter = 0;
        this.intervalId = null;
        
        // 🔥 التعديل: تغيير من 10 إلى 9 ثواني لتتوافق مع البوت
        this.config = {
            tokenRefreshInterval: 9000,        // 🔥 كان 10000 - أصبح 9000
            tokenValidityWindow: 25000,        // 🔥 كان 30000 - أصبح 25000
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
        '/api/validate-initdata',
        '/api/stats',
        // 🎮 إضافة endpoints الألعاب الجديدة
        '/api/games/number-challenge',
        '/api/games/spin-wheel',
        '/api/games/stats/:userId'
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
            
            // 🔥 التحديث الفوري للمسابقة
            setTimeout(async () => {
                try {
                    await updateContestLeaderboard();
                    console.log('⚡ تم التحديث الفوري للمسابقة');
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
                contestPoints: 1, // ⚡ نقطة واحدة فقط
                userRRBalance: Math.floor((parseFloat(updatedUser.earning_wallet || 0) * 10000000)) // 🔥 إضافة RR balance
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
            
            // 🔥 حساب RR balance من earning wallet
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
                    userRRBalance: userRRBalance // 🔥 إضافة RR balance
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
            
            // 🔥 حساب RR balance من earning wallet
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
                    userRRBalance: userRRBalance // 🔥 إضافة RR balance
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
                    totalEarned: parseFloat(user.total_earned || 0),
                    userRRBalance: 0 // 🔥 إضافة RR balance
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

        // 🔥 الإصلاح: تسجيل طلب السحب مع memo بشكل صحيح
        const withdrawalResult = await client.query(
            `INSERT INTO withdrawals 
             (user_id, amount, wallet_address, status, method, memo) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING *`,
            [userId, withdrawAmount, walletAddress, 'pending', method, memo || ''] // 🔥 إصلاح memo
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

// 🔥 دالة مساعدة لتحديث قائمة المتصدرين
async function updateContestLeaderboard() {
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
        
        console.log(`⚡ تم تحديث قائمة المتصدرين: ${leaderboard.rows.length} متسابق`);
        return leaderboard.rows;
    } catch (error) {
        console.error('❌ خطأ في تحديث المتصدرين:', error);
        return [];
    }
}

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
        
        // 🔥 التحديث الفوري للمتصدرين
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏆 جلب المتصدرين مرتبين حسب النقاط - تحديث فوري
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

// 🎮 نظام الألعاب الآمن - تخزين في قاعدة البيانات

// 🔥 endpoint لمعالجة لعبة الأرقام
app.post('/api/games/number-challenge', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { userId, score, timeLeft, initData } = req.body;

        console.log(`🎮 معالجة لعبة الأرقام للمستخدم: ${userId}`, { score, timeLeft });

        // التحقق من التوقيع
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        await client.query('BEGIN');

        // جلب بيانات المستخدم مع قفل الصف
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
        
        // حساب المكافأة (500 RR للفوز)
        const rewardRR = score === 9 ? 500 : 0; // فقط إذا أكمل كل الأرقام
        const rewardTON = rewardRR / 10000000; // تحويل RR إلى TON

        console.log(`💰 مكافأة اللعبة: ${rewardRR} RR (${rewardTON} TON)`);

        if (rewardRR > 0) {
            // تحديث محفظة الأرباح
            await client.query(
                `UPDATE bot_users SET 
                    earning_wallet = COALESCE(earning_wallet, 0) + $1,
                    total_earned = COALESCE(total_earned, 0) + $1
                 WHERE telegram_id = $2`,
                [rewardTON, userId]
            );

            // تسجيل نتيجة اللعبة
            await client.query(
                `INSERT INTO game_results (user_id, game_type, score, reward)
                 VALUES ($1, $2, $3, $4)`,
                [userId, 'number_challenge', score, rewardTON]
            );

            // تحديث إحصائيات الألعاب
            await client.query(`
                INSERT INTO game_stats 
                (user_id, total_games_played, total_rewards_earned, number_challenge_best_score, number_challenge_total_played, last_played)
                VALUES ($1, 1, $2, $3, 1, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    total_games_played = game_stats.total_games_played + 1,
                    total_rewards_earned = game_stats.total_rewards_earned + $2,
                    number_challenge_best_score = GREATEST(game_stats.number_challenge_best_score, $3),
                    number_challenge_total_played = game_stats.number_challenge_total_played + 1,
                    last_played = EXCLUDED.last_played,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, rewardTON, score]);
        }

        await client.query('COMMIT');

        console.log(`✅ تم معالجة لعبة الأرقام بنجاح للمستخدم: ${userId}`);

        res.json({
            success: true,
            reward: rewardTON,
            rewardRR: rewardRR,
            userRRBalance: Math.floor((parseFloat(user.earning_wallet || 0) + rewardTON) * 10000000),
            message: rewardRR > 0 ? `🎉 You won ${rewardRR} RR!` : 'Better luck next time!'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ خطأ في معالجة لعبة الأرقام:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process game result' 
        });
    } finally {
        client.release();
    }
});

// 🎡 endpoint لمعالجة لعبة السبين
app.post('/api/games/spin-wheel', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { userId, cost, reward, initData } = req.body;

        console.log(`🎡 معالجة لعبة السبين للمستخدم: ${userId}`, { cost, reward });

        // التحقق من التوقيع
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        await client.query('BEGIN');

        // جلب بيانات المستخدم مع قفل الصف
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
        
        // حساب المكافأة والتكلفة
        const costTON = cost / 10000000; // تحويل RR إلى TON
        const rewardTON = reward / 10000000; // تحويل RR إلى TON
        const netReward = rewardTON - costTON;

        console.log(`💰 تكلفة السبين: ${cost} RR (${costTON} TON)`);
        console.log(`🎁 مكافأة السبين: ${reward} RR (${rewardTON} TON)`);
        console.log(`📊 صافي الربح: ${netReward} TON`);

        // التحقق من رصيد المستخدم
        const userEarningWallet = parseFloat(user.earning_wallet || 0);
        if (userEarningWallet < costTON) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance for spin cost' 
            });
        }

        // خصم تكلفة السبين وإضافة المكافأة
        await client.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) - $1 + $2,
                total_earned = COALESCE(total_earned, 0) + $2
             WHERE telegram_id = $3`,
            [costTON, netReward > 0 ? netReward : 0, userId]
        );

        // تسجيل نتيجة اللعبة
        await client.query(
            `INSERT INTO game_results (user_id, game_type, score, reward)
             VALUES ($1, $2, $3, $4)`,
            [userId, 'spin_wheel', reward, netReward]
        );

        // تحديث إحصائيات الألعاب
        await client.query(`
            INSERT INTO game_stats 
            (user_id, total_games_played, total_rewards_earned, spin_wheel_total_spins, spin_wheel_total_won, last_played)
            VALUES ($1, 1, $2, 1, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                total_games_played = game_stats.total_games_played + 1,
                total_rewards_earned = game_stats.total_rewards_earned + $2,
                spin_wheel_total_spins = game_stats.spin_wheel_total_spins + 1,
                spin_wheel_total_won = game_stats.spin_wheel_total_won + $3,
                last_played = EXCLUDED.last_played,
                updated_at = CURRENT_TIMESTAMP
        `, [userId, netReward > 0 ? netReward : 0, netReward > 0 ? netReward : 0]);

        await client.query('COMMIT');

        console.log(`✅ تم معالجة لعبة السبين بنجاح للمستخدم: ${userId}`);

        res.json({
            success: true,
            cost: costTON,
            reward: rewardTON,
            netReward: netReward,
            userRRBalance: Math.floor((userEarningWallet - costTON + rewardTON) * 10000000),
            message: netReward > 0 ? `🎉 You won ${reward} RR! (Net: +${reward - cost} RR)` : `😞 You lost ${cost - reward} RR`
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ خطأ في معالجة لعبة السبين:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process spin result' 
        });
    } finally {
        client.release();
    }
});

// 📊 endpoint لجلب إحصائيات الألعاب
app.get('/api/games/stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        console.log(`📊 طلب إحصائيات الألعاب للمستخدم: ${userId}`);

        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        // جلب إحصائيات الألعاب
        const statsResult = await pool.query(
            'SELECT * FROM game_stats WHERE user_id = $1',
            [userId]
        );

        // جلب آخر 10 نتائج للألعاب
        const recentGamesResult = await pool.query(
            `SELECT game_type, score, reward, created_at 
             FROM game_results 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 10`,
            [userId]
        );

        const gameStats = statsResult.rows[0] || {
            total_games_played: 0,
            total_rewards_earned: 0,
            number_challenge_best_score: 0,
            number_challenge_total_played: 0,
            spin_wheel_total_spins: 0,
            spin_wheel_total_won: 0
        };

        res.json({
            success: true,
            stats: {
                totalGamesPlayed: gameStats.total_games_played || 0,
                totalRewardsEarned: parseFloat(gameStats.total_rewards_earned || 0),
                numberChallenge: {
                    bestScore: gameStats.number_challenge_best_score || 0,
                    totalPlayed: gameStats.number_challenge_total_played || 0
                },
                spinWheel: {
                    totalSpins: gameStats.spin_wheel_total_spins || 0,
                    totalWon: parseFloat(gameStats.spin_wheel_total_won || 0)
                }
            },
            recentGames: recentGamesResult.rows
        });

    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات الألعاب:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get game stats' 
        });
    }
});

// ... (بقية الـ endpoints الموجودة في الكود الأصلي تبقى كما هي)
// reward-codes, fix-contest-data, debug-user, check-tables, repair-database,
// stats, database-status, health, test-connection, token-endpoints, config

// 🩹 فحص وإصلاح الجداول - تم التحديث بإضافة جداول الألعاب
app.get('/api/check-tables', async (req, res) => {
    try {
        console.log('🔍 فحص حالة الجداول...');
        
        // التحقق من وجود الجداول
        const tables = [
            'bot_users',
            'withdrawals', 
            'contest_leaderboard',
            'reward_codes',
            'code_redemptions',
            'game_results', // 🎮 جدول جديد
            'game_stats'    // 🎮 جدول جديد
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

// 🔧 إنشاء الجداول إذا لم تكن موجودة - تم التحديث
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

        // 🎮 الجداول الجديدة للألعاب

        // جدول نتائج الألعاب
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_results (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                game_type VARCHAR(50) NOT NULL,
                score INTEGER DEFAULT 0,
                reward DECIMAL(15,8) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول game_results جاهز');

        // جدول إحصائيات الألعاب
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_stats (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                total_games_played INTEGER DEFAULT 0,
                total_rewards_earned DECIMAL(15,8) DEFAULT 0,
                number_challenge_best_score INTEGER DEFAULT 0,
                number_challenge_total_played INTEGER DEFAULT 0,
                spin_wheel_total_spins INTEGER DEFAULT 0,
                spin_wheel_total_won DECIMAL(15,8) DEFAULT 0,
                last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول game_stats جاهز');

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

// 🔧 إصلاح جميع الجداول - تم التحديث
app.get('/api/repair-database', async (req, res) => {
    try {
        console.log('🔧 بدء إصلاح قاعدة البيانات...');
        
        // إعادة إنشاء جميع الجداول
        await pool.query('DROP TABLE IF EXISTS code_redemptions CASCADE');
        await pool.query('DROP TABLE IF EXISTS reward_codes CASCADE');
        await pool.query('DROP TABLE IF EXISTS contest_leaderboard CASCADE');
        await pool.query('DROP TABLE IF EXISTS withdrawals CASCADE');
        await pool.query('DROP TABLE IF EXISTS bot_users CASCADE');
        await pool.query('DROP TABLE IF EXISTS game_results CASCADE'); // 🎮 جدول جديد
        await pool.query('DROP TABLE IF EXISTS game_stats CASCADE');   // 🎮 جدول جديد
        
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

        // 🎮 الجداول الجديدة للألعاب
        await pool.query(`
            CREATE TABLE game_results (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                game_type VARCHAR(50) NOT NULL,
                score INTEGER DEFAULT 0,
                reward DECIMAL(15,8) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE game_stats (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                total_games_played INTEGER DEFAULT 0,
                total_rewards_earned DECIMAL(15,8) DEFAULT 0,
                number_challenge_best_score INTEGER DEFAULT 0,
                number_challenge_total_played INTEGER DEFAULT 0,
                spin_wheel_total_spins INTEGER DEFAULT 0,
                spin_wheel_total_won DECIMAL(15,8) DEFAULT 0,
                last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    console.log(`🔄 Dynamic token system: ACTIVE (9 seconds)`);
    console.log(`🗄️ Database manager: ACTIVE`);
    console.log(`🎮 Games system: ENABLED (Secure Database Storage)`);
    
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
            
            // 🎮 إنشاء جداول الألعاب تلقائياً
            await pool.query(`
                CREATE TABLE IF NOT EXISTS game_results (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    game_type VARCHAR(50) NOT NULL,
                    score INTEGER DEFAULT 0,
                    reward DECIMAL(15,8) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ جدول game_results جاهز');

            await pool.query(`
                CREATE TABLE IF NOT EXISTS game_stats (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT UNIQUE NOT NULL,
                    total_games_played INTEGER DEFAULT 0,
                    total_rewards_earned DECIMAL(15,8) DEFAULT 0,
                    number_challenge_best_score INTEGER DEFAULT 0,
                    number_challenge_total_played INTEGER DEFAULT 0,
                    spin_wheel_total_spins INTEGER DEFAULT 0,
                    spin_wheel_total_won DECIMAL(15,8) DEFAULT 0,
                    last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ جدول game_stats جاهز');
            
        } catch (error) {
            console.log('⚠️  خطأ في إنشاء الجداول:', error.message);
        }
    }, 2000);
});
