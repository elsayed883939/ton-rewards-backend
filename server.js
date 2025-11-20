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

const config = {
    adValue: 0.0005,
    dailyAdLimit: 10,
    minWithdrawal: 0.01
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
            (telegram_id, username, first_name, balance, earning_wallet) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING *
        `;
        
        const values = [
            telegramId,
            userData.username || '',
            userData.first_name || 'مستخدم',
            0,
            0
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
                daily_ad_count INTEGER DEFAULT 0,
                last_ad_date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
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

        const adReward = config.adValue;
        
        const updateResult = await pool.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1,
                daily_ad_count = COALESCE(daily_ad_count, 0) + 1,
                last_ad_date = CURRENT_DATE
             WHERE telegram_id = $2 
             RETURNING *`,
            [adReward, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (updatedUser.daily_ad_count || 0)
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
                (SELECT COUNT(*) FROM withdrawals) as total_withdrawals,
                (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') as pending_withdrawals,
                (SELECT COALESCE(SUM(balance), 0) FROM bot_users) as total_balance,
                (SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE status = 'completed') as total_withdrawn,
                (SELECT COALESCE(SUM(total_earned), 0) FROM bot_users) as total_earned
        `);

        // آخر المستخدمين المسجلين
        const recentUsers = await pool.query(`
            SELECT telegram_id, username, first_name, balance, created_at 
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
            SELECT telegram_id, username, first_name, balance, total_earned
            FROM bot_users 
            ORDER BY balance DESC 
            LIMIT 10
        `);

        const statistics = stats.rows[0];

        res.json({
            success: true,
            dashboard: {
                statistics: {
                    totalUsers: parseInt(statistics.total_users),
                    totalWithdrawals: parseInt(statistics.total_withdrawals),
                    pendingWithdrawals: parseInt(statistics.pending_withdrawals),
                    totalBalance: parseFloat(statistics.total_balance),
                    totalWithdrawn: parseFloat(statistics.total_withdrawn),
                    totalEarned: parseFloat(statistics.total_earned)
                },
                recentUsers: recentUsers.rows.map(u => ({
                    id: u.telegram_id,
                    username: u.username || 'لا يوجد',
                    firstName: u.first_name,
                    balance: parseFloat(u.balance),
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
                    totalEarned: parseFloat(u.total_earned)
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
        const { admin_key, page = 1, limit = 20, search } = req.query;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        let query = `
            SELECT 
                telegram_id, username, first_name, 
                balance, earning_wallet, total_earned,
                daily_ad_count, last_ad_date, created_at
            FROM bot_users 
        `;
        let countQuery = `SELECT COUNT(*) FROM bot_users `;
        let queryParams = [];

        if (search) {
            query += ` WHERE first_name ILIKE $1 OR username ILIKE $1 OR telegram_id::TEXT ILIKE $1 `;
            countQuery += ` WHERE first_name ILIKE $1 OR username ILIKE $1 OR telegram_id::TEXT ILIKE $1 `;
            queryParams.push(`%${search}%`);
        }

        const offset = (page - 1) * limit;
        query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(limit, offset);

        const users = await pool.query(query, queryParams);
        const countResult = await pool.query(countQuery, search ? [queryParams[0]] : []);
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
                lastAdDate: u.last_ad_date,
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
                lastAdDate: user.last_ad_date,
                joinedAt: user.created_at
            },
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
        const { admin_key, balance, earning_wallet, total_earned } = req.body;
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
                total_earned = COALESCE($3, total_earned)
             WHERE telegram_id = $4 
             RETURNING *`,
            [balance, earning_wallet, total_earned, userId]
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
                totalEarned: parseFloat(updatedUser.total_earned)
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

// 💳 إدارة طلبات السحب
app.get('/api/admin/withdrawals', async (req, res) => {
    try {
        const { admin_key } = req.query;
        
        if (!validateAdmin(admin_key)) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized' 
            });
        }

        const withdrawals = await pool.query(`
            SELECT 
                w.*,
                u.first_name,
                u.username
            FROM withdrawals w
            LEFT JOIN bot_users u ON w.user_id = u.telegram_id
            ORDER BY w.created_at DESC
        `);

        res.json({
            success: true,
            withdrawals: withdrawals.rows.map(w => ({
                id: w.id,
                userId: w.user_id,
                userName: w.first_name,
                userUsername: w.username || 'لا يوجد',
                amount: parseFloat(w.amount),
                walletAddress: w.wallet_address,
                status: w.status,
                method: w.method,
                createdAt: w.created_at
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
        const { admin_key, status } = req.body;
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
            `UPDATE withdrawals SET status = $1 WHERE id = $2 RETURNING *`,
            [status, withdrawalId]
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
                amount: parseFloat(withdrawal.amount)
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

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
    console.log(`🔐 Admin key: ${ADMIN_KEY}`);
});
