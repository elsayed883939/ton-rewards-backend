const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = "8371336266:AAGeJ6iozisWnkkCmoTsPDt8RYoOgkvhroY";

// الاتصال بقاعدة البيانات PostgreSQL
const pool = new Pool({
    connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
    ssl: { rejectUnauthorized: false }
});

// ⚙️ إعدادات التطبيق
const config = {
    adValue: 0.0005,
    dailyAdLimit: 10
};

// 🔐 التحقق من توقيع تليجرام - معدل نهائي
function validateTelegramInitData(initData) {
    try {
        if (!initData || initData.length < 10) {
            console.log('❌ Invalid initData');
            return false;
        }

        // تنظيف initData
        const cleanInitData = initData.trim().replace(/\+/g, ' ');
        const urlParams = new URLSearchParams(cleanInitData);
        const hash = urlParams.get('hash');
        
        if (!hash) {
            console.log('❌ No hash found');
            return false;
        }

        const dataToCheck = [];
        urlParams.forEach((val, key) => {
            if (key !== 'hash') {
                dataToCheck.push(`${key}=${val}`);
            }
        });
        
        dataToCheck.sort();
        const dataCheckString = dataToCheck.join('\n');
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN).digest();
        
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString).digest('hex');

        return calculatedHash === hash;
    } catch (error) {
        console.error('❌ Validation error:', error.message);
        return false;
    }
}

// 👤 استخراج بيانات المستخدم
function parseTelegramUser(initData) {
    try {
        const cleanInitData = initData.trim().replace(/\+/g, ' ');
        const urlParams = new URLSearchParams(cleanInitData);
        const userStr = urlParams.get('user');
        
        if (!userStr) return null;
        
        const user = JSON.parse(decodeURIComponent(userStr));
        return user && user.id ? user : null;
    } catch (error) {
        console.error('Error parsing user:', error.message);
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
        console.error('Database error:', error.message);
        return null;
    }
}

// ➕ إنشاء مستخدم جديد في قاعدة البيانات
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
                userData.first_name || 'User',
                0,
                0
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Create user error:', error.message);
        return null;
    }
}

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({ 
        message: 'TON Rewards Backend - RUNNING',
        status: '✅ Active',
        timestamp: new Date().toISOString()
    });
});

// 👤 جلب بيانات المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { initData } = req.query;

        console.log(`📥 GET User: ${userId}`);

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
        console.error('Get user error:', error.message);
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

        console.log('📥 Register request');

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
        
        // التحقق إذا المستخدم موجود
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

        // إنشاء مستخدم جديد
        const newUser = {
            telegram_id: userId,
            username: telegramUser.username,
            first_name: telegramUser.first_name
        };

        user = await createUserInDB(newUser);
        
        if (user) {
            console.log(`✅ New user created: ${userId}`);
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
        console.error('Registration error:', error.message);
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

        console.log('📥 Watch ad request');

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
        
        // جلب المستخدم
        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // التحقق من الحد اليومي
        const today = new Date().toISOString().split('T')[0];
        if (user.last_ad_date === today && user.daily_ad_count >= config.dailyAdLimit) {
            return res.status(400).json({ 
                success: false,
                error: 'Daily ad limit reached' 
            });
        }

        // تحديث البيانات
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
            console.log(`✅ Ad watched: ${userId} earned ${adReward} TON`);
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
        console.error('Watch ad error:', error.message);
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

        console.log('📥 Move to balance request');

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
            console.log(`✅ Balance moved: ${userId} - ${earningWallet} TON`);
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
        console.error('Transfer error:', error.message);
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

        console.log('📥 Withdraw request');

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

        // خصم المبلغ
        const updateResult = await pool.query(
            'UPDATE bot_users SET balance = COALESCE(balance, 0) - $1 WHERE telegram_id = $2 RETURNING *',
            [amount, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            // حفظ طلب السحب
            await pool.query(
                'INSERT INTO withdrawals (user_id, amount, wallet_address, method, status) VALUES ($1, $2, $3, $4, $5)',
                [userId, amount, walletAddress, method, 'pending']
            );

            console.log(`✅ Withdrawal submitted: ${userId} - ${amount} TON`);
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
        console.error('Withdrawal error:', error.message);
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
    console.log(`🔗 http://localhost:${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
});
