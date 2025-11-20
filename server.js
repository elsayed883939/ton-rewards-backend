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
        
        // 🔥 استخدم hash بدل signature
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
        if (!initData) {
            console.log('❌ initData غير موجود');
            return null;
        }

        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        const userStr = parsedData.user;
        
        if (!userStr) {
            console.log('❌ لا توجد بيانات مستخدم في initData');
            return null;
        }
        
        // فك تشفير JSON
        const user = JSON.parse(userStr);
        
        // 🔥 تحقق شامل من البيانات
        if (!user || !user.id) {
            console.log('❌ بيانات المستخدم غير صالحة - id مفقود');
            return null;
        }

        console.log('✅ بيانات المستخدم صالحة:', {
            id: user.id,
            username: user.username,
            first_name: user.first_name
        });
        
        return user;
        
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

// ➕ إنشاء مستخدم جديد في قاعدة البيانات - الإصدار المحمي
async function createUserInDB(userData) {
    try {
        console.log('🆕 إنشاء مستخدم جديد - البيانات المستلمة:', userData);
        
        // 🔥 تحقق شامل من البيانات
        if (!userData.telegram_id) {
            console.log('❌ خطأ: telegram_id مفقود أو undefined');
            return null;
        }

        // تحويل telegram_id لـ string علشان نتأكد
        const telegramId = userData.telegram_id.toString();
        
        // 🔥 استخدم query آمن
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
        
        console.log('✅ تم إنشاء المستخدم بنجاح');
        return result.rows[0];
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error.message);
        
        // 🔥 إذا المستخدم موجود بالفعل، جيب بياناته
        if (error.code === '23505') {
            console.log('⚠️  المستخدم موجود بالفعل، جاري جلب البيانات...');
            return await getUserFromDB(userData.telegram_id);
        }
        
        // 🔥 إذا العمود مش موجود، عدل الجدول أولاً
        if (error.code === '42703') {
            console.log('⚠️  أعمدة ناقصة، جاري إصلاح الجداول...');
            await fixMissingColumns();
            // حاول تاني بعد الإصلاح
            return await createUserInDB(userData);
        }
        
        return null;
    }
}

// 🔧 دالة لإصلاح الأعمدة الناقصة
async function fixMissingColumns() {
    try {
        console.log('🔧 بدء إصلاح الأعمدة الناقصة...');
        
        const columnsToAdd = [
            { name: 'username', sql: 'ADD COLUMN IF NOT EXISTS username VARCHAR(255)' },
            { name: 'first_name', sql: 'ADD COLUMN IF NOT EXISTS first_name VARCHAR(255) NOT NULL DEFAULT \'مستخدم\'' },
            { name: 'balance', sql: 'ADD COLUMN IF NOT EXISTS balance DECIMAL(15, 8) DEFAULT 0.00000000' },
            { name: 'earning_wallet', sql: 'ADD COLUMN IF NOT EXISTS earning_wallet DECIMAL(15, 8) DEFAULT 0.00000000' },
            { name: 'total_earned', sql: 'ADD COLUMN IF NOT EXISTS total_earned DECIMAL(15, 8) DEFAULT 0.00000000' },
            { name: 'daily_ad_count', sql: 'ADD COLUMN IF NOT EXISTS daily_ad_count INTEGER DEFAULT 0' },
            { name: 'last_ad_date', sql: 'ADD COLUMN IF NOT EXISTS last_ad_date DATE DEFAULT CURRENT_DATE' },
            { name: 'created_at', sql: 'ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
        ];

        for (const column of columnsToAdd) {
            try {
                await pool.query(`ALTER TABLE bot_users ${column.sql}`);
                console.log(`✅ تم إضافة/التحقق من العمود: ${column.name}`);
            } catch (error) {
                console.log(`⚠️  تجاهل الخطأ في العمود ${column.name}:`, error.message);
            }
        }
        
        console.log('✅ تم الانتهاء من إصلاح الأعمدة');
        return true;
    } catch (error) {
        console.error('❌ خطأ في إصلاح الأعمدة:', error);
        return false;
    }
}

// 💸 endpoint للسحب
app.post('/api/withdraw', async (req, res) => {
    try {
        const { initData, amount, walletAddress, method } = req.body;

        console.log('📥 طلب سحب رصيد:', { amount, walletAddress, method });

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
        
        // جلب المستخدم من قاعدة البيانات
        const user = await getUserFromDB(userId);
        
        if (!user) {
            console.log('❌ المستخدم غير موجود');
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const userBalance = parseFloat(user.balance || 0);
        const withdrawAmount = parseFloat(amount);
        
        console.log(`💰 رصيد المستخدم: ${userBalance} TON`);
        console.log(`💸 مبلغ السحب: ${withdrawAmount} TON`);

        // التحقق من الحد الأدنى للسحب
        if (withdrawAmount < 0.01) {
            console.log('❌ المبلغ أقل من الحد الأدنى');
            return res.status(400).json({ 
                success: false,
                error: 'Minimum withdrawal amount is 0.01 TON' 
            });
        }

        // التحقق من وجود رصيد كافي
        if (userBalance < withdrawAmount) {
            console.log('❌ الرصيد غير كافي');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance' 
            });
        }

        // التحقق من عنوان المحفظة
        if (!walletAddress || walletAddress.trim().length < 10) {
            console.log('❌ عنوان المحفظة غير صالح');
            return res.status(400).json({ 
                success: false,
                error: 'Invalid wallet address' 
            });
        }

        // بدء معاملة السحب
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // 1. خصم المبلغ من رصيد المستخدم
            const updateResult = await client.query(
                `UPDATE bot_users 
                 SET balance = COALESCE(balance, 0) - $1 
                 WHERE telegram_id = $2 AND COALESCE(balance, 0) >= $1
                 RETURNING *`,
                [withdrawAmount, userId]
            );

            if (updateResult.rows.length === 0) {
                throw new Error('فشل في خصم الرصيد - قد يكون الرصيد غير كافي');
            }

            // 2. تسجيل طلب السحب
            const withdrawResult = await client.query(
                `INSERT INTO withdrawals 
                 (user_id, amount, wallet_address, status, method) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING *`,
                [userId, withdrawAmount, walletAddress.trim(), 'pending', method || 'TON Wallet']
            );

            await client.query('COMMIT');

            const updatedUser = updateResult.rows[0];
            const withdrawal = withdrawResult.rows[0];

            console.log('✅ تمت عملية السحب بنجاح:', {
                withdrawalId: withdrawal.id,
                newBalance: updatedUser.balance
            });

            res.json({
                success: true,
                newBalance: parseFloat(updatedUser.balance || 0),
                withdrawalId: withdrawal.id,
                message: 'تم تقديم طلب السحب بنجاح'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ خطأ في معاملة السحب:', error.message);
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ خطأ في السحب:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Withdrawal failed: ' + error.message 
        });
    }
});

