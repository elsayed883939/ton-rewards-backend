const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// 🔧 إصلاح CORS - أضف هذا قبل أي routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// معالجة طلبات OPTIONS
app.options('*', cors());

// 🔐 إعدادات الأمان - بيانات الدخول المباشرة للتجربة
const BOT_TOKEN = "8257278435:AAHbzrJxIHytXdD1sNftjC8DnDz18kdvbOU";
const JWT_SECRET = "ton_rewards_secret_key_2024";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123"; // كلمة المرور المباشرة للتجربة

// الاتصال بقاعدة البيانات
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
    ssl: { rejectUnauthorized: false }
});

const config = {
    adValue: 0.0005,
    dailyAdLimit: 10,
    minWithdrawal: 0.01,
    maxWithdrawal: 100
};

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

// 🔐 التحقق من توقيع تليجرام
function validateTelegramInitData(initData) {
    try {
        if (!initData) return false;

        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        const hash = parsedData.hash;
        
        if (!hash) return false;

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

// 🔐 التحقق من توكن المسؤول
function validateAdminToken(token) {
    try {
        if (!token) return false;
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.username === ADMIN_USERNAME;
    } catch (error) {
        return false;
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
        console.error('❌ خطأ في جلب المستخدم من DB:', error.message);
        return null;
    }
}

// ➕ إنشاء مستخدم جديد
async function createUserInDB(userData) {
    try {
        if (!userData.telegram_id) return null;

        const telegramId = userData.telegram_id.toString();
        
        const query = `
            INSERT INTO bot_users 
            (telegram_id, username, first_name, balance, earning_wallet, status) 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *
        `;
        
        const values = [
            telegramId,
            userData.username || '',
            userData.first_name || 'مستخدم',
            0,
            0,
            'active'
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error.message);
        return null;
    }
}

// 🔑 تسجيل دخول المسؤول - الإصدار المبسط
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔐 محاولة تسجيل دخول:', { username });
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'اسم المستخدم وكلمة المرور مطلوبان' 
            });
        }

        // تحقق مباشر من اسم المستخدم وكلمة المرور
        const isValid = username === ADMIN_USERNAME && password === ADMIN_PASSWORD;

        console.log('✅ نتيجة التحقق:', isValid);

        if (isValid) {
            const token = jwt.sign(
                { username: ADMIN_USERNAME, role: 'admin' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            res.json({
                success: true,
                token: token,
                user: { username: ADMIN_USERNAME, role: 'admin' }
            });
        } else {
            res.status(401).json({ 
                success: false,
                error: 'بيانات الدخول غير صحيحة' 
            });
        }
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({ 
            success: false,
            error: 'فشل في تسجيل الدخول: ' + error.message 
        });
    }
});

// 🔒 التحقق من توكن المسؤول
app.get('/api/admin/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        res.json({
            success: true,
            user: { username: ADMIN_USERNAME, role: 'admin' }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'فشل في التحقق' 
        });
    }
});

// 🔧 نقطة فحص السيرفر
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'السيرفر يعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// 🏠 الصفحة الرئيسية
app.get('/', async (req, res) => {
    const dbConnected = await checkDatabaseConnection();
    res.json({ 
        message: 'TON Rewards Backend - جاري التشغيل',
        status: dbConnected ? '✅ متصل بقاعدة البيانات' : '❌ خطأ في قاعدة البيانات',
        timestamp: new Date().toISOString()
    });
});

