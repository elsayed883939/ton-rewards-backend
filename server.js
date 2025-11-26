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

// 🔥 الإعدادات الجديدة - 100 إعلان يومياً + تذاكر
const config = {
    adValue: 0.0001,          // 0.0001 TON لكل إعلان
    dailyAdLimit: 100,        // 100 إعلان يومياً  
    minWithdrawal: 0.0001,    // الحد الأدنى للسحب 0.0001 TON
    referralBonus: 0.0005,    // مكافأة الإحالة
    contestAdPoints: 1,       // نقطة واحدة فقط لكل إعلان
    contestReferralPoints: 15, // نقاط المسابقة لكل إحالة
    ticketPrice: 500,         // 🔥 سعر التذكرة 500 RR
    ticketPerAd: 1            // 🔥 تذكرة واحدة لكل إعلان
};

// 🔧 نظام التوكن الديناميكي - الإصدار المحسن والمعدل
class DynamicTokenSystem {
    constructor() {
        this.tokens = new Map();
        this.currentToken = null;
        this.tokenHistory = [];
        this.tokenCounter = 0;
        this.intervalId = null;
        
        this.config = {
            tokenRefreshInterval: 9000,        // 9 ثواني
            tokenValidityWindow: 25000,        // 25 ثانية
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
        '/api/contest/leaderboard',
        '/api/contest/user-rank/:userId',
        '/api/contest/user/:userId',
        '/api/validate-initdata',
        '/api/stats',
        '/api/games/number-challenge',
        '/api/games/spin-wheel',
        '/api/games/math-challenge',
        '/api/games/stats/:userId',
        '/api/tickets/buy',
        '/api/tickets/user/:userId'
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
        await dbManager.waitForInitialization();
        const result = await dbManager.query('SELECT NOW() as current_time');
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
            `INSERT INTO bot_users (telegram_id, username, first_name, balance, earning_wallet, total_earned, tickets) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [
                userData.telegram_id,
                userData.username,
                userData.first_name,
                0, // balance
                0, // earning_wallet
                0, // total_earned
                0  // tickets
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        return null;
    }
}

// 🎫 نظام التذاكر الجديد
async function getUserTickets(userId) {
    try {
        const result = await dbManager.query(
            'SELECT tickets FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        return result.rows[0]?.tickets || 0;
    } catch (error) {
        console.error('❌ خطأ في جلب التذاكر:', error);
        return 0;
    }
}

async function updateUserTickets(userId, ticketChange) {
    try {
        const result = await dbManager.query(
            'UPDATE bot_users SET tickets = GREATEST(0, tickets + $1) WHERE telegram_id = $2 RETURNING tickets',
            [ticketChange, userId]
        );
        return result.rows[0]?.tickets || 0;
    } catch (error) {
        console.error('❌ خطأ في تحديث التذاكر:', error);
        return 0;
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

// 📺 مشاهدة إعلان - الإصدار المحسن مع التذاكر
app.post('/api/watch-ad', async (req, res) => {
    let client;
    
    try {
        const { userId } = req.body; // 🔥 نأخذ userId مباشرة بدون تحقق

        console.log('📥 طلب مشاهدة إعلان للمستخدم:', userId);

        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        // 🔥 جلب المستخدم مع قفل الصف لمنع التكرار
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

        // 🔥 تحديث البيانات في قاعدة البيانات مع إضافة تذكرة
        const adReward = config.adValue;
        const ticketReward = config.ticketPerAd;
        
        console.log(`💰 مكافأة الإعلان: ${adReward} TON + ${ticketReward} تذكرة`);
        
        const updateResult = await client.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1,
                tickets = COALESCE(tickets, 0) + $2,
                daily_ad_count = $3,
                last_ad_date = CURRENT_DATE,
                last_ad_timestamp = CURRENT_TIMESTAMP
             WHERE telegram_id = $4 
             RETURNING *`,
            [adReward, ticketReward, dailyAdCount + 1, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            // 🔥 تحديث نقاط المسابقة - نقطة واحدة فقط
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
                    
                    console.log(`✅ تم تحديث المسابقة: +1 نقطة للمستخدم ${userId}`);
                } else {
                    await client.query(`
                        INSERT INTO contest_leaderboard 
                        (user_id, username, first_name, points, ads_watched, last_activity)
                        VALUES ($1, $2, $3, 1, 1, CURRENT_TIMESTAMP)
                    `, [userId, user.username || '', user.first_name || 'User']);
                    
                    console.log(`✅ تم إدخال جديد في المسابقة: +1 نقطة للمستخدم ${userId}`);
                }
            } catch (contestError) {
                console.log('⚠️  خطأ في تحديث المسابقة:', contestError.message);
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
                contestPoints: 1,
                userRRBalance: Math.floor((parseFloat(updatedUser.earning_wallet || 0) * 10000000)),
                ticketsEarned: ticketReward,
                totalTickets: updatedUser.tickets || 0,
                message: `🎉 Ad completed! +1,000 RR +1 Contest Point +${ticketReward} Ticket! ✨`
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
                    userRRBalance: userRRBalance,
                    tickets: user.tickets || 0 // 🔥 إضافة التذاكر
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
                    userRRBalance: userRRBalance,
                    tickets: user.tickets || 0 // 🔥 إضافة التذاكر
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
                    userRRBalance: 0,
                    tickets: 0 // 🔥 إضافة التذاكر
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

// 🎫 نظام شراء التذاكر
app.post('/api/tickets/buy', async (req, res) => {
    let client;
    
    try {
        const { userId, quantity = 1 } = req.body;

        console.log(`🎫 طلب شراء ${quantity} تذكرة للمستخدم: ${userId}`);

        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        await dbManager.waitForInitialization();
        client = await dbManager.connect();
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
        const totalCost = config.ticketPrice * quantity;
        const userRRBalance = Math.floor((parseFloat(user.earning_wallet || 0) * 10000000));

        // التحقق من الرصيد
        if (userRRBalance < totalCost) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient RR balance' 
            });
        }

        // خصم التكلفة وإضافة التذاكر
        const costTON = totalCost / 10000000;
        await client.query(
            `UPDATE bot_users SET 
                earning_wallet = earning_wallet - $1,
                tickets = COALESCE(tickets, 0) + $2
             WHERE telegram_id = $3 
             RETURNING *`,
            [costTON, quantity, userId]
        );

        await client.query('COMMIT');

        console.log(`✅ تم شراء ${quantity} تذاكر بنجاح`);

        res.json({
            success: true,
            ticketsPurchased: quantity,
            totalCost: totalCost,
            newRRBalance: userRRBalance - totalCost,
            newTickets: (user.tickets || 0) + quantity,
            message: `✅ تم شراء ${quantity} تذاكر بنجاح!`
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في شراء التذاكر:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to buy tickets' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 🎫 جلب عدد تذاكر المستخدم
app.get('/api/tickets/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        const tickets = await getUserTickets(userId);
        
        res.json({
            success: true,
            userId: userId,
            tickets: tickets
        });
    } catch (error) {
        console.error('❌ خطأ في جلب التذاكر:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get tickets' 
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
        res.status(500).json({ 
            success: false,
            error: 'Transfer failed' 
        });
    }
});

// 💳 طلب سحب - الإصدار المحسن والمصلح
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
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
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

// 🏆 نظام المسابقة المحسن (نقطة واحدة فقط لكل إعلان)
app.post('/api/contest/update-points', async (req, res) => {
    try {
        const { userId, points = 1, adsWatched = 1, referralsCount = 0 } = req.body;
        
        console.log(`🔄 تحديث نقاط المسابقة للمستخدم: ${userId}`, { points, adsWatched, referralsCount });
        
        // جلب بيانات المستخدم أولاً
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // ⚡ نقطة واحدة فقط لكل إعلان
        const actualPoints = 1;
        const actualAds = 1;
        
        // تحديث أو إدخال بيانات المسابقة
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🎮 نظام الألعاب المحسن مع التذاكر

// 🎯 لعبة الأرقام المحسنة
app.post('/api/games/number-challenge', async (req, res) => {
    let client;
    
    try {
        const { userId, score, timeLeft } = req.body;

        console.log(`🎮 معالجة لعبة الأرقام للمستخدم: ${userId}`, { score, timeLeft });

        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        // 🔥 التحقق من وجود تذاكر
        const userTickets = await getUserTickets(userId);
        if (userTickets < 1) {
            return res.status(400).json({ 
                success: false,
                error: 'No tickets available. Watch ads to earn tickets!' 
            });
        }

        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        // خصم تذكرة
        await client.query(
            'UPDATE bot_users SET tickets = GREATEST(0, tickets - 1) WHERE telegram_id = $1',
            [userId]
        );

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
        
        // حساب المكافأة (100-800 RR عشوائي)
        const minReward = 100;
        const maxReward = 800;
        const rewardRR = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
        const rewardTON = rewardRR / 10000000;

        console.log(`💰 مكافأة اللعبة: ${rewardRR} RR (${rewardTON} TON)`);

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
            `INSERT INTO game_results (user_id, game_type, score, reward, tickets_used)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, 'number_challenge', score, rewardTON, 1]
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

        await client.query('COMMIT');

        console.log(`✅ تم معالجة لعبة الأرقام بنجاح للمستخدم: ${userId}`);

        res.json({
            success: true,
            reward: rewardTON,
            rewardRR: rewardRR,
            userRRBalance: Math.floor((parseFloat(user.earning_wallet || 0) + rewardTON) * 10000000),
            ticketsUsed: 1,
            remainingTickets: userTickets - 1,
            message: `🎉 You won ${rewardRR} RR!`
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في معالجة لعبة الأرقام:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process game result' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 🎡 لعبة السبين المحسنة
app.post('/api/games/spin-wheel', async (req, res) => {
    let client;
    
    try {
        const { userId } = req.body;

        console.log(`🎡 معالجة لعبة السبين للمستخدم: ${userId}`);

        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        // 🔥 التحقق من وجود تذاكر
        const userTickets = await getUserTickets(userId);
        if (userTickets < 1) {
            return res.status(400).json({ 
                success: false,
                error: 'No tickets available. Watch ads to earn tickets!' 
            });
        }

        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        // خصم تذكرة
        await client.query(
            'UPDATE bot_users SET tickets = GREATEST(0, tickets - 1) WHERE telegram_id = $1',
            [userId]
        );

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
        
        // 🎡 محاكاة عجلة الحظ مع احتمالات
        const wheelSegments = [
            { reward: 100, probability: 0.3, message: "🎯 Good try!" },      // 30%
            { reward: 200, probability: 0.25, message: "🎉 Nice spin!" },   // 25%
            { reward: 300, probability: 0.2, message: "🔥 Great job!" },    // 20%
            { reward: 500, probability: 0.15, message: "🚀 Amazing!" },     // 15%
            { reward: 800, probability: 0.08, message: "🏆 JACKPOT!" },    // 8%
            { reward: 0, probability: 0.02, message: "💥 Game Over!" }      // 2% خسارة
        ];

        // اختيار المكافأة بناءً على الاحتمالات
        const random = Math.random();
        let cumulativeProbability = 0;
        let selectedReward = wheelSegments[0];

        for (const segment of wheelSegments) {
            cumulativeProbability += segment.probability;
            if (random <= cumulativeProbability) {
                selectedReward = segment;
                break;
            }
        }

        const rewardRR = selectedReward.reward;
        const rewardTON = rewardRR / 10000000;

        console.log(`🎡 نتيجة السبين: ${rewardRR} RR - ${selectedReward.message}`);

        if (rewardRR > 0) {
            // تحديث محفظة الأرباح
            await client.query(
                `UPDATE bot_users SET 
                    earning_wallet = COALESCE(earning_wallet, 0) + $1,
                    total_earned = COALESCE(total_earned, 0) + $1
                 WHERE telegram_id = $2`,
                [rewardTON, userId]
            );
        }

        // تسجيل نتيجة اللعبة
        await client.query(
            `INSERT INTO game_results (user_id, game_type, score, reward, tickets_used)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, 'spin_wheel', rewardRR, rewardTON, 1]
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
        `, [userId, rewardTON, rewardTON]);

        await client.query('COMMIT');

        console.log(`✅ تم معالجة لعبة السبين بنجاح للمستخدم: ${userId}`);

        res.json({
            success: true,
            reward: rewardTON,
            rewardRR: rewardRR,
            userRRBalance: Math.floor((parseFloat(user.earning_wallet || 0) + rewardTON) * 10000000),
            ticketsUsed: 1,
            remainingTickets: userTickets - 1,
            wheelResult: selectedReward,
            message: selectedReward.reward > 0 ? 
                   `🎡 ${selectedReward.message} You won ${rewardRR} RR!` : 
                   `💥 ${selectedReward.message} Better luck next time!`
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في معالجة لعبة السبين:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process spin result' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// ➕ لعبة الرياضيات الجديدة
app.post('/api/games/math-challenge', async (req, res) => {
    let client;
    
    try {
        const { userId, correctAnswers, totalQuestions, timeLeft } = req.body;

        console.log(`➕ معالجة لعبة الرياضيات للمستخدم: ${userId}`, { 
            correctAnswers, totalQuestions, timeLeft 
        });

        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        // 🔥 التحقق من وجود تذاكر
        const userTickets = await getUserTickets(userId);
        if (userTickets < 1) {
            return res.status(400).json({ 
                success: false,
                error: 'No tickets available. Watch ads to earn tickets!' 
            });
        }

        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        // خصم تذكرة
        await client.query(
            'UPDATE bot_users SET tickets = GREATEST(0, tickets - 1) WHERE telegram_id = $1',
            [userId]
        );

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
        
        // حساب المكافأة بناءً على عدد الإجابات الصحيحة
        const successRate = correctAnswers / totalQuestions;
        let rewardRR;

        if (correctAnswers >= 3) { // فاز إذا أجاب على 3 أسئلة صحيحة على الأقل
            const minReward = 100;
            const maxReward = 800;
            rewardRR = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
        } else {
            rewardRR = 0; // خسر
        }

        const rewardTON = rewardRR / 10000000;

        console.log(`💰 مكافأة لعبة الرياضيات: ${rewardRR} RR (${rewardTON} TON)`);

        if (rewardRR > 0) {
            // تحديث محفظة الأرباح
            await client.query(
                `UPDATE bot_users SET 
                    earning_wallet = COALESCE(earning_wallet, 0) + $1,
                    total_earned = COALESCE(total_earned, 0) + $1
                 WHERE telegram_id = $2`,
                [rewardTON, userId]
            );
        }

        // تسجيل نتيجة اللعبة
        await client.query(
            `INSERT INTO game_results (user_id, game_type, score, reward, tickets_used, additional_data)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, 'math_challenge', correctAnswers, rewardTON, 1, 
             JSON.stringify({ totalQuestions, timeLeft, successRate })]
        );

        // تحديث إحصائيات الألعاب
        await client.query(`
            INSERT INTO game_stats 
            (user_id, total_games_played, total_rewards_earned, math_challenge_best_score, math_challenge_total_played, last_played)
            VALUES ($1, 1, $2, $3, 1, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                total_games_played = game_stats.total_games_played + 1,
                total_rewards_earned = game_stats.total_rewards_earned + $2,
                math_challenge_best_score = GREATEST(game_stats.math_challenge_best_score, $3),
                math_challenge_total_played = game_stats.math_challenge_total_played + 1,
                last_played = EXCLUDED.last_played,
                updated_at = CURRENT_TIMESTAMP
        `, [userId, rewardTON, correctAnswers]);

        await client.query('COMMIT');

        console.log(`✅ تم معالجة لعبة الرياضيات بنجاح للمستخدم: ${userId}`);

        const message = rewardRR > 0 ? 
            `🧮 Amazing! You got ${correctAnswers}/${totalQuestions} correct and won ${rewardRR} RR!` :
            `💥 Game Over! You got ${correctAnswers}/${totalQuestions} correct. Try again!`;

        res.json({
            success: true,
            reward: rewardTON,
            rewardRR: rewardRR,
            userRRBalance: Math.floor((parseFloat(user.earning_wallet || 0) + rewardTON) * 10000000),
            ticketsUsed: 1,
            remainingTickets: userTickets - 1,
            correctAnswers: correctAnswers,
            totalQuestions: totalQuestions,
            successRate: successRate,
            message: message
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في معالجة لعبة الرياضيات:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process math challenge' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 📊 endpoint لجلب إحصائيات الألعاب
app.get('/api/games/stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        console.log(`📊 طلب إحصائيات الألعاب للمستخدم: ${userId}`);

        // جلب إحصائيات الألعاب
        const statsResult = await dbManager.query(
            'SELECT * FROM game_stats WHERE user_id = $1',
            [userId]
        );

        // جلب آخر 10 نتائج للألعاب
        const recentGamesResult = await dbManager.query(
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
            spin_wheel_total_won: 0,
            math_challenge_best_score: 0,
            math_challenge_total_played: 0
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
                },
                mathChallenge: {
                    bestScore: gameStats.math_challenge_best_score || 0,
                    totalPlayed: gameStats.math_challenge_total_played || 0
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
        const existingReferral = await dbManager.query(
            'SELECT * FROM referrals WHERE referred_id = $1',
            [referredId]
        );
        
        if (existingReferral.rows.length > 0) {
            return res.json({ success: true, message: 'User already referred', referral: existingReferral.rows[0] });
        }
        
        // تسجيل الإحالة الجديدة
        const result = await dbManager.query(`
            INSERT INTO referrals (referrer_id, referred_id, status)
            VALUES ($1, $2, 'active')
            RETURNING *
        `, [referrerId, referredId]);
        
        // تحديث عدد الإحالات في المسابقة - 15 نقطة لكل إحالة
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

app.get('/api/referrals/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // جلب الإحالات
        const referrals = await dbManager.query(`
            SELECT r.*, bu.first_name, bu.username 
            FROM referrals r
            LEFT JOIN bot_users bu ON r.referred_id = bu.telegram_id
            WHERE r.referrer_id = $1
            ORDER BY r.created_at DESC
        `, [userId]);
        
        // إحصائيات الإحالات
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

// 🩹 فحص وإصلاح الجداول - تم التحديث بإضافة جداول الألعاب والتذاكر
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
            'game_results',
            'game_stats',
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

// 🔧 إنشاء الجداول إذا لم تكن موجودة - تم التحديث الكامل
app.get('/api/setup-database', async (req, res) => {
    try {
        console.log('🔧 بدء إعداد الجداول...');
        
        // جدول المستخدمين مع التذاكر
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
                tickets INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول bot_users جاهز');

        // جدول السحوبات
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

        // جدول المسابقة
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

        // جدول الأكواد المميزة
        await dbManager.query(`
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
        await dbManager.query(`
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

        // جدول نتائج الألعاب
        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS game_results (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                game_type VARCHAR(50) NOT NULL,
                score INTEGER DEFAULT 0,
                reward DECIMAL(15,8) DEFAULT 0,
                tickets_used INTEGER DEFAULT 1,
                additional_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول game_results جاهز');

        // جدول إحصائيات الألعاب
        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS game_stats (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                total_games_played INTEGER DEFAULT 0,
                total_rewards_earned DECIMAL(15,8) DEFAULT 0,
                number_challenge_best_score INTEGER DEFAULT 0,
                number_challenge_total_played INTEGER DEFAULT 0,
                spin_wheel_total_spins INTEGER DEFAULT 0,
                spin_wheel_total_won DECIMAL(15,8) DEFAULT 0,
                math_challenge_best_score INTEGER DEFAULT 0,
                math_challenge_total_played INTEGER DEFAULT 0,
                last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول game_stats جاهز');

        // جدول الإحالات
        await dbManager.query(`
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT NOT NULL,
                referred_id BIGINT NOT NULL UNIQUE,
                referrer_earnings DECIMAL(15,8) DEFAULT 0,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول referrals جاهز');

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

// 🔧 إصلاح جميع الجداول - تم التحديث الكامل
app.get('/api/repair-database', async (req, res) => {
    try {
        console.log('🔧 بدء إصلاح قاعدة البيانات...');
        
        // إعادة إنشاء جميع الجداول
        await dbManager.query('DROP TABLE IF EXISTS code_redemptions CASCADE');
        await dbManager.query('DROP TABLE IF EXISTS reward_codes CASCADE');
        await dbManager.query('DROP TABLE IF EXISTS contest_leaderboard CASCADE');
        await dbManager.query('DROP TABLE IF EXISTS withdrawals CASCADE');
        await dbManager.query('DROP TABLE IF EXISTS bot_users CASCADE');
        await dbManager.query('DROP TABLE IF EXISTS game_results CASCADE');
        await dbManager.query('DROP TABLE IF EXISTS game_stats CASCADE');
        await dbManager.query('DROP TABLE IF EXISTS referrals CASCADE');
        
        // إعادة الإنشاء
        await dbManager.query(`
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
                tickets INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbManager.query(`
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

        await dbManager.query(`
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

        await dbManager.query(`
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

        await dbManager.query(`
            CREATE TABLE code_redemptions (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                code VARCHAR(100) NOT NULL,
                reward_type VARCHAR(20) NOT NULL,
                reward_value DECIMAL(15,8) NOT NULL,
                redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbManager.query(`
            CREATE TABLE game_results (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                game_type VARCHAR(50) NOT NULL,
                score INTEGER DEFAULT 0,
                reward DECIMAL(15,8) DEFAULT 0,
                tickets_used INTEGER DEFAULT 1,
                additional_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbManager.query(`
            CREATE TABLE game_stats (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                total_games_played INTEGER DEFAULT 0,
                total_rewards_earned DECIMAL(15,8) DEFAULT 0,
                number_challenge_best_score INTEGER DEFAULT 0,
                number_challenge_total_played INTEGER DEFAULT 0,
                spin_wheel_total_spins INTEGER DEFAULT 0,
                spin_wheel_total_won DECIMAL(15,8) DEFAULT 0,
                math_challenge_best_score INTEGER DEFAULT 0,
                math_challenge_total_played INTEGER DEFAULT 0,
                last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbManager.query(`
            CREATE TABLE referrals (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT NOT NULL,
                referred_id BIGINT NOT NULL UNIQUE,
                referrer_earnings DECIMAL(15,8) DEFAULT 0,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            uptime: process.uptime(),
            games: {
                number_challenge: 'active',
                spin_wheel: 'active', 
                math_challenge: 'active',
                tickets_system: 'active'
            }
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

// 📊 إحصائيات النظام
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await dbManager.query('SELECT COUNT(*) as count FROM bot_users');
        const totalWithdrawals = await dbManager.query('SELECT COUNT(*) as count FROM withdrawals');
        const totalEarned = await dbManager.query('SELECT COALESCE(SUM(total_earned), 0) as total FROM bot_users');
        const activeContestants = await dbManager.query('SELECT COUNT(*) as count FROM contest_leaderboard');
        
        res.json({
            success: true,
            stats: {
                totalUsers: parseInt(totalUsers.rows[0].count),
                totalWithdrawals: parseInt(totalWithdrawals.rows[0].count),
                totalEarned: parseFloat(totalEarned.rows[0].total),
                activeContestants: parseInt(activeContestants.rows[0].count),
                dailyAdLimit: config.dailyAdLimit,
                ticketPrice: config.ticketPrice
            }
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات النظام:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🎯 إنشاء أكواد مكافآت
app.post('/api/reward-codes/create', async (req, res) => {
    try {
        const { code, rewardType, rewardValue, maxUses = 1, expiresAt } = req.body;
        
        if (!code || !rewardType || !rewardValue) {
            return res.status(400).json({ success: false, error: 'Code, rewardType, and rewardValue are required' });
        }

        const result = await dbManager.query(`
            INSERT INTO reward_codes (code, reward_type, reward_value, max_uses, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [code.toUpperCase(), rewardType, rewardValue, maxUses, expiresAt]);

        res.json({
            success: true,
            rewardCode: result.rows[0],
            message: 'تم إنشاء كود المكافأة بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء كود المكافأة:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔓 استبدال الأكواد
app.post('/api/reward-codes/redeem', async (req, res) => {
    let client;
    
    try {
        const { userId, code } = req.body;

        if (!userId || !code) {
            return res.status(400).json({ success: false, error: 'User ID and code are required' });
        }

        await dbManager.waitForInitialization();
        client = await dbManager.connect();
        await client.query('BEGIN');

        // التحقق من صحة الكود
        const codeResult = await client.query(
            'SELECT * FROM reward_codes WHERE code = $1 AND (expires_at IS NULL OR expires_at > NOW())',
            [code.toUpperCase()]
        );

        if (codeResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Invalid or expired code' });
        }

        const rewardCode = codeResult.rows[0];

        // التحقق من عدد الاستخدامات
        if (rewardCode.used_count >= rewardCode.max_uses) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Code has reached maximum uses' });
        }

        // التحقق إذا المستخدم استخدم الكود مسبقاً
        const existingRedemption = await client.query(
            'SELECT * FROM code_redemptions WHERE user_id = $1 AND code = $2',
            [userId, code.toUpperCase()]
        );

        if (existingRedemption.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'You have already redeemed this code' });
        }

        // تطبيق المكافأة
        if (rewardCode.reward_type === 'TON') {
            await client.query(
                'UPDATE bot_users SET balance = balance + $1 WHERE telegram_id = $2',
                [rewardCode.reward_value, userId]
            );
        } else if (rewardCode.reward_type === 'RR') {
            const rewardTON = rewardCode.reward_value / 10000000;
            await client.query(
                'UPDATE bot_users SET earning_wallet = earning_wallet + $1 WHERE telegram_id = $2',
                [rewardTON, userId]
            );
        } else if (rewardCode.reward_type === 'TICKETS') {
            await client.query(
                'UPDATE bot_users SET tickets = tickets + $1 WHERE telegram_id = $2',
                [rewardCode.reward_value, userId]
            );
        }

        // تحديث عدد استخدامات الكود
        await client.query(
            'UPDATE reward_codes SET used_count = used_count + 1 WHERE id = $1',
            [rewardCode.id]
        );

        // تسجيل الاستبدال
        await client.query(
            'INSERT INTO code_redemptions (user_id, code, reward_type, reward_value) VALUES ($1, $2, $3, $4)',
            [userId, code.toUpperCase(), rewardCode.reward_type, rewardCode.reward_value]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            rewardType: rewardCode.reward_type,
            rewardValue: rewardCode.reward_value,
            message: `🎉 تم استبدال الكود بنجاح! حصلت على ${rewardCode.reward_value} ${rewardCode.reward_type}`
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في استبدال الكود:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (client) {
            client.release();
        }
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

// تأخير بدء السيرفر لضمان تهيئة قاعدة البيانات
setTimeout(() => {
    app.listen(PORT, HOST, () => {
        console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
        console.log(`💰 Ad reward: ${config.adValue} TON`);
        console.log(`📊 Daily ads: ${config.dailyAdLimit} ads`);
        console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
        console.log(`👥 Referral bonus: ${config.referralBonus} TON`);
        console.log(`🏆 Contest points per ad: ${config.contestAdPoints}`);
        console.log(`🎫 Ticket system: ACTIVE (${config.ticketPrice} RR per ticket)`);
        console.log(`🎮 Games: Number Challenge, Spin Wheel, Math Challenge`);
        console.log(`🔐 Telegram verification: ENABLED`);
        console.log(`🔄 Dynamic token system: ACTIVE (9 seconds)`);
        console.log(`🗄️ Database manager: ${dbManager.initialized ? 'ACTIVE' : 'INITIALIZING'}`);
        
        // فحص الاتصال بقاعدة البيانات عند البدء
        checkDatabaseConnection();
        
        // إعداد الجداول تلقائياً
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
                        tickets INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ جدول bot_users جاهز');
                
                await dbManager.query(`
                    CREATE TABLE IF NOT EXISTS game_results (
                        id SERIAL PRIMARY KEY,
                        user_id BIGINT NOT NULL,
                        game_type VARCHAR(50) NOT NULL,
                        score INTEGER DEFAULT 0,
                        reward DECIMAL(15,8) DEFAULT 0,
                        tickets_used INTEGER DEFAULT 1,
                        additional_data JSONB,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ جدول game_results جاهز');

                await dbManager.query(`
                    CREATE TABLE IF NOT EXISTS game_stats (
                        id SERIAL PRIMARY KEY,
                        user_id BIGINT UNIQUE NOT NULL,
                        total_games_played INTEGER DEFAULT 0,
                        total_rewards_earned DECIMAL(15,8) DEFAULT 0,
                        number_challenge_best_score INTEGER DEFAULT 0,
                        number_challenge_total_played INTEGER DEFAULT 0,
                        spin_wheel_total_spins INTEGER DEFAULT 0,
                        spin_wheel_total_won DECIMAL(15,8) DEFAULT 0,
                        math_challenge_best_score INTEGER DEFAULT 0,
                        math_challenge_total_played INTEGER DEFAULT 0,
                        last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ جدول game_stats جاهز');
                
                console.log('🎯 جميع الأنظمة جاهزة للعمل!');
                
            } catch (error) {
                console.log('⚠️  خطأ في إنشاء الجداول:', error.message);
            }
        }, 3000);
    });
}, 1000);
