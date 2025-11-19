const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();
app.use(cors());
app.use(express.json());

// 🎯 غير التوكن هنا علشان يطابق البوت اللي بتستخدمه
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
        console.log('=== بدء التحقق من التوقيع ===');
        
        if (!initData) {
            console.log('❌ initData غير موجود');
            return false;
        }

        console.log('📦 initData المستلم:', initData);

        const parsedData = querystring.parse(initData);
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
            console.log('❌ لا توجد بيانات مستخدم في initData');
            return null;
        }
        
        // فك تشفير JSON
        const user = JSON.parse(decodeURIComponent(userStr));
        console.log('👤 بيانات المستخدم المُستخرجة:', user);
        
        return user && user.id ? user : null;
    } catch (error) {
        console.error('❌ خطأ في تحليل بيانات المستخدم:', error);
        return null;
    }
}

// 📊 جلب المستخدم من قاعدة البيانات
async function getUserFromDB(userId) {
    try {
        console.log('🗄️ جلب المستخدم من DB:', userId);
        const result = await pool.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        
        const userExists = result.rows.length > 0;
        console.log('✅ المستخدم موجود في DB:', userExists);
        
        return userExists ? result.rows[0] : null;
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدم من DB:', error.message);
        return null;
    }
}

// ➕ إنشاء مستخدم جديد في قاعدة البيانات
async function createUserInDB(userData) {
    try {
        console.log('🆕 إنشاء مستخدم جديد:', userData);
        
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
        
        console.log('✅ تم إنشاء المستخدم بنجاح:', result.rows[0]);
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

// 🔍 endpoint علشان نشوف الجداول الموجودة
app.get('/api/debug-database', async (req, res) => {
    try {
        // جلب كل الجداول
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        // جلب بيانات من جدول bot_users إذا كان موجود
        let usersData = [];
        try {
            const usersResult = await pool.query('SELECT * FROM bot_users LIMIT 5');
            usersData = usersResult.rows;
        } catch (error) {
            usersData = { error: error.message };
        }

        res.json({
            success: true,
            tables: tablesResult.rows,
            sample_users: usersData,
            total_tables: tablesResult.rows.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔄 إعادة إنشاء الجداول إذا محتاج
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
            message: 'تم إنشاء الجداول بنجاح'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 👤 جلب بيانات المستخدم من قاعدة البيانات
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        console.log(`📥 طلب جلب بيانات المستخدم: ${userId}`);

        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - رفض الطلب');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        console.log('✅ تم التحقق بنجاح - متابعة الطلب');
        const user = await getUserFromDB(userId);
        
        if (user) {
            console.log('✅ تم العثور على المستخدم');
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
            console.log('❌ المستخدم غير موجود - يجب التسجيل أولاً');
            res.status(404).json({ 
                success: false,
                error: 'User not found - Please register first' 
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
    AAGeJ6iozisWnkkCmoTsPDt8RYoOgkvhroYta' 
            });
        }

        const userId = telegramUser.id.toString();
        console.log(`👤 معالجة المستخدم: ${userId}`);
        
        // التحقق إذا المستخدم موجود في قاعدة البيانات
        let user = await getUserFromDB(userId);
        
        if (user) {
            console.log('✅ المستخدم موجود بالفعل');
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
                    totalEarned: parseFloat(user.total_earned || 0)
                }
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
            error: 'Registration failed' 
        });
    }
});

// 📺 مشاهدة إعلان وحفظ في قاعدة البيانات
app.post('/api/watch-ad', async (req, res) => {
    try {
        const { initData } = req.body;

        console.log('📥 طلب مشاهدة إعلان');

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
        
        // جلب المستخدم من قاعدة البيانات
        const user = await getUserFromDB(userId);
        if (!user) {
            console.log('❌ المستخدم غير موجود - يجب التسجيل أولاً');
            return res.status(404).json({ 
                success: false,
                error: 'User not found - Please register first' 
            });
        }

        // التحقق من الحد اليومي
        const today = new Date().toISOString().split('T')[0];
        if (user.last_ad_date === today && user.daily_ad_count >= config.dailyAdLimit) {
            console.log('❌ تم الوصول للحد اليومي');
            return res.status(400).json({ 
                success: false,
                error: 'Daily ad limit reached' 
            });
        }

        // تحديث البيانات في قاعدة البيانات
        const adReward = config.adValue;
        console.log(`💰 مكافأة الإعلان: ${adReward} TON`);
        
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
            console.log('✅ تمت مشاهدة الإعلان بنجاح');
            res.json({
                success: true,
                amount: adReward,
                earningWallet: parseFloat(updatedUser.earning_wallet || 0),
                dailyRemaining: config.dailyAdLimit - (updatedUser.daily_ad_count || 0),
                totalEarned: parseFloat(updatedUser.total_earned || 0)
            });
        } else {
            console.log('❌ فشل في معالجة الإعلان');
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
        
        if (earningWallet < 0.001) {
            console.log('❌ الرصيد غير كافي للتحويل');
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

// 💸 سحب رصيد وحفظ في قاعدة البيانات
app.post('/api/withdraw', async (req, res) => {
    try {
        const { initData, amount, walletAddress, method = 'TON Wallet' } = req.body;

        console.log('📥 طلب سحب رصيد');

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
        console.log(`👤 معالجة سحب رصيد للمستخدم: ${userId}`);
        
        const user = await getUserFromDB(userId);
        
        if (!user) {
            console.log('❌ المستخدم غير موجود');
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const userBalance = parseFloat(user.balance || 0);
        console.log(`💰 الرصيد الحالي: ${userBalance} TON`);
        
        if (userBalance < amount) {
            console.log('❌ الرصيد غير كافي');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance' 
            });
        }

        if (amount < 0.01) {
            console.log('❌ المبلغ أقل من الحد الأدنى');
            return res.status(400).json({ 
                success: false,
                error: 'Minimum withdrawal is 0.01 TON' 
            });
        }

        if (!walletAddress) {
            console.log('❌ عنوان المحفظة مطلوب');
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

            console.log('✅ تم تقديم طلب السحب بنجاح');
            res.json({
                success: true,
                message: 'Withdrawal request submitted successfully',
                newBalance: parseFloat(updatedUser.balance || 0)
            });
        } else {
            console.log('❌ فشل في معالجة السحب');
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
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`🔐 Telegram verification: ENABLED`);
});