// 📋 جلب طلبات السحب للمستخدم
app.get('/api/withdrawals/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const initData = req.query.initData;

        console.log(`📥 طلب جلب طلبات السحب للمستخدم: ${userId}`);

        if (!validateTelegramInitData(initData)) {
            console.log('❌ فشل التحقق - رفض الطلب');
            return res.status(401).json({ 
                success: false,
                error: 'Invalid security signature' 
            });
        }

        const result = await pool.query(
            `SELECT * FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 10`,
            [userId]
        );

        res.json({
            success: true,
            withdrawals: result.rows.map(row => ({
                id: row.id,
                amount: parseFloat(row.amount),
                walletAddress: row.wallet_address,
                status: row.status,
                method: row.method,
                createdAt: row.created_at
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

// 🏠 الصفحة الرئيسية
app.get('/', async (req, res) => {
    const dbConnected = await checkDatabaseConnection();
    
    res.json({ 
        message: 'TON Rewards Backend - جاري التشغيل',
        status: dbConnected ? '✅ متصل بقاعدة البيانات' : '❌ خطأ في قاعدة البيانات',
        timestamp: new Date().toISOString()
    });
});

// 🔧 endpoint لإصلاح الأعمدة الناقصة
app.get('/api/fix-database', async (req, res) => {
    try {
        await fixMissingColumns();
        
        res.json({
            success: true,
            message: 'تم إصلاح الجداول بنجاح'
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 🔥 تأكد من وجود جميع الأعمدة
        await fixMissingColumns();

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

// 👤 جلب بيانات المستخدم من قاعدة البيانات + تسجيل تلقائي
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
        
        // جلب المستخدم من قاعدة البيانات
        let user = await getUserFromDB(userId);
        let isNewUser = false;
        
        // 🔥 إذا المستخدم مش موجود، سجله تلقائياً
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
                error: 'Invalid user data' 
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
                },
                message: `مرحباً بعودتك ${user.first_name}!`
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

        // تحديث البيانات في قاعدة البيانات
        const adReward = config.adValue;
        console.log(`💰 مكافأة الإعلان: ${adReward} TON`);
        
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

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`🔐 Telegram verification: ENABLED`);
});
