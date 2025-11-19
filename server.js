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

// 🔐 التحقق من توقيع تليجرام - الإصدار النهائي
function validateTelegramInitData(initData) {
    try {
        console.log('🔐 بدء التحقق من التوقيع...');
        
        if (!initData) {
            console.log('❌ initData غير موجود');
            return false;
        }

        // فك تشفير URL
        const decodedInitData = decodeURIComponent(initData);
        console.log('📦 initData بعد فك التشفير:', decodedInitData);

        const urlParams = new URLSearchParams(decodedInitData);
        const hash = urlParams.get('hash');
        
        console.log('🔑 الهاش المستلم:', hash);
        console.log('📊 معلمات initData:');
        urlParams.forEach((value, key) => {
            if (key !== 'hash') {
                console.log(`   ${key} = ${value}`);
            }
        });

        if (!hash) {
            console.log('❌ لا يوجد هاش في initData');
            return false;
        }

        // بناء البيانات للتحقق - بالطريقة الصحيحة
        const dataToCheck = [];
        urlParams.forEach((value, key) => {
            if (key !== 'hash') {
                // نستخدم القيمة كما هي بدون تعديل
                dataToCheck.push(`${key}=${value}`);
            }
        });
        
        // ترتيب البيانات أبجدياً
        dataToCheck.sort();
        const dataCheckString = dataToCheck.join('\n');
        
        console.log('📋 البيانات المُرتبة للتحقق:');
        console.log(dataCheckString);

        // إنشاء المفتاح السري - بالطريقة الصحيحة
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        // حساب الهاش - بالطريقة الصحيحة
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        console.log('🔢 الهاش المحسوب:', calculatedHash);
        console.log('🔢 الهاش المستلم:', hash);
        
        const isValid = calculatedHash === hash;
        console.log('✅ نتيجة التحقق:', isValid ? 'صحيح' : 'خاطئ');
        
        if (!isValid) {
            console.log('❌ الأسباب المحتملة:');
            console.log('   - BOT_TOKEN غير صحيح');
            console.log('   - البيانات غير مرتبة بشكل صحيح');
            console.log('   - مشكلة في ترميز البيانات');
        }
        
        return isValid;
    } catch (error) {
        console.error('❌ خطأ في التحقق:', error.message);
        return false;
    }
}

// 👤 استخراج بيانات المستخدم
function parseTelegramUser(initData) {
    try {
        const decodedInitData = decodeURIComponent(initData);
        const urlParams = new URLSearchParams(decodedInitData);
        const userStr = urlParams.get('user');
        
        if (!userStr) {
            console.log('❌ لا توجد بيانات مستخدم');
            return null;
        }
        
        const user = JSON.parse(userStr);
        console.log('👤 بيانات المستخدم المُستخرجة:', user);
        
        return user && user.id ? user : null;
    } catch (error) {
        console.error('❌ خطأ في تحليل بيانات المستخدم:', error.message);
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
        console.error('❌ خطأ في جلب المستخدم من DB:', error.message);
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
                userData.first_name || 'مستخدم',
                0,
                0
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error.message);
        return null;
    }
}

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({ 
        message: 'TON Rewards Backend - التشغيل',
        status: '✅ متصل بقاعدة البيانات',
        security: '🔐 التحقق من تليجرام مفعل'
    });
});

// 🔧 إضافة endpoint للتست
app.get('/api/debug-initdata', (req, res) => {
    const initData = req.query.initData;
    
    if (!initData) {
        return res.json({ error: 'No initData provided' });
    }

    try {
        const decodedInitData = decodeURIComponent(initData);
        const urlParams = new URLSearchParams(decodedInitData);
        
        const debugInfo = {
            rawInitData: initData,
            decodedInitData: decodedInitData,
            parameters: {}
        };

        urlParams.forEach((value, key) => {
            debugInfo.parameters[key] = value;
        });

        res.json(debugInfo);
    } catch (error) {
        res.json({ error: error.message });
    }
});

// 👤 جلب بيانات المستخدم من قاعدة البيانات
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
        console.error('❌ خطأ في جلب بيانات المستخدم:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user data' 
        });
    }
});

// 👤 تسجيل مستخدم جديد في قاعدة البيانات
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
        
        // التحقق إذا المستخدم موجود في قاعدة البيانات
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

        // إنشاء مستخدم جديد في قاعدة البيانات
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
                }
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

// 📺 مشاهدة إعلان وحفظ في قاعدة البيانات
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
        
        // جلب المستخدم من قاعدة البيانات
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
        console.error('❌ خطأ في مشاهدة الإعلان:', error.message);
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

// 💸 سحب رصيد وحفظ في قاعدة البيانات
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
        console.error('❌ خطأ في السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed' 
        });
    }
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`🔐 Telegram verification: ENABLED`);
});
