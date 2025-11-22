const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();

// ✅ إصلاح CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHbzrJxIHytXdD1sNftjC8DnDz18kdvbOU";

// ✅ إصلاح الاتصال بقاعدة البيانات
const pool = new Pool({
    connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20
});

// 🔥 الإعدادات
const config = {
    adValue: 0.0001,
    dailyAdLimit: 100,
    minWithdrawal: 0.0001,
    referralBonus: 0.0005,
    contestAdPoints: 1,
    contestReferralPoints: 15
};

// ✅ نظام توكن مبسط
class SimpleTokenSystem {
    constructor() {
        this.currentToken = this.generateSimpleToken();
        setInterval(() => {
            this.currentToken = this.generateSimpleToken();
            console.log('🔄 تم تحديث التوكن');
        }, 30000);
    }

    generateSimpleToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    validateToken(token) {
        return token === this.currentToken;
    }

    getCurrentToken() {
        return this.currentToken;
    }
}

const tokenSystem = new SimpleTokenSystem();

// ✅ تبسيط middleware التوكن
const validateToken = (req, res, next) => {
    const publicEndpoints = ['/', '/api/config', '/api/health', '/api/check-db'];
    
    if (publicEndpoints.includes(req.path)) {
        return next();
    }

    const token = req.headers['x-dynamic-token'] || req.query.dynamicToken;

    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'التوكن مطلوب'
        });
    }

    if (!tokenSystem.validateToken(token)) {
        return res.status(401).json({ 
            success: false,
            error: 'توكن غير صالح'
        });
    }

    next();
};

app.use(validateToken);

// ✅ دالة التحقق من اتصال قاعدة البيانات
async function checkDatabaseConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time');
        client.release();
        console.log('✅ قاعدة البيانات متصلة');
        return true;
    } catch (error) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
        return false;
    }
}

// ✅ تحقق تليجرام
function validateTelegramInitData(initData) {
    try {
        if (!initData) return false;

        const decoded = decodeURIComponent(initData);
        const parsed = querystring.parse(decoded);
        const hash = parsed.hash;

        if (!hash) return false;

        const dataCheckString = Object.keys(parsed)
            .filter(key => key !== 'hash')
            .sort()
            .map(key => `${key}=${parsed[key]}`)
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();

        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        return calculatedHash === hash;
    } catch (error) {
        console.error('❌ خطأ في التحقق:', error);
        return false;
    }
}

// ✅ استخراج بيانات المستخدم
function parseTelegramUser(initData) {
    try {
        if (!initData) return null;

        const decoded = decodeURIComponent(initData);
        const parsed = querystring.parse(decoded);
        const userStr = parsed.user;
        
        if (!userStr) return null;
        
        return JSON.parse(userStr);
    } catch (error) {
        console.error('❌ خطأ في تحليل بيانات المستخدم:', error);
        return null;
    }
}

// ✅ جلب المستخدم من قاعدة البيانات
async function getUserFromDB(userId) {
    try {
        const result = await pool.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدم:', error.message);
        return null;
    }
}

// ✅ إنشاء مستخدم جديد
async function createUserInDB(userData) {
    try {
        const query = `
            INSERT INTO bot_users 
            (telegram_id, username, first_name, balance, earning_wallet) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING *
        `;
        
        const values = [
            userData.telegram_id.toString(),
            userData.username || '',
            userData.first_name || 'مستخدم',
            0,
            0
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error.message);
        
        if (error.code === '23505') {
            return await getUserFromDB(userData.telegram_id);
        }
        
        return null;
    }
}

// ✅ إعداد الجداول
async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255) NOT NULL DEFAULT 'مستخدم',
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
                method VARCHAR(100) DEFAULT 'TON Wallet',
                memo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ تم إعداد الجداول بنجاح');
        return true;
    } catch (error) {
        console.error('❌ خطأ في إعداد الجداول:', error);
        return false;
    }
}

// 🏠 الصفحة الرئيسية
app.get('/', async (req, res) => {
    const dbConnected = await checkDatabaseConnection();
    
    res.json({ 
        message: 'TON Rewards Backend - جاري التشغيل',
        status: dbConnected ? '✅ متصل بقاعدة البيانات' : '❌ خطأ في قاعدة البيانات',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

// 🔧 نقطة فحص الصحة
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        token: tokenSystem.getCurrentToken()
    });
});

