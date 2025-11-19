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
    dailyAdLimit: 10,
    referralBonus: 0.001
};

// 🔐 التحقق من توقيع تليجرام
function validateTelegramInitData(initData) {
    try {
        console.log('🔐 Validating initData...');
        
        if (!initData) {
            console.log('❌ No initData provided');
            return false;
        }

        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        
        console.log('📦 Hash exists:', !!hash);
        console.log('👤 User data exists:', !!urlParams.get('user'));

        if (!hash) {
            console.log('❌ No hash in initData');
            return false;
        }

        const dataToCheck = [];
        urlParams.forEach((val, key) => {
            if (key !== 'hash') dataToCheck.push(`${key}=${val}`);
        });
        
        dataToCheck.sort();
        const dataCheckString = dataToCheck.join('\n');
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN).digest();
        
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString).digest('hex');

        console.log('🔢 Hashes match:', calculatedHash === hash);
        return calculatedHash === hash;
    } catch (error) {
        console.error('❌ Validation error:', error);
        return false;
    }
}

// 👤 استخراج بيانات المستخدم
function parseTelegramUser(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const userStr = urlParams.get('user');
        return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
        console.error('Error parsing Telegram user:', error);
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
        console.error('Error getting user from DB:', error);
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
                userData.username,
                userData.first_name,
                userData.balance || 0,
                userData.earning_wallet || 0
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error creating user in DB:', error);
        return null;
    }
}

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({ 
        message: 'TON Rewards Backend - Secure Mode',
        status: '✅ Connected to Database',
        security: '🔐 Telegram Verification ENABLED'
    });
});

// 👤 جلب بيانات المستخدم من قاعدة البيانات
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;
        
        console.log(`📥 GET User Request: ${userId}`);
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
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
                    totalEarned: parseFloat(user.total_earned || 0),
                    joinDate: user.created_at
                }
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// 👤 تسجيل مستخدم جديد في قاعدة البيانات
app.post('/api/register', async (req, res) => {
    try {
        const { initData, referralCode } = req.body;
        
        console.log('📥 Register Request received');
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();
        
        // التحقق إذا المستخدم موجود في قاعدة البيانات
        let user = await getUserFromDB(userId);
        
        if (user) {
            console.log(`✅ User ${userId} already exists`);
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

        // إنشاء مستخدم جديد في قاعدة البيانات
        const newUser = {
            telegram_id: userId,
            username: telegramUser.username || '',
            first_name: telegramUser.first_name || 'User',
            balance: 0,
            earning_wallet: 0
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
                    balance: parseFloat(user.balance),
                    earningWallet: parseFloat(user.earning_wallet),
                    dailyAdCount: user.daily_ad_count || 0,
                    totalEarned: parseFloat(user.total_earned || 0)
                }
            });
        } else {
            res.status(500).json({ error: 'Failed to create user' });
        }

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// 📺 مشاهدة إعلان وحفظ في قاعدة البيانات
app.post('/api/watch-ad', async (req, res) => {
    try {
        const { initData } = req.body;
        
        console.log('📥 Watch Ad Request received');
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();
        
        // جلب المستخدم من قاعدة البيانات
        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // التحقق من الحد اليومي
        const today = new Date().toISOString().split('T')[0];
        if (user.last_ad_date === today && user.daily_ad_count >= config.dailyAdLimit) {
            return res.status(400).json({ error: 'Daily ad limit reached' });
        }

        // تحديث البيانات في قاعدة البيانات
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
            console.log(`✅ Ad watched by user ${userId}, earned: ${adReward} TON`);
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet),
                dailyRemaining: config.dailyAdLimit - (updatedUser.daily_ad_count || 0),
                totalEarned: parseFloat(updatedUser.total_earned || 0)
            });
        } else {
            res.status(500).json({ error: 'Failed to process ad' });
        }

    } catch (error) {
        console.error('Watch ad error:', error);
        res.status(500).json({ error: 'Failed to process ad' });
    }
});

// 💰 تحويل المحفظة إلى الرصيد
app.post('/api/move-to-balance', async (req, res) => {
    try {
        const { initData } = req.body;
        
        console.log('📥 Move to Balance Request received');
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();
        const user = await getUserFromDB(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const earningWallet = parseFloat(user.earning_wallet || 0);
        if (earningWallet < 0.001) {
            return res.status(400).json({ error: 'Minimum 0.001 TON required' });
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
            console.log(`✅ Balance moved for user ${userId}, amount: ${earningWallet} TON`);
            res.json({
                success: true,
                newBalance: parseFloat(updatedUser.balance),
                earningWallet: 0
            });
        } else {
            res.status(500).json({ error: 'Transfer failed' });
        }

    } catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({ error: 'Transfer failed' });
    }
});

// 💸 سحب رصيد وحفظ في قاعدة البيانات
app.post('/api/withdraw', async (req, res) => {
    try {
        const { initData, amount, walletAddress, method } = req.body;
        
        console.log('📥 Withdraw Request received');
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();
        const user = await getUserFromDB(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userBalance = parseFloat(user.balance || 0);
        if (userBalance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        if (amount < 0.01) {
            return res.status(400).json({ error: 'Minimum withdrawal is 0.01 TON' });
        }

        // خصم المبلغ من الرصيد في قاعدة البيانات
        const updateResult = await pool.query(
            'UPDATE bot_users SET balance = COALESCE(balance, 0) - $1 WHERE telegram_id = $2 RETURNING *',
            [amount, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            // حفظ طلب السحب في قاعدة البيانات
            await pool.query(
                'INSERT INTO withdrawals (user_id, amount, wallet_address, method, status) VALUES ($1, $2, $3, $4, $5)',
                [userId, amount, walletAddress, method, 'pending']
            );

            console.log(`✅ Withdrawal request submitted for user ${userId}, amount: ${amount} TON`);
            res.json({
                success: true,
                message: 'Withdrawal request submitted successfully',
                newBalance: parseFloat(updatedUser.balance)
            });
        } else {
            res.status(500).json({ error: 'Withdrawal failed' });
        }

    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

// 🔧 endpoint للتست
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Backend is working with Telegram verification',
        timestamp: new Date().toISOString()
    });
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🛡️ TON Rewards Backend running on port ${PORT}`);
    console.log(`✅ Connected to PostgreSQL - bot_users table`);
    console.log(`🔐 Security: Telegram signature verification ENABLED`);
    console.log(`💰 Ad reward: ${config.adValue} TON per ad`);
});
