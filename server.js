const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();
app.use(cors());
app.use(express.json());

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHbzrJxIHytXdD1sNftjC8DnDz18kdvbOU";

// الاتصال بقاعدة البيانات
const pool = new Pool({
    connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
    ssl: { rejectUnauthorized: false }
});

// 🔧 الإعدادات القابلة للتعديل
let config = {
    adValue: 0.0005,
    dailyAdLimit: 10,
    minWithdrawal: 0.01,
    botName: "TON Rewards Bot",
    welcomeMessage: "مرحباً بك في بوت المكافآت! 🎁"
};

// 🔐 كلمة سر المسؤول
const ADMIN_KEY = "ywufbpntu";

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

// 🔐 التحقق من المسؤول
function validateAdmin(admin_key) {
    return admin_key === ADMIN_KEY;
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
            (telegram_id, username, first_name, balance, earning_wallet, total_ads_watched, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *
        `;
        
        const values = [
            telegramId,
            userData.username || '',
            userData.first_name || 'مستخدم',
            0,
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
            hasWithdrawals: tableNames.includes('withdrawals')
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
                total_ads_watched INTEGER DEFAULT 0,
                daily_ad_count INTEGER DEFAULT 0,
                last_ad_date DATE DEFAULT CURRENT_DATE,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP,
                admin_notes TEXT
            )
        `);

        // إنشاء جدول الإعدادات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(255) UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إنشاء جدول الإشعارات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                message TEXT NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'sent'
            )
        `);

        // إنشاء جدول إجراءات المسؤول
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_actions (
                id SERIAL PRIMARY KEY,
                admin_id VARCHAR(255) NOT NULL,
                action_type VARCHAR(255) NOT NULL,
                target_user BIGINT,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إضافة الإعدادات الافتراضية
        await pool.query(`
            INSERT INTO bot_settings (setting_key, setting_value, description) 
            VALUES 
            ('ad_value', '0.0005', 'قيمة مكافأة الإعلان'),
            ('daily_ad_limit', '10', 'الحد اليومي للإعلانات'),
            ('min_withdrawal', '0.01', 'الحد الأدنى للسحب'),
            ('bot_name', 'TON Rewards Bot', 'اسم البوت'),
            ('welcome_message', 'مرحباً بك في بوت المكافآت! 🎁', 'رسالة الترحيب')
            ON CONFLICT (setting_key) DO NOTHING
        `);

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
                    totalAdsWatched: user.total_ads_watched || 0,
                    status: user.status || 'active',
                    joinedAt: user.created_at,
                    lastActive: user.last_active
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
                error: 'User account is suspended' 
            });
        }

        // التحقق من الحد اليومي
        const today = new Date().toDateString();
        const lastAdDate = user.last_ad_date ? new Date(user.last_ad_date).toDateString() : null;
        
        let dailyAdCount = user.daily_ad_count || 0;
        
        // إعادة تعيين العداد إذا كان اليوم مختلف
        if (lastAdDate !== today) {
            dailyAdCount = 0;
        }

        if (dailyAdCount >= config.dailyAdLimit) {
            return res.status(400).json({ 
                success: false,
                error: 'Daily ad limit reached' 
            });
        }

        const adReward = config.adValue;
        
        const updateResult = await pool.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1,
                total_ads_watched = COALESCE(total_ads_watched, 0) + 1,
                daily_ad_count = $2,
                last_ad_date = CURRENT_DATE,
                last_active = CURRENT_TIMESTAMP
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
                dailyRemaining: config.dailyAdLimit - (updatedUser.daily_ad_count || 0),
                totalAds: updatedUser.total_ads_watched || 0
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Failed to process ad' 
            });
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
                earning_wallet = 0,
                last_active = CURRENT_TIMESTAMP
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
                error: 'User account is suspended' 
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

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE bot_users SET balance = balance - $1, last_active = CURRENT_TIMESTAMP WHERE telegram_id = $2',
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
                createdAt: w.created_at,
                processedAt: w.processed_at
            }))
        });

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
    }
});

// ===============================
// 📊 لوحة تحكم المسؤول - الميزات الجديدة
// ===============================

// 📊 لوحة تحكم المسؤول
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const { admin_key } = req.query;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
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
                (SELECT COALESCE(SUM(total_ads_watched), 0) FROM bot_users) as total_ads_watched,
                (SELECT COUNT(*) FROM bot_users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_users_week
        `);

        // إحصائيات الإعلانات اليومية
        const todayStats = await pool.query(`
            SELECT 
                COALESCE(SUM(daily_ad_count), 0) as today_ads,
                COUNT(*) as active_today_users
            FROM bot_users 
            WHERE last_ad_date = CURRENT_DATE
        `);

        // آخر المستخدمين المسجلين
        const recentUsers = await pool.query(`
            SELECT telegram_id, username, first_name, balance, total_ads_watched, created_at 
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

        // إحصائيات السحوبات
        const withdrawalStats = await pool.query(`
            SELECT 
                status,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM withdrawals 
            GROUP BY status
        `);

        const statistics = stats.rows[0];
        const todayData = todayStats.rows[0];

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
                    totalAdsWatched: parseInt(statistics.total_ads_watched),
                    newUsersWeek: parseInt(statistics.new_users_week),
                    todayAds: parseInt(todayData.today_ads),
                    activeTodayUsers: parseInt(todayData.active_today_users)
                },
                withdrawalStats: withdrawalStats.rows,
                recentUsers: recentUsers.rows.map(u => ({
                    id: u.telegram_id,
                    username: u.username || 'لا يوجد',
                    firstName: u.first_name,
                    balance: parseFloat(u.balance),
                    totalAdsWatched: u.total_ads_watched || 0,
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
                    totalAdsWatched: u.total_ads_watched || 0
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

// 👥 إدارة المستخدمين - النسخة المحسنة
app.get('/api/admin/users', async (req, res) => {
    try {
        const { admin_key, page = 1, limit = 20, search, status } = req.query;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        let query = `
            SELECT 
                telegram_id, username, first_name, 
                COALESCE(balance, 0) as balance, 
                COALESCE(earning_wallet, 0) as earning_wallet, 
                COALESCE(total_earned, 0) as total_earned, 
                COALESCE(total_ads_watched, 0) as total_ads_watched,
                COALESCE(daily_ad_count, 0) as daily_ad_count, 
                last_ad_date, 
                COALESCE(status, 'active') as status, 
                created_at, 
                COALESCE(last_active, created_at) as last_active
            FROM bot_users 
        `;
        
        let countQuery = `SELECT COUNT(*) FROM bot_users `;
        let queryParams = [];
        let conditions = [];

        if (search && search.trim() !== '') {
            conditions.push(`(first_name ILIKE $${queryParams.length + 1} OR username ILIKE $${queryParams.length + 1} OR telegram_id::TEXT ILIKE $${queryParams.length + 1})`);
            queryParams.push(`%${search}%`);
        }

        if (status && status !== 'all') {
            conditions.push(`COALESCE(status, 'active') = $${queryParams.length + 1}`);
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
        const countResult = await pool.query(countQuery, queryParams.slice(0, conditions.length > 0 ? queryParams.length - 2 : 0));
        const totalUsers = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            users: users.rows.map(u => ({
                id: u.telegram_id,
                username: u.username || 'لا يوجد',
                firstName: u.first_name || 'مستخدم',
                balance: parseFloat(u.balance),
                earningWallet: parseFloat(u.earning_wallet),
                totalEarned: parseFloat(u.total_earned),
                totalAdsWatched: u.total_ads_watched || 0,
                dailyAdCount: u.daily_ad_count || 0,
                lastAdDate: u.last_ad_date,
                status: u.status || 'active',
                joinedAt: u.created_at,
                lastActive: u.last_active
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
            error: 'Failed to get users: ' + error.message 
        });
    }
});

// 👤 تفاصيل مستخدم معين
app.get('/api/admin/users/:userId', async (req, res) => {
    try {
        const { admin_key } = req.query;
        const userId = req.params.userId;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

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

        const withdrawalsResult = await pool.query(
            `SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
            [userId]
        );

        // إحصائيات المستخدم
        const userStats = await pool.query(`
            SELECT 
                COUNT(*) as total_withdrawals,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_withdrawn,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_withdrawals
            FROM withdrawals 
            WHERE user_id = $1
        `, [userId]);

        const stats = userStats.rows[0];

        res.json({
            success: true,
            user: {
                id: user.telegram_id,
                username: user.username || 'لا يوجد',
                firstName: user.first_name,
                balance: parseFloat(user.balance),
                earningWallet: parseFloat(user.earning_wallet),
                totalEarned: parseFloat(user.total_earned),
                totalAdsWatched: user.total_ads_watched || 0,
                dailyAdCount: user.daily_ad_count,
                lastAdDate: user.last_ad_date,
                status: user.status,
                joinedAt: user.created_at,
                lastActive: user.last_active
            },
            stats: {
                totalWithdrawals: parseInt(stats.total_withdrawals),
                totalWithdrawn: parseFloat(stats.total_withdrawn),
                pendingWithdrawals: parseFloat(stats.pending_withdrawals)
            },
            withdrawals: withdrawalsResult.rows.map(w => ({
                id: w.id,
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                method: w.method,
                createdAt: w.created_at,
                processedAt: w.processed_at
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
        const { admin_key, balance, earning_wallet, total_earned, status } = req.body;
        const userId = req.params.userId;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const result = await pool.query(
            `UPDATE bot_users SET 
                balance = COALESCE($1, balance),
                earning_wallet = COALESCE($2, earning_wallet),
                total_earned = COALESCE($3, total_earned),
                status = COALESCE($4, status)
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

// ➕ إضافة رصيد لمستخدم
app.post('/api/admin/users/:userId/add-balance', async (req, res) => {
    try {
        const { admin_key, amount, note } = req.body;
        const userId = req.params.userId;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const addAmount = parseFloat(amount);
        if (isNaN(addAmount) || addAmount <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid amount' 
            });
        }

        const result = await pool.query(
            `UPDATE bot_users SET 
                balance = COALESCE(balance, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1
             WHERE telegram_id = $2 
             RETURNING *`,
            [addAmount, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const updatedUser = result.rows[0];

        // تسجيل العملية في السجل
        await pool.query(
            `INSERT INTO admin_actions (admin_id, action_type, target_user, details) 
             VALUES ($1, $2, $3, $4)`,
            ['admin', 'add_balance', userId, `Added ${addAmount} TON to user balance. Note: ${note || 'No note'}`]
        );

        res.json({
            success: true,
            message: `تم إضافة ${addAmount} TON إلى رصيد المستخدم بنجاح`,
            user: {
                id: updatedUser.telegram_id,
                balance: parseFloat(updatedUser.balance),
                totalEarned: parseFloat(updatedUser.total_earned)
            }
        });

    } catch (error) {
        console.error('❌ خطأ في إضافة الرصيد:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to add balance' 
        });
    }
});

// 🚫 حظر/فك حظر مستخدم
app.post('/api/admin/users/:userId/ban', async (req, res) => {
    try {
        const { admin_key, reason } = req.body;
        const userId = req.params.userId;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const newStatus = user.status === 'banned' ? 'active' : 'banned';
        const action = newStatus === 'banned' ? 'حظر' : 'فك الحظر';

        const result = await pool.query(
            `UPDATE bot_users SET status = $1 WHERE telegram_id = $2 RETURNING *`,
            [newStatus, userId]
        );

        // تسجيل العملية
        await pool.query(
            `INSERT INTO admin_actions (admin_id, action_type, target_user, details) 
             VALUES ($1, $2, $3, $4)`,
            ['admin', 'user_ban', userId, `${action} user. Reason: ${reason || 'No reason provided'}`]
        );

        res.json({
            success: true,
            message: `تم ${action} المستخدم بنجاح`,
            user: {
                id: result.rows[0].telegram_id,
                status: result.rows[0].status
            }
        });

    } catch (error) {
        console.error('❌ خطأ في حظر المستخدم:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to ban user' 
        });
    }
});

// 💳 إدارة طلبات السحب
app.get('/api/admin/withdrawals', async (req, res) => {
    try {
        const { admin_key, status } = req.query;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        let query = `
            SELECT 
                w.*,
                u.first_name,
                u.username,
                u.telegram_id
            FROM withdrawals w
            LEFT JOIN bot_users u ON w.user_id = u.telegram_id
        `;

        let queryParams = [];
        
        if (status && status !== 'all') {
            query += ` WHERE w.status = $1`;
            queryParams.push(status);
        }

        query += ` ORDER BY w.created_at DESC`;

        const withdrawals = await pool.query(query, queryParams);

        res.json({
            success: true,
            withdrawals: withdrawals.rows.map(w => ({
                id: w.id,
                userId: w.user_id,
                userTelegramId: w.telegram_id,
                userName: w.first_name,
                userUsername: w.username || 'لا يوجد',
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                method: w.method,
                createdAt: w.created_at,
                processedAt: w.processed_at,
                adminNotes: w.admin_notes
            }))
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
        const { admin_key, status, notes } = req.body;
        const withdrawalId = req.params.withdrawalId;

        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const allowedStatuses = ['pending', 'completed', 'rejected', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid status' 
            });
        }

        const result = await pool.query(
            `UPDATE withdrawals SET 
                status = $1, 
                processed_at = CASE WHEN $1 != 'pending' THEN CURRENT_TIMESTAMP ELSE processed_at END,
                admin_notes = COALESCE($2, admin_notes)
             WHERE id = $3 RETURNING *`,
            [status, notes, withdrawalId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Withdrawal not found' 
            });
        }

        const withdrawal = result.rows[0];
        
        res.json({
            success: true,
            message: `تم تحديث حالة السحب إلى ${status}`,
            withdrawal: {
                id: withdrawal.id,
                status: withdrawal.status,
                amount: parseFloat(withdrawal.amount),
                processedAt: withdrawal.processed_at
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث حالة السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update withdrawal status' 
        });
    }
});

// ⚙️ الحصول على إعدادات البوت
app.get('/api/admin/settings', async (req, res) => {
    try {
        const { admin_key } = req.query;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const settings = await pool.query(`
            SELECT setting_key, setting_value, description 
            FROM bot_settings 
            ORDER BY setting_key
        `);

        const settingsObj = {};
        settings.rows.forEach(setting => {
            settingsObj[setting.setting_key] = {
                value: setting.setting_value,
                description: setting.description
            };
        });

        res.json({
            success: true,
            settings: settingsObj
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الإعدادات:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get settings' 
        });
    }
});

// ⚙️ تحديث إعدادات البوت
app.post('/api/admin/settings', async (req, res) => {
    try {
        const { admin_key, settings } = req.body;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            for (const [key, value] of Object.entries(settings)) {
                await client.query(`
                    INSERT INTO bot_settings (setting_key, setting_value, updated_at) 
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (setting_key) 
                    DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
                `, [key, value.toString()]);
            }

            await client.query('COMMIT');

            // تحديث الإعدادات في الذاكرة
            const newSettings = await client.query('SELECT setting_key, setting_value FROM bot_settings');
            newSettings.rows.forEach(setting => {
                if (config.hasOwnProperty(setting.setting_key)) {
                    // تحويل القيم الرقمية
                    if (['adValue', 'minWithdrawal'].includes(setting.setting_key)) {
                        config[setting.setting_key] = parseFloat(setting.setting_value);
                    } else if (setting.setting_key === 'dailyAdLimit') {
                        config[setting.setting_key] = parseInt(setting.setting_value);
                    } else {
                        config[setting.setting_key] = setting.setting_value;
                    }
                }
            });

            res.json({
                success: true,
                message: 'تم تحديث الإعدادات بنجاح',
                config: config
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ خطأ في تحديث الإعدادات:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update settings' 
        });
    }
});

// 📨 إرسال رسالة للمستخدمين - النسخة المحسنة
app.post('/api/admin/broadcast', async (req, res) => {
    try {
        const { admin_key, message, target, user_id } = req.body;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        if (!message || message.trim() === '') {
            return res.status(400).json({ 
                success: false,
                error: 'Message is required' 
            });
        }

        let users = [];
        
        if (target === 'all') {
            const result = await pool.query('SELECT telegram_id FROM bot_users WHERE status = $1', ['active']);
            users = result.rows;
        } else if (target === 'specific' && user_id) {
            const user = await getUserFromDB(user_id);
            if (user) {
                users = [{ telegram_id: user_id }];
            } else {
                return res.status(404).json({ 
                    success: false,
                    error: 'User not found' 
                });
            }
        } else {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid target' 
            });
        }

        // تخزين الإشعارات في قاعدة البيانات
        for (const user of users) {
            await pool.query(
                `INSERT INTO notifications (user_id, message, sent_at) 
                 VALUES ($1, $2, CURRENT_TIMESTAMP)`,
                [user.telegram_id, message]
            );
        }

        // تسجيل عملية البث
        await pool.query(
            `INSERT INTO admin_actions (admin_id, action_type, details) 
             VALUES ($1, $2, $3)`,
            ['admin', 'broadcast', `Sent message to ${users.length} users: ${message.substring(0, 100)}...`]
        );

        res.json({
            success: true,
            message: `تم إرسال الرسالة إلى ${users.length} مستخدم`,
            usersCount: users.length
        });

    } catch (error) {
        console.error('❌ خطأ في إرسال الرسالة:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to send message: ' + error.message 
        });
    }
});

// 📈 إحصائيات متقدمة
app.get('/api/admin/analytics', async (req, res) => {
    try {
        const { admin_key, period = '7' } = req.query;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const days = parseInt(period);

        // إحصائيات المستخدمين الجدد
        const newUsersStats = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as new_users
            FROM bot_users 
            WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
            GROUP BY DATE(created_at)
            ORDER BY date
        `);

        // إحصائيات الإعلانات
        const adsStats = await pool.query(`
            SELECT 
                DATE(last_ad_date) as date,
                SUM(daily_ad_count) as ads_watched
            FROM bot_users 
            WHERE last_ad_date >= CURRENT_DATE - INTERVAL '${days} days'
            GROUP BY DATE(last_ad_date)
            ORDER BY date
        `);

        // إحصائيات السحوبات
        const withdrawalStats = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as withdrawal_count,
                COALESCE(SUM(amount), 0) as withdrawal_amount
            FROM withdrawals 
            WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
            GROUP BY DATE(created_at)
            ORDER BY date
        `);

        res.json({
            success: true,
            analytics: {
                period: days,
                newUsers: newUsersStats.rows,
                adsWatched: adsStats.rows,
                withdrawals: withdrawalStats.rows
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get analytics' 
        });
    }
});

// 🔧 إصلاح قاعدة البيانات
app.get('/api/fix-database', async (req, res) => {
    try {
        // إضافة الأعمدة الناقصة لجدول bot_users
        await pool.query(`
            DO $$ 
            BEGIN
                -- إضافة العمود إذا لم يكن موجوداً
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='bot_users' AND column_name='total_ads_watched') THEN
                    ALTER TABLE bot_users ADD COLUMN total_ads_watched INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='bot_users' AND column_name='status') THEN
                    ALTER TABLE bot_users ADD COLUMN status VARCHAR(50) DEFAULT 'active';
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='bot_users' AND column_name='last_active') THEN
                    ALTER TABLE bot_users ADD COLUMN last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;
            END $$;
        `);

        res.json({
            success: true,
            message: 'تم إصلاح قاعدة البيانات بنجاح'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔄 تحميل الإعدادات من قاعدة البيانات عند بدء التشغيل
async function loadSettingsFromDB() {
    try {
        const settings = await pool.query('SELECT setting_key, setting_value FROM bot_settings');
        
        settings.rows.forEach(setting => {
            if (config.hasOwnProperty(setting.setting_key)) {
                // تحويل القيم الرقمية
                if (['adValue', 'minWithdrawal'].includes(setting.setting_key)) {
                    config[setting.setting_key] = parseFloat(setting.setting_value);
                } else if (setting.setting_key === 'dailyAdLimit') {
                    config[setting.setting_key] = parseInt(setting.setting_value);
                } else {
                    config[setting.setting_key] = setting.setting_value;
                }
            }
        });
        
        console.log('✅ تم تحميل الإعدادات من قاعدة البيانات');
    } catch (error) {
        console.error('❌ خطأ في تحميل الإعدادات:', error.message);
    }
}

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// تحميل الإعدادات قبل بدء التشغيل
loadSettingsFromDB().then(() => {
    app.listen(PORT, HOST, () => {
        console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
        console.log(`💰 Ad reward: ${config.adValue} TON`);
        console.log(`📺 Daily ad limit: ${config.dailyAdLimit}`);
        console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
        console.log(`🤖 Bot name: ${config.botName}`);
        console.log(`🔐 Admin key: ${ADMIN_KEY}`);
        console.log(`🔄 Loaded settings from database`);
    });
});