// 📋 نقطة الإعدادات
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: {
            adValue: config.adValue,
            dailyAdLimit: config.dailyAdLimit,
            minWithdrawal: config.minWithdrawal,
            referralBonus: config.referralBonus,
            contestAdPoints: config.contestAdPoints,
            contestReferralPoints: config.contestReferralPoints,
            botUsername: "Aborabie777_bot"
        }
    });
});

// 🔐 نقطة التوكن الحالي
app.get('/api/token/current', (req, res) => {
    res.json({
        success: true,
        token: tokenSystem.getCurrentToken(),
        valid_for: '30 ثانية'
    });
});

// 👤 جلب بيانات المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        console.log(`📥 طلب جلب بيانات المستخدم: ${userId}`);

        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

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
                isNewUser: isNewUser,
                welcomeMessage: isNewUser ? `🎉 أهلاً وسهلاً ${user.first_name}!` : `مرحباً بعودتك ${user.first_name}!`
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

// 👤 تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    try {
        const { initData } = req.body;

        console.log('📥 طلب تسجيل مستخدم جديد');

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
        res.status(500).json({ 
            success: false,
            error: 'Registration failed' 
        });
    }
});

// 📺 مشاهدة إعلان
app.post('/api/watch-ad', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { initData } = req.body;

        console.log('📥 طلب مشاهدة إعلان');

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
                last_ad_date = CURRENT_DATE
             WHERE telegram_id = $3 
             RETURNING *`,
            [adReward, dailyAdCount + 1, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            await client.query('COMMIT');
            
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (dailyAdCount + 1),
                totalEarned: parseFloat(updatedUser.total_earned || 0),
                contestPoints: config.contestAdPoints
            });
        } else {
            await client.query('ROLLBACK');
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
            error: 'Failed to process ad' 
        });
    } finally {
        client.release();
    }
});

// 💰 تحويل المحفظة إلى الرصيد
app.post('/api/move-to-balance', async (req, res) => {
    try {
        const { initData } = req.body;

        console.log('📥 طلب تحويل الرصيد');

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
    const client = await pool.connect();
    
    try {
        const { initData, amount, walletAddress, method = 'TON Wallet', memo = '' } = req.body;

        console.log('📥 طلب سحب:', { amount, walletAddress, method, memo });

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

        if (withdrawAmount < config.minWithdrawal) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: `Minimum withdrawal is ${config.minWithdrawal} TON` 
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
            [userId, withdrawAmount, walletAddress, 'pending', method, memo]
        );

        await client.query('COMMIT');

        const withdrawal = withdrawalResult.rows[0];
        
        console.log('✅ تم إنشاء طلب السحب بنجاح:', withdrawal.id);
        
        res.json({
            success: true,
            withdrawalId: withdrawal.id,
            newBalance: userBalance - withdrawAmount,
            message: 'تم تقديم طلب السحب بنجاح'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ خطأ في السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed' 
        });
    } finally {
        client.release();
    }
});

// 📋 الحصول على تاريخ السحوبات
app.get('/api/withdrawals/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        console.log(`📥 طلب تاريخ السحوبات للمستخدم: ${userId}`);

        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        const withdrawals = await pool.query(
            `SELECT * FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [userId]
        );

        console.log(`📊 عدد السحوبات: ${withdrawals.rows.length}`);
        
        res.json({
            success: true,
            withdrawals: withdrawals.rows.map(w => ({
                id: w.id,
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                method: w.method,
                memo: w.memo,
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

// 🔧 نقطة فحص قاعدة البيانات
app.get('/api/check-db', async (req, res) => {
    try {
        const dbConnected = await checkDatabaseConnection();
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        const tableNames = tables.rows.map(row => row.table_name);
        
        res.json({
            success: true,
            dbConnected: dbConnected,
            tables: tableNames,
            hasBotUsers: tableNames.includes('bot_users'),
            hasWithdrawals: tableNames.includes('withdrawals')
        });
    } catch (error) {
        console.error('❌ خطأ في فحص قاعدة البيانات:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 🔧 إعداد الجداول
app.get('/api/setup-database', async (req, res) => {
    try {
        await setupDatabase();
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

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// تهيئة قاعدة البيانات عند البدء
setupDatabase().then(() => {
    console.log('✅ تم إعداد قاعدة البيانات');
}).catch(error => {
    console.error('❌ فشل في إعداد قاعدة البيانات:', error);
});

app.listen(PORT, HOST, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`📊 Daily ads: ${config.dailyAdLimit} ads`);
    console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
});
