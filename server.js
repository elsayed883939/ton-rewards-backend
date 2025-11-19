const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = "8257278435:AAHbzrJxIHytXdD1sNftjC8DnDz18kdvbOU";

// الاتصال بقاعدة البيانات
const pool = new Pool({
    connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
    ssl: { rejectUnauthorized: false }
});

const config = {
    adValue: 0.0005,
    dailyAdLimit: 10
};

// 🔐 التحقق من توقيع تليجرام - الإصدار المضبوط
function validateTelegramInitData(initData) {
    try {
        console.log('=== بدء التحقق من التوقيع ===');
        
        if (!initData) {
            console.log('❌ initData غير موجود');
            return false;
        }

        console.log('📦 initData المستلم:', initData);

        // نستخدم querystring علشان ن parse البيانات بشكل صحيح
        const parsedData = querystring.parse(initData);
        const hash = parsedData.hash;
        
        console.log('🔑 الهاش المستلم:', hash);

        if (!hash) {
            console.log('❌ لا يوجد هاش في initData');
            return false;
        }

        // بناء البيانات للتحقق - بدون الهاش
        const dataToCheck = [];
        for (const [key, value] of Object.entries(parsedData)) {
            if (key !== 'hash' && value) {
                dataToCheck.push(`${key}=${value}`);
            }
        }
        
        // ترتيب البيانات أبجدياً
        dataToCheck.sort();
        const dataCheckString = dataToCheck.join('\n');
        
        console.log('📋 البيانات للتحقق:', dataCheckString);

        // إنشاء المفتاح السري
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        // حساب الهاش
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        console.log('🔢 الهاش المحسوب:', calculatedHash);
        console.log('🔢 الهاش المستلم:', hash);
        console.log('✅ التطابق:', calculatedHash === hash ? 'ناجح' : 'فاشل');
        
        return calculatedHash === hash;
    } catch (error) {
        console.error('❌ خطأ في التحقق:', error);
        return false;
    }
}

// 👤 استخراج بيانات المستخدم
function parseTelegramUser(initData) {
    try {
        const parsedData = querystring.parse(initData);
        const userStr = parsedData.user;
        
        if (!userStr) {
            return null;
        }
        
        // فك تشفير JSON
        const user = JSON.parse(decodeURIComponent(userStr));
        return user && user.id ? user : null;
    } catch (error) {
        console.error('خطأ في تحليل المستخدم:', error);
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
        return result.rows[0];
    } catch (error) {
        return null;
    }
}

// ➕ إنشاء مستخدم جديد
async function createUserInDB(userData) {
    try {
        const result = await pool.query(
            `INSERT INTO bot_users 
             (telegram_id, username, first_name, balance, earning_wallet) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [
                userData.telegram_id,
                userData.username || '',
                userData.first_name || 'مستخدم',
                0,
                0
            ]
        );
        return result.rows[0];
    } catch (error) {
        return null;
    }
}

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({ 
        message: 'TON Rewards Backend - جاري التشغيل',
        status: '✅ نشط'
    });
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

        const user = await getUserFromDB(userId);
        
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
            res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Server error' 
        });
    }
});

// 👤 تسجيل مستخدم جديد
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
            username: telegramUser.username,
            first_name: telegramUser.first_name
        };

        user = await createUserInDB(newUser);
        
        if (user) {
            res.json({ 
                success: true, 
                user: {
                    id: user.telegram_id,
                    firstName: user.first_name,
                    username: user.username,
                    balance: 0,
                    earningWallet: 0,
                    dailyAdCount: 0,
                    totalEarned: 0
                }
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Failed to create user' 
            });
        }
    } catch (error) {
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
        const user = await getUserFromDB(userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const today = new Date().toISOString().split('T')[0];
        if (user.last_ad_date === today && user.daily_ad_count >= config.dailyAdLimit) {
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
                daily_ad_count = CASE 
                    WHEN last_ad_date = $2 THEN COALESCE(daily_ad_count, 0) + 1 
                    ELSE 1 
                END,
                last_ad_date = $2
             WHERE telegram_id = $3 
             RETURNING *`,
            [adReward, today, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (updatedUser.daily_ad_count || 0),
                totalEarned: parseFloat(updatedUser.total_earned || 0)
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
            error: 'Server error' 
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
            error: 'Server error' 
        });
    }
});

// 💸 سحب رصيد
app.post('/api/withdraw', async (req, res) => {
    try {
        const { initData, amount, walletAddress, method = 'TON Wallet' } = req.body;

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
        if (userBalance < amount) {
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance' 
            });
        }

        if (amount < 0.01) {
            return res.status(400).json({ 
                success: false,
                error: 'Minimum withdrawal is 0.01 TON' 
            });
        }

        if (!walletAddress) {
            return res.status(400).json({ 
                success: false,
                error: 'Wallet address required' 
            });
        }

        const updateResult = await pool.query(
            'UPDATE bot_users SET balance = COALESCE(balance, 0) - $1 WHERE telegram_id = $2 RETURNING *',
            [amount, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            await pool.query(
                'INSERT INTO withdrawals (user_id, amount, wallet_address, method, status) VALUES ($1, $2, $3, $4, $5)',
                [userId, amount, walletAddress, method, 'pending']
            );

            res.json({
                success: true,
                message: 'Withdrawal request submitted successfully',
                newBalance: parseFloat(updatedUser.balance || 0)
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Withdrawal failed' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'Server error' 
        });
    }
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
});