// 🔍 فحص الجداول
app.get('/api/check-tables', async (req, res) => {
    try {
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        const tableNames = tables.rows.map(row => row.table_name);
        
        res.json({
            success: true,
            tables: tableNames,
            hasBotUsers: tableNames.includes('bot_users'),
            hasWithdrawals: tableNames.includes('withdrawals'),
            hasAdHistory: tableNames.includes('ad_history')
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 🔄 إعادة إنشاء الجداول
app.get('/api/setup-database', async (req, res) => {
    try {
        // إنشاء جدول bot_users إذا مش موجود
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
                status VARCHAR(20) DEFAULT 'active',
                total_ads_watched INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إنشاء جدول withdrawals إذا مش موجود
        await pool.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                amount DECIMAL(15, 8) NOT NULL,
                wallet_address TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                method VARCHAR(100) DEFAULT 'TON Wallet',
                admin_notes TEXT,
                processed_by VARCHAR(255),
                processed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إنشاء جدول ad_history إذا مش موجود
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ad_history (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                amount DECIMAL(15, 8) NOT NULL,
                ad_type VARCHAR(50) DEFAULT 'video',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إنشاء جدول admin_logs إذا مش موجود
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                admin_username VARCHAR(255) NOT NULL,
                action VARCHAR(255) NOT NULL,
                target_user_id BIGINT,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إنشاء الفهارس
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_bot_users_telegram_id ON bot_users(telegram_id);
            CREATE INDEX IF NOT EXISTS idx_bot_users_status ON bot_users(status);
            CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
            CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
            CREATE INDEX IF NOT EXISTS idx_ad_history_user_id ON ad_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_admin_logs_username ON admin_logs(admin_username);
        `);

        res.json({
            success: true,
            message: 'تم إنشاء/تحديث الجداول والفهارس بنجاح'
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
            // جلب تاريخ الإعلانات
            const adHistory = await pool.query(
                'SELECT COUNT(*) as total_ads, COALESCE(SUM(amount), 0) as total_earned FROM ad_history WHERE user_id = $1',
                [userId]
            );

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
                    totalAdsWatched: parseInt(adHistory.rows[0].total_ads || 0),
                    status: user.status || 'active'
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
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user data' 
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
        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // التحقق من حالة المستخدم
        if (user.status !== 'active') {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب موقوف ولا يمكن مشاهدة الإعلانات' 
            });
        }

        // التحقق من الحد اليومي
        const today = new Date().toISOString().split('T')[0];
        const lastAdDate = user.last_ad_date ? new Date(user.last_ad_date).toISOString().split('T')[0] : null;
        
        if (lastAdDate !== today) {
            // إعادة تعيين العداد اليومي
            await pool.query(
                'UPDATE bot_users SET daily_ad_count = 0, last_ad_date = CURRENT_DATE WHERE telegram_id = $1',
                [userId]
            );
            user.daily_ad_count = 0;
        }

        if (user.daily_ad_count >= config.dailyAdLimit) {
            return res.status(400).json({ 
                success: false,
                error: 'لقد وصلت إلى الحد اليومي لمشاهدة الإعلانات' 
            });
        }

        const adReward = config.adValue;
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // تحديث بيانات المستخدم
            const updateResult = await client.query(
                `UPDATE bot_users SET 
                    earning_wallet = COALESCE(earning_wallet, 0) + $1,
                    total_earned = COALESCE(total_earned, 0) + $1,
                    daily_ad_count = COALESCE(daily_ad_count, 0) + 1,
                    total_ads_watched = COALESCE(total_ads_watched, 0) + 1,
                    last_ad_date = CURRENT_DATE
                 WHERE telegram_id = $2 
                 RETURNING *`,
                [adReward, userId]
            );

            // تسجيل في تاريخ الإعلانات
            await client.query(
                `INSERT INTO ad_history (user_id, amount, ad_type) 
                 VALUES ($1, $2, $3)`,
                [userId, adReward, 'video']
            );

            await client.query('COMMIT');

            const updatedUser = updateResult.rows[0];
            
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (updatedUser.daily_ad_count || 0),
                totalAds: updatedUser.total_ads_watched || 0
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Failed to process ad' 
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
        
        if (earningWallet < 0.001) {
            return res.status(400).json({ 
                success: false,
                error: 'Minimum 0.001 TON required' 
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
        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // التحقق من حالة المستخدم
        if (user.status !== 'active') {
            return res.status(403).json({ 
                success: false,
                error: 'الحساب موقوف ولا يمكن طلب السحب' 
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

        if (withdrawAmount > config.maxWithdrawal) {
            return res.status(400).json({ 
                success: false,
                error: `Maximum withdrawal is ${config.maxWithdrawal} TON` 
            });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE bot_users SET balance = balance - $1 WHERE telegram_id = $2',
                [withdrawAmount, userId]
            );

            const withdrawalResult = await client.query(
                `INSERT INTO withdrawals 
                 (user_id, amount, wallet_address, status, method) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING *`,
                [userId, withdrawAmount, walletAddress, 'pending', 'TON Wallet']
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
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed: ' + error.message 
        });
    }
});

// 📋 الحصول على تاريخ السحوبات
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
                method: w.method,
                createdAt: w.created_at
            }))
        });

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
    }
});

// 📊 لوحة تحكم المسؤول
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        // إحصائيات سريعة
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM bot_users) as total_users,
                (SELECT COUNT(*) FROM bot_users WHERE status = 'active') as active_users,
                (SELECT COUNT(*) FROM bot_users WHERE status = 'banned') as banned_users,
                (SELECT COUNT(*) FROM withdrawals) as total_withdrawals,
                (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') as pending_withdrawals,
                (SELECT COUNT(*) FROM withdrawals WHERE status = 'completed') as completed_withdrawals,
                (SELECT COALESCE(SUM(balance), 0) FROM bot_users) as total_balance,
                (SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE status = 'completed') as total_withdrawn,
                (SELECT COALESCE(SUM(total_earned), 0) FROM bot_users) as total_earned,
                (SELECT COALESCE(SUM(amount), 0) FROM ad_history) as total_ads_reward,
                (SELECT COUNT(*) FROM ad_history) as total_ads_watched
        `);

        // إحصائيات اليوم
        const todayStats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM bot_users WHERE DATE(created_at) = CURRENT_DATE) as new_users_today,
                (SELECT COUNT(*) FROM ad_history WHERE DATE(created_at) = CURRENT_DATE) as ads_today,
                (SELECT COALESCE(SUM(amount), 0) FROM ad_history WHERE DATE(created_at) = CURRENT_DATE) as ads_reward_today,
                (SELECT COUNT(*) FROM withdrawals WHERE DATE(created_at) = CURRENT_DATE) as withdrawals_today
        `);

        // آخر المستخدمين المسجلين
        const recentUsers = await pool.query(`
            SELECT telegram_id, username, first_name, balance, total_earned, total_ads_watched, created_at 
            FROM bot_users 
            ORDER BY created_at DESC 
            LIMIT 10
        `);

        // آخر طلبات السحب
        const recentWithdrawals = await pool.query(`
            SELECT 
                w.*,
                u.first_name,
                u.username
            FROM withdrawals w
            LEFT JOIN bot_users u ON w.user_id = u.telegram_id
            ORDER BY w.created_at DESC 
            LIMIT 15
        `);

        // أعلى المستخدمين رصيداً
        const topUsers = await pool.query(`
            SELECT telegram_id, username, first_name, balance, total_earned, total_ads_watched
            FROM bot_users 
            ORDER BY balance DESC 
            LIMIT 10
        `);

        const statistics = stats.rows[0];
        const today = todayStats.rows[0];

        res.json({
            success: true,
            dashboard: {
                statistics: {
                    totalUsers: parseInt(statistics.total_users),
                    activeUsers: parseInt(statistics.active_users),
                    bannedUsers: parseInt(statistics.banned_users),
                    totalWithdrawals: parseInt(statistics.total_withdrawals),
                    pendingWithdrawals: parseInt(statistics.pending_withdrawals),
                    completedWithdrawals: parseInt(statistics.completed_withdrawals),
                    totalBalance: parseFloat(statistics.total_balance),
                    totalWithdrawn: parseFloat(statistics.total_withdrawn),
                    totalEarned: parseFloat(statistics.total_earned),
                    totalAdsReward: parseFloat(statistics.total_ads_reward),
                    totalAdsWatched: parseInt(statistics.total_ads_watched)
                },
                todayStats: {
                    newUsers: parseInt(today.new_users_today),
                    adsWatched: parseInt(today.ads_today),
                    adsReward: parseFloat(today.ads_reward_today),
                    withdrawals: parseInt(today.withdrawals_today)
                },
                recentUsers: recentUsers.rows.map(u => ({
                    id: u.telegram_id,
                    username: u.username || 'لا يوجد',
                    firstName: u.first_name,
                    balance: parseFloat(u.balance),
                    totalEarned: parseFloat(u.total_earned),
                    totalAds: u.total_ads_watched || 0,
                    joinedAt: u.created_at
                })),
                recentWithdrawals: recentWithdrawals.rows.map(w => ({
                    id: w.id,
                    userId: w.user_id,
                    userName: w.first_name,
                    userUsername: w.username || 'لا يوجد',
                    amount: parseFloat(w.amount),
                    walletAddress: w.wallet_address,
                    status: w.status,
                    createdAt: w.created_at
                })),
                topUsers: topUsers.rows.map(u => ({
                    id: u.telegram_id,
                    username: u.username || 'لا يوجد',
                    firstName: u.first_name,
                    balance: parseFloat(u.balance),
                    totalEarned: parseFloat(u.total_earned),
                    totalAds: u.total_ads_watched || 0
                }))
            }
        });

    } catch (error) {
        console.error('❌ خطأ في لوحة التحكم:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load dashboard' 
        });
    }
});

// 👥 إدارة المستخدمين
app.get('/api/admin/users', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { page = 1, limit = 20, search, status } = req.query;

        let query = `
            SELECT 
                telegram_id, username, first_name, 
                balance, earning_wallet, total_earned,
                daily_ad_count, total_ads_watched, last_ad_date, 
                status, created_at
            FROM bot_users 
        `;
        let countQuery = `SELECT COUNT(*) FROM bot_users `;
        let queryParams = [];
        let conditions = [];

        if (search) {
            conditions.push(`(first_name ILIKE $${conditions.length + 1} OR username ILIKE $${conditions.length + 1} OR telegram_id::TEXT ILIKE $${conditions.length + 1})`);
            queryParams.push(`%${search}%`);
        }

        if (status && status !== 'all') {
            conditions.push(`status = $${conditions.length + 1}`);
            queryParams.push(status);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        const offset = (page - 1) * limit;
        query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(parseInt(limit), offset);

        const users = await pool.query(query, queryParams);
        const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
        const totalUsers = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            users: users.rows.map(u => ({
                id: u.telegram_id,
                username: u.username || 'لا يوجد',
                firstName: u.first_name,
                balance: parseFloat(u.balance),
                earningWallet: parseFloat(u.earning_wallet),
                totalEarned: parseFloat(u.total_earned),
                dailyAdCount: u.daily_ad_count,
                totalAdsWatched: u.total_ads_watched || 0,
                lastAdDate: u.last_ad_date,
                status: u.status || 'active',
                joinedAt: u.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalUsers: totalUsers,
                totalPages: Math.ceil(totalUsers / limit)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب المستخدمين:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get users' 
        });
    }
});

// 👤 تفاصيل مستخدم معين
app.get('/api/admin/users/:userId', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const userId = req.params.userId;

        const userResult = await pool.query(
            `SELECT * FROM bot_users WHERE telegram_id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const user = userResult.rows[0];

        // جلب تاريخ الإعلانات
        const adHistory = await pool.query(
            `SELECT * FROM ad_history 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [userId]
        );

        // جلب تاريخ السحوبات
        const withdrawalsResult = await pool.query(
            `SELECT * FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [userId]
        );

        // إحصائيات الإعلانات
        const adStats = await pool.query(
            `SELECT 
                COUNT(*) as total_ads,
                COALESCE(SUM(amount), 0) as total_earned,
                COUNT(DISTINCT DATE(created_at)) as active_days
             FROM ad_history 
             WHERE user_id = $1`,
            [userId]
        );

        res.json({
            success: true,
            user: {
                id: user.telegram_id,
                username: user.username || 'لا يوجد',
                firstName: user.first_name,
                balance: parseFloat(user.balance),
                earningWallet: parseFloat(user.earning_wallet),
                totalEarned: parseFloat(user.total_earned),
                dailyAdCount: user.daily_ad_count,
                totalAdsWatched: user.total_ads_watched || 0,
                lastAdDate: user.last_ad_date,
                status: user.status || 'active',
                joinedAt: user.created_at
            },
            adStats: {
                totalAds: parseInt(adStats.rows[0].total_ads),
                totalEarned: parseFloat(adStats.rows[0].total_earned),
                activeDays: parseInt(adStats.rows[0].active_days)
            },
            adHistory: adHistory.rows.map(ad => ({
                id: ad.id,
                amount: parseFloat(ad.amount),
                adType: ad.ad_type,
                createdAt: ad.created_at
            })),
            withdrawals: withdrawalsResult.rows.map(w => ({
                id: w.id,
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                method: w.method,
                createdAt: w.created_at
            }))
        });

    } catch (error) {
        console.error('❌ خطأ في جلب تفاصيل المستخدم:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user details' 
        });
    }
});

// ✏️ تعديل بيانات مستخدم
app.put('/api/admin/users/:userId', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { balance, earning_wallet, total_earned, status } = req.body;
        const userId = req.params.userId;

        const decoded = jwt.verify(token, JWT_SECRET);
        const adminUsername = decoded.username;

        const result = await pool.query(
            `UPDATE bot_users SET 
                balance = COALESCE($1, balance),
                earning_wallet = COALESCE($2, earning_wallet),
                total_earned = COALESCE($3, total_earned),
                status = COALESCE($4, status),
                updated_at = CURRENT_TIMESTAMP
             WHERE telegram_id = $5 
             RETURNING *`,
            [balance, earning_wallet, total_earned, status, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // تسجيل الإجراء
        await pool.query(
            `INSERT INTO admin_logs (admin_username, action, target_user_id, details) 
             VALUES ($1, $2, $3, $4)`,
            [adminUsername, 'UPDATE_USER', userId, `تم تحديث بيانات المستخدم ${userId}`]
        );

        const updatedUser = result.rows[0];

        res.json({
            success: true,
            message: 'تم تحديث بيانات المستخدم بنجاح',
            user: {
                id: updatedUser.telegram_id,
                balance: parseFloat(updatedUser.balance),
                earningWallet: parseFloat(updatedUser.earning_wallet),
                totalEarned: parseFloat(updatedUser.total_earned),
                status: updatedUser.status
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تعديل بيانات المستخدم:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update user' 
        });
    }
});

// ➕ إضافة رصيد للمستخدم
app.post('/api/admin/users/:userId/add-balance', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { amount, notes } = req.body;
        const userId = req.params.userId;

        const decoded = jwt.verify(token, JWT_SECRET);
        const adminUsername = decoded.username;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'المبلغ غير صالح' 
            });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE bot_users SET 
                    balance = COALESCE(balance, 0) + $1,
                    total_earned = COALESCE(total_earned, 0) + $1,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE telegram_id = $2 
                 RETURNING *`,
                [parseFloat(amount), userId]
            );

            if (result.rows.length === 0) {
                throw new Error('User not found');
            }

            // تسجيل الإجراء
            await client.query(
                `INSERT INTO admin_logs (admin_username, action, target_user_id, details) 
                 VALUES ($1, $2, $3, $4)`,
                [adminUsername, 'ADD_BALANCE', userId, `تم إضافة ${amount} TON للمستخدم. الملاحظات: ${notes || 'لا يوجد'}`]
            );

            await client.query('COMMIT');

            const updatedUser = result.rows[0];
            
            res.json({
                success: true,
                message: `تم إضافة ${amount} TON بنجاح`,
                user: {
                    id: updatedUser.telegram_id,
                    balance: parseFloat(updatedUser.balance),
                    totalEarned: parseFloat(updatedUser.total_earned)
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ خطأ في إضافة الرصيد:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to add balance' 
        });
    }
});

// ➖ خصم رصيد من المستخدم
app.post('/api/admin/users/:userId/deduct-balance', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { amount, notes } = req.body;
        const userId = req.params.userId;

        const decoded = jwt.verify(token, JWT_SECRET);
        const adminUsername = decoded.username;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'المبلغ غير صالح' 
            });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // التحقق من الرصيد الكافي
            const userResult = await client.query(
                'SELECT balance FROM bot_users WHERE telegram_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const currentBalance = parseFloat(userResult.rows[0].balance);
            if (currentBalance < amount) {
                throw new Error('الرصيد غير كافي للخصم');
            }

            const result = await client.query(
                `UPDATE bot_users SET 
                    balance = COALESCE(balance, 0) - $1,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE telegram_id = $2 
                 RETURNING *`,
                [parseFloat(amount), userId]
            );

            // تسجيل الإجراء
            await client.query(
                `INSERT INTO admin_logs (admin_username, action, target_user_id, details) 
                 VALUES ($1, $2, $3, $4)`,
                [adminUsername, 'DEDUCT_BALANCE', userId, `تم خصم ${amount} TON من المستخدم. الملاحظات: ${notes || 'لا يوجد'}`]
            );

            await client.query('COMMIT');

            const updatedUser = result.rows[0];
            
            res.json({
                success: true,
                message: `تم خصم ${amount} TON بنجاح`,
                user: {
                    id: updatedUser.telegram_id,
                    balance: parseFloat(updatedUser.balance)
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ خطأ في خصم الرصيد:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 🚫 حظر/فك حظر مستخدم
app.post('/api/admin/users/:userId/toggle-ban', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { reason } = req.body;
        const userId = req.params.userId;

        const decoded = jwt.verify(token, JWT_SECRET);
        const adminUsername = decoded.username;

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // جلب الحالة الحالية
            const userResult = await client.query(
                'SELECT status FROM bot_users WHERE telegram_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const currentStatus = userResult.rows[0].status;
            const newStatus = currentStatus === 'active' ? 'banned' : 'active';
            const action = newStatus === 'banned' ? 'حظر' : 'فك الحظر';

            const result = await client.query(
                `UPDATE bot_users SET 
                    status = $1,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE telegram_id = $2 
                 RETURNING *`,
                [newStatus, userId]
            );

            // تسجيل الإجراء
            await client.query(
                `INSERT INTO admin_logs (admin_username, action, target_user_id, details) 
                 VALUES ($1, $2, $3, $4)`,
                [adminUsername, 'TOGGLE_BAN', userId, `${action} المستخدم. السبب: ${reason || 'لا يوجد'}`]
            );

            await client.query('COMMIT');

            const updatedUser = result.rows[0];
            
            res.json({
                success: true,
                message: `تم ${action} المستخدم بنجاح`,
                user: {
                    id: updatedUser.telegram_id,
                    status: updatedUser.status
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ خطأ في تغيير حالة المستخدم:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 💳 إدارة طلبات السحب
app.get('/api/admin/withdrawals', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { status, page = 1, limit = 20 } = req.query;

        let query = `
            SELECT 
                w.*,
                u.first_name,
                u.username,
                u.status as user_status
            FROM withdrawals w
            LEFT JOIN bot_users u ON w.user_id = u.telegram_id
        `;
        let countQuery = `SELECT COUNT(*) FROM withdrawals w LEFT JOIN bot_users u ON w.user_id = u.telegram_id `;
        let queryParams = [];
        let conditions = [];

        if (status && status !== 'all') {
            conditions.push(`w.status = $${conditions.length + 1}`);
            queryParams.push(status);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        const offset = (page - 1) * limit;
        query += ` ORDER BY w.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(parseInt(limit), offset);

        const withdrawals = await pool.query(query, queryParams);
        const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
        const totalWithdrawals = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            withdrawals: withdrawals.rows.map(w => ({
                id: w.id,
                userId: w.user_id,
                userName: w.first_name,
                userUsername: w.username || 'لا يوجد',
                userStatus: w.user_status,
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                method: w.method,
                adminNotes: w.admin_notes,
                processedBy: w.processed_by,
                processedAt: w.processed_at,
                createdAt: w.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalWithdrawals: totalWithdrawals,
                totalPages: Math.ceil(totalWithdrawals / limit)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب طلبات السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawals' 
        });
    }
});

// ✅ تحديث حالة السحب
app.post('/api/admin/withdrawals/:withdrawalId/status', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { status, admin_notes } = req.body;
        const withdrawalId = req.params.withdrawalId;

        const decoded = jwt.verify(token, JWT_SECRET);
        const adminUsername = decoded.username;

        const allowedStatuses = ['pending', 'completed', 'rejected', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid status' 
            });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE withdrawals SET 
                    status = $1,
                    admin_notes = $2,
                    processed_by = $3,
                    processed_at = CASE WHEN $1 != 'pending' THEN CURRENT_TIMESTAMP ELSE NULL END
                 WHERE id = $4 
                 RETURNING *`,
                [status, admin_notes, adminUsername, withdrawalId]
            );

            if (result.rows.length === 0) {
                throw new Error('Withdrawal not found');
            }

            const withdrawal = result.rows[0];

            // تسجيل الإجراء
            await client.query(
                `INSERT INTO admin_logs (admin_username, action, target_user_id, details) 
                 VALUES ($1, $2, $3, $4)`,
                [adminUsername, 'UPDATE_WITHDRAWAL', withdrawal.user_id, `تم تحديث حالة السحب #${withdrawalId} إلى ${status}. الملاحظات: ${admin_notes || 'لا يوجد'}`]
            );

            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: `تم تحديث حالة السحب إلى ${status}`,
                withdrawal: {
                    id: withdrawal.id,
                    status: withdrawal.status,
                    amount: parseFloat(withdrawal.amount),
                    adminNotes: withdrawal.admin_notes,
                    processedBy: withdrawal.processed_by,
                    processedAt: withdrawal.processed_at
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ خطأ في تحديث حالة السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 📝 جلب سجل الإجراءات
app.get('/api/admin/logs', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || !validateAdminToken(token)) {
            return res.status(401).json({ 
                success: false,
                error: 'غير مصرح بالوصول' 
            });
        }

        const { page = 1, limit = 50 } = req.query;

        const offset = (page - 1) * limit;

        const logs = await pool.query(`
            SELECT * FROM admin_logs 
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2`,
            [parseInt(limit), offset]
        );

        const countResult = await pool.query('SELECT COUNT(*) FROM admin_logs');
        const totalLogs = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            logs: logs.rows.map(log => ({
                id: log.id,
                adminUsername: log.admin_username,
                action: log.action,
                targetUserId: log.target_user_id,
                details: log.details,
                createdAt: log.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalLogs: totalLogs,
                totalPages: Math.ceil(totalLogs / limit)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب السجلات:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get logs' 
        });
    }
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
    console.log(`🔐 Admin username: ${ADMIN_USERNAME}`);
    console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌐 Server URL: https://ton-rewards-backend-production-5e56.up.railway.app`);
});
