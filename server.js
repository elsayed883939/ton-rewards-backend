const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const querystring = require('querystring');

const app = express();

// 🔧 إعداد CORS آمن
app.use(cors({
    origin: ['https://telegram.org', 'https://web.telegram.org', 'http://localhost:3000', 'https://your-app.herokuapp.com'],
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 🎯 البوت توكن
const BOT_TOKEN = "8257278435:AAHkhaFLpI4J7uYL4xpAEp4_-hc5DnW5yno"; 

// 🔧 اتصال قاعدة البيانات
const pool = new Pool({
    connectionString: "postgresql://postgres:EBEXkZAIxdoDqsUNjaYJNcjLdDvuHtSU@maglev.proxy.rlwy.net:12181/railway",
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
});

// اختبار اتصال قاعدة البيانات
pool.on('connect', () => {
    console.log('🟢 تم الاتصال بقاعدة البيانات بنجاح');
});

pool.on('error', (err) => {
    console.error('❌ خطأ في قاعدة البيانات:', err);
});

// 🔥 الإعدادات الأساسية
const config = {
    adValue: 0.0001,
    dailyAdLimit: 100,
    minWithdrawal: 0.0001,
    referralBonus: 0.0005,
    contestAdPoints: 1,
    contestReferralPoints: 15,
    RR_TO_TON_RATE: 10000000,
    botUsername: "Aborabie777_bot"
};

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
        
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        const expectedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        return expectedHash === hash;
    } catch (error) {
        console.error('❌ خطأ في التحقق من التوقيع:', error);
        return false;
    }
}

// 🔧 دالة لتحليل بيانات تليجرام
function parseTelegramUser(initData) {
    try {
        const decodedInitData = decodeURIComponent(initData);
        const parsedData = querystring.parse(decodedInitData);
        
        if (parsedData.user) {
            return JSON.parse(parsedData.user);
        }
        return null;
    } catch (error) {
        console.error('❌ خطأ في تحليل بيانات المستخدم:', error);
        return null;
    }
}

// 👤 دوال مساعدة للتعامل مع قاعدة البيانات
async function getUserFromDB(userId) {
    try {
        const result = await pool.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1',
            [userId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدم:', error);
        return null;
    }
}

async function createUserInDB(userData) {
    try {
        const result = await pool.query(
            `INSERT INTO bot_users (telegram_id, username, first_name, photo_url, language_code, balance, earning_wallet, total_earned, referrals) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
             RETURNING *`,
            [
                userData.telegram_id,
                userData.username || '',
                userData.first_name || 'مستخدم',
                userData.photo_url || '',
                userData.language_code || 'en',
                0, // balance
                0, // earning_wallet
                0, // total_earned
                0  // referrals
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        throw error;
    }
}

// 🔧 middleware للتحقق من التوقيع
const validateTelegramWebApp = (req, res, next) => {
    const publicEndpoints = ['/api/health', '/api/config', '/api/setup-database'];
    
    if (publicEndpoints.includes(req.path)) {
        return next();
    }

    const initData = req.body.initData || req.query.initData;
    
    if (!initData) {
        return res.status(401).json({ 
            success: false,
            error: 'Telegram initData required' 
        });
    }

    if (!validateTelegramInitData(initData)) {
        return res.status(401).json({ 
            success: false,
            error: 'Invalid Telegram signature' 
        });
    }

    next();
};

app.use(validateTelegramWebApp);

// ========== الـ Endpoints الرئيسية ==========

// 👤 جلب بيانات المستخدم (لـ WebApp)
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const initData = req.query.initData;

        console.log(`📥 طلب جلب بيانات المستخدم للويب: ${userId}`);

        let user = await getUserFromDB(userId);
        let isNewUser = false;
        
        if (!user) {
            console.log('🆕 المستخدم غير موجود - محاولة إنشاء جديد...');
            
            const telegramUser = parseTelegramUser(initData);
            
            if (telegramUser?.id) {
                try {
                    const newUser = {
                        telegram_id: telegramUser.id.toString(),
                        username: telegramUser.username || '',
                        first_name: telegramUser.first_name || 'مستخدم',
                        photo_url: telegramUser.photo_url || '',
                        language_code: telegramUser.language_code || 'en'
                    };

                    user = await createUserInDB(newUser);
                    isNewUser = true;
                    console.log('✅ تم إنشاء مستخدم جديد:', user.telegram_id);
                } catch (createError) {
                    console.error('❌ فشل في إنشاء المستخدم:', createError);
                    return res.status(500).json({ 
                        success: false,
                        error: 'Failed to create user' 
                    });
                }
            }
        }

        if (user) {
            const userRRBalance = Math.floor((parseFloat(user.earning_wallet || 0) * config.RR_TO_TON_RATE));
            
            res.json({ 
                success: true, 
                user: {
                    id: user.telegram_id,
                    first_name: user.first_name,
                    username: user.username,
                    photo_url: user.photo_url,
                    balance: parseFloat(user.balance || 0),
                    earning_wallet: parseFloat(user.earning_wallet || 0),
                    daily_ad_count: user.daily_ad_count || 0,
                    total_ads: user.total_ads || 0,
                    total_earned: parseFloat(user.total_earned || 0),
                    rr_balance: userRRBalance,
                    referrals: user.referrals || 0,
                    last_ad_date: user.last_ad_date,
                    created_at: user.created_at
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
        console.error('❌ خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get user data' 
        });
    }
});

// 👤 إنشاء مستخدم جديد (لـ WebApp)
app.post('/api/users', async (req, res) => {
    try {
        const { telegram_id, first_name, username, photo_url, language_code } = req.body;
        
        console.log(`📥 طلب إنشاء مستخدم جديد: ${telegram_id}`);

        // التحقق من وجود المستخدم أولاً
        const existingUser = await getUserFromDB(telegram_id);
        if (existingUser) {
            const userRRBalance = Math.floor((parseFloat(existingUser.earning_wallet || 0) * config.RR_TO_TON_RATE));
            
            return res.json({
                success: true,
                user: {
                    id: existingUser.telegram_id,
                    first_name: existingUser.first_name,
                    username: existingUser.username,
                    photo_url: existingUser.photo_url,
                    balance: parseFloat(existingUser.balance || 0),
                    earning_wallet: parseFloat(existingUser.earning_wallet || 0),
                    daily_ad_count: existingUser.daily_ad_count || 0,
                    total_ads: existingUser.total_ads || 0,
                    total_earned: parseFloat(existingUser.total_earned || 0),
                    rr_balance: userRRBalance,
                    referrals: existingUser.referrals || 0
                },
                message: 'User already exists'
            });
        }

        // إنشاء المستخدم الجديد
        const newUser = {
            telegram_id: telegram_id.toString(),
            username: username || '',
            first_name: first_name || 'مستخدم',
            photo_url: photo_url || '',
            language_code: language_code || 'en'
        };

        const user = await createUserInDB(newUser);

        if (user) {
            const userRRBalance = Math.floor((parseFloat(user.earning_wallet || 0) * config.RR_TO_TON_RATE));
            
            res.json({
                success: true,
                user: {
                    id: user.telegram_id,
                    first_name: user.first_name,
                    username: user.username,
                    photo_url: user.photo_url,
                    balance: parseFloat(user.balance || 0),
                    earning_wallet: parseFloat(user.earning_wallet || 0),
                    daily_ad_count: user.daily_ad_count || 0,
                    total_ads: user.total_ads || 0,
                    total_earned: parseFloat(user.total_earned || 0),
                    rr_balance: userRRBalance,
                    referrals: user.referrals || 0
                },
                message: 'User created successfully'
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Failed to create user' 
            });
        }

    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to create user' 
        });
    }
});

// 👤 تحديث بيانات المستخدم (لـ WebApp)
app.put('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const updates = req.body;

        console.log(`📥 طلب تحديث بيانات المستخدم: ${userId}`, updates);

        const user = await getUserFromDB(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // بناء استعلام التحديث الديناميكي
        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        const allowedFields = ['first_name', 'username', 'photo_url', 'language_code'];
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = $${paramCount}`);
                updateValues.push(value);
                paramCount++;
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'No valid fields to update' 
            });
        }

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(userId);

        const query = `UPDATE bot_users SET ${updateFields.join(', ')} WHERE telegram_id = $${paramCount} RETURNING *`;
        
        const result = await pool.query(query, updateValues);
        const updatedUser = result.rows[0];

        const userRRBalance = Math.floor((parseFloat(updatedUser.earning_wallet || 0) * config.RR_TO_TON_RATE));

        res.json({
            success: true,
            user: {
                id: updatedUser.telegram_id,
                first_name: updatedUser.first_name,
                username: updatedUser.username,
                photo_url: updatedUser.photo_url,
                balance: parseFloat(updatedUser.balance || 0),
                earning_wallet: parseFloat(updatedUser.earning_wallet || 0),
                daily_ad_count: updatedUser.daily_ad_count || 0,
                total_ads: updatedUser.total_ads || 0,
                total_earned: parseFloat(updatedUser.total_earned || 0),
                rr_balance: userRRBalance,
                referrals: updatedUser.referrals || 0
            }
        });

    } catch (error) {
        console.error('❌ خطأ في تحديث بيانات المستخدم:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update user' 
        });
    }
});

// 📺 تسجيل مشاهدة إعلان (لـ WebApp)
app.post('/api/users/:id/ad-watch', async (req, res) => {
    let client;
    
    try {
        const userId = req.params.id;
        console.log(`📥 طلب مشاهدة إعلان للويب: ${userId}`);

        client = await pool.connect();
        await client.query('BEGIN');

        // جلب بيانات المستخدم مع قفل
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

        // التحقق من الحد اليومي
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
        
        // تحديث بيانات المستخدم
        const updateResult = await client.query(
            `UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1,
                total_earned = COALESCE(total_earned, 0) + $1,
                total_ads = COALESCE(total_ads, 0) + 1,
                daily_ad_count = $2,
                last_ad_date = CURRENT_DATE,
                last_ad_timestamp = CURRENT_TIMESTAMP
             WHERE telegram_id = $3 
             RETURNING *`,
            [adReward, dailyAdCount + 1, userId]
        );

        const updatedUser = updateResult.rows[0];
        
        if (updatedUser) {
            // تحديث المسابقة
            try {
                const existingContest = await client.query(
                    'SELECT * FROM contest_leaderboard WHERE user_id = $1',
                    [userId]
                );

                if (existingContest.rows.length > 0) {
                    await client.query(`
                        UPDATE contest_leaderboard SET 
                            points = points + 1,
                            ads_watched = ads_watched + 1,
                            last_activity = CURRENT_TIMESTAMP
                        WHERE user_id = $1
                    `, [userId]);
                } else {
                    await client.query(`
                        INSERT INTO contest_leaderboard 
                        (user_id, username, first_name, points, ads_watched, last_activity)
                        VALUES ($1, $2, $3, 1, 1, CURRENT_TIMESTAMP)
                    `, [userId, user.username || '', user.first_name || 'User']);
                }
            } catch (contestError) {
                console.log('⚠️  خطأ في تحديث المسابقة:', contestError.message);
            }

            await client.query('COMMIT');
            
            const userRRBalance = Math.floor((parseFloat(updatedUser.earning_wallet || 0) * config.RR_TO_TON_RATE));
            
            res.json({
                success: true,
                amount: adReward,
                newRRBalance: userRRBalance,
                updatedUser: {
                    daily_ad_count: updatedUser.daily_ad_count,
                    earning_wallet: parseFloat(updatedUser.earning_wallet || 0),
                    total_earned: parseFloat(updatedUser.total_earned || 0),
                    total_ads: updatedUser.total_ads || 0
                },
                dailyRemaining: config.dailyAdLimit - (dailyAdCount + 1),
                contestPoints: 1
            });
        } else {
            await client.query('ROLLBACK');
            res.status(500).json({ 
                success: false,
                error: 'Failed to process ad' 
            });
        }

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في تسجيل مشاهدة الإعلان:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to record ad watch' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 💱 تحويل RR إلى TON
app.post('/api/users/:id/convert-rr', async (req, res) => {
    let client;
    
    try {
        const userId = req.params.id;
        const { rr_amount } = req.body;

        if (!rr_amount || rr_amount <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid RR amount' 
            });
        }

        const tonAmount = rr_amount / config.RR_TO_TON_RATE;

        client = await pool.connect();
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
        const currentRRBalance = Math.floor((parseFloat(user.earning_wallet || 0) * config.RR_TO_TON_RATE));

        if (rr_amount > currentRRBalance) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient RR balance' 
            });
        }

        const result = await client.query(
            `UPDATE bot_users SET 
                balance = COALESCE(balance, 0) + $1,
                earning_wallet = GREATEST(0, COALESCE(earning_wallet, 0) - $1)
            WHERE telegram_id = $2 
            RETURNING *`,
            [tonAmount, userId]
        );

        await client.query('COMMIT');

        const updatedUser = result.rows[0];
        const newRRBalance = Math.floor((parseFloat(updatedUser.earning_wallet || 0) * config.RR_TO_TON_RATE));

        res.json({
            success: true,
            newBalance: parseFloat(updatedUser.balance || 0),
            newRRBalance: newRRBalance,
            convertedAmount: tonAmount
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في تحويل RR:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to convert RR' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 🏆 جلب بيانات المسابقة الحالية
app.get('/api/contest/current', async (req, res) => {
    try {
        const leaderboard = await pool.query(`
            SELECT 
                cl.*,
                bu.username,
                bu.first_name,
                ROW_NUMBER() OVER (ORDER BY cl.points DESC, cl.last_activity DESC) as rank
            FROM contest_leaderboard cl
            LEFT JOIN bot_users bu ON cl.user_id = bu.telegram_id
            ORDER BY cl.points DESC, cl.last_activity DESC
            LIMIT 50
        `);

        // حساب وقت نهاية المسابقة (7 أيام من الآن)
        const endTime = new Date();
        endTime.setDate(endTime.getDate() + 7);

        res.json({
            success: true,
            contest: {
                isActive: true,
                endTime: endTime.getTime(),
                durationDays: 7,
                leaderboard: leaderboard.rows,
                totalParticipants: leaderboard.rows.length
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب بيانات المسابقة:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get contest data' 
        });
    }
});

// 🏆 إضافة نقاط المسابقة
app.post('/api/contest/:id/add-points', async (req, res) => {
    try {
        const userId = req.params.id;
        const { points } = req.body;

        const result = await pool.query(`
            INSERT INTO contest_leaderboard (user_id, points, last_activity)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                points = contest_leaderboard.points + $2,
                last_activity = EXCLUDED.last_activity
            RETURNING *
        `, [userId, points || 1]);

        const updatedContest = result.rows[0];

        res.json({
            success: true,
            newPoints: updatedContest.points
        });

    } catch (error) {
        console.error('❌ خطأ في إضافة نقاط المسابقة:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to add contest points' 
        });
    }
});

// 👥 جلب بيانات الإحالات (لـ WebApp)
app.get('/api/referrals/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        const referrals = await pool.query(`
            SELECT r.*, bu.first_name, bu.username, bu.created_at as join_date
            FROM referrals r
            LEFT JOIN bot_users bu ON r.referred_id = bu.telegram_id
            WHERE r.referrer_id = $1
            ORDER BY r.created_at DESC
        `, [userId]);

        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_referrals,
                COALESCE(SUM(referrer_earnings), 0) as total_earnings,
                COALESCE(SUM(CASE WHEN status = 'active' THEN referrer_earnings ELSE 0 END), 0) as pending_earnings
            FROM referrals 
            WHERE referrer_id = $1
        `, [userId]);

        const referredUsers = referrals.rows.map(ref => ({
            id: ref.referred_id,
            name: ref.first_name || 'User',
            username: ref.username,
            photo_url: null,
            join_date: ref.join_date,
            total_earned: parseFloat(ref.referrer_earnings || 0)
        }));

        res.json({
            success: true,
            referralData: {
                totalEarnings: parseFloat(stats.rows[0].total_earnings || 0),
                pendingEarnings: parseFloat(stats.rows[0].pending_earnings || 0),
                totalReferrals: parseInt(stats.rows[0].total_referrals || 0),
                referredUsers: referredUsers
            }
        });

    } catch (error) {
        console.error('❌ خطأ في جلب بيانات الإحالات:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get referral data' 
        });
    }
});

// 👥 معالجة الإحالة
app.post('/api/referrals/process', async (req, res) => {
    let client;
    
    try {
        const { referrer_id, referred_id } = req.body;

        console.log(`👥 محاولة معالجة إحالة: ${referrer_id} أحال ${referred_id}`);

        client = await pool.connect();
        await client.query('BEGIN');

        const referredUser = await getUserFromDB(referred_id);
        if (!referredUser) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: 'Referred user not found' 
            });
        }

        const existingReferral = await client.query(
            'SELECT * FROM referrals WHERE referred_id = $1',
            [referred_id]
        );
        
        if (existingReferral.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({ 
                success: true, 
                message: 'Referral already processed' 
            });
        }

        // حساب أرباح المُحيل (15% من ربح المُحال)
        const referrerEarnings = config.referralBonus;

        await client.query(`
            INSERT INTO referrals (referrer_id, referred_id, status, referrer_earnings)
            VALUES ($1, $2, 'active', $3)
        `, [referrer_id, referred_id, referrerEarnings]);

        // تحديث عدد الإحالات للمُحيل
        await client.query(`
            UPDATE bot_users SET 
                referrals = COALESCE(referrals, 0) + 1
            WHERE telegram_id = $1
        `, [referrer_id]);

        // تحديث المسابقة
        await client.query(`
            INSERT INTO contest_leaderboard (user_id, referrals_count, points, last_activity)
            VALUES ($1, 1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                referrals_count = contest_leaderboard.referrals_count + 1,
                points = contest_leaderboard.points + $2,
                last_activity = EXCLUDED.last_activity
        `, [referrer_id, config.contestReferralPoints]);

        await client.query('COMMIT');

        res.json({
            success: true,
            contestPoints: config.contestReferralPoints,
            referrerEarnings: referrerEarnings,
            message: 'Referral processed successfully'
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في معالجة الإحالة:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process referral' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 💰 المطالبة بأرباح الإحالات
app.post('/api/referrals/:id/claim', async (req, res) => {
    let client;
    
    try {
        const userId = req.params.id;

        client = await pool.connect();
        await client.query('BEGIN');

        // جلب الأرباح المعلقة
        const pendingResult = await client.query(`
            SELECT COALESCE(SUM(referrer_earnings), 0) as total_pending
            FROM referrals 
            WHERE referrer_id = $1 AND status = 'active'
        `, [userId]);

        const pendingEarnings = parseFloat(pendingResult.rows[0].total_pending || 0);

        if (pendingEarnings <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: 'No pending earnings to claim' 
            });
        }

        // تحويل الأرباح إلى محفظة المستخدم
        await client.query(`
            UPDATE bot_users SET 
                earning_wallet = COALESCE(earning_wallet, 0) + $1
            WHERE telegram_id = $2
        `, [pendingEarnings, userId]);

        // تحديث حالة الإحالات
        await client.query(`
            UPDATE referrals SET 
                status = 'claimed'
            WHERE referrer_id = $1 AND status = 'active'
        `, [userId]);

        await client.query('COMMIT');

        const userRRBalance = Math.floor((pendingEarnings * config.RR_TO_TON_RATE));

        res.json({
            success: true,
            claimedAmount: pendingEarnings,
            claimedRR: userRRBalance,
            message: 'Referral earnings claimed successfully'
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في المطالبة بأرباح الإحالات:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to claim referral earnings' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 💳 تقديم طلب سحب (لـ WebApp)
app.post('/api/withdrawals', async (req, res) => {
    let client;
    
    try {
        const { user_id, amount, wallet_address, method = 'TON Wallet', memo = '' } = req.body;

        if (!user_id || !amount || !wallet_address) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields' 
            });
        }

        const withdrawAmount = parseFloat(amount);

        if (withdrawAmount <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid withdrawal amount' 
            });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT * FROM bot_users WHERE telegram_id = $1 FOR UPDATE',
            [user_id]
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

        if (userBalance < withdrawAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: 'Insufficient balance' 
            });
        }

        let minWithdrawal = config.minWithdrawal;
        if (method === 'TON Wallet') {
            minWithdrawal = 0.05;
        }

        if (withdrawAmount < minWithdrawal) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: `Minimum withdrawal is ${minWithdrawal} TON` 
            });
        }

        // خصم المبلغ من رصيد المستخدم
        await client.query(
            'UPDATE bot_users SET balance = balance - $1 WHERE telegram_id = $2',
            [withdrawAmount, user_id]
        );

        // إنشاء طلب السحب
        const result = await client.query(`
            INSERT INTO withdrawals 
            (user_id, amount, wallet_address, status, method, memo) 
            VALUES ($1, $2, $3, 'pending', $4, $5) 
            RETURNING *
        `, [user_id, withdrawAmount, wallet_address, method, memo || '']);

        await client.query('COMMIT');

        const withdrawal = result.rows[0];
        
        res.json({
            success: true,
            withdrawal: {
                id: withdrawal.id,
                amount: parseFloat(withdrawal.amount),
                wallet_address: withdrawal.wallet_address,
                status: withdrawal.status,
                method: withdrawal.method,
                created_at: withdrawal.created_at
            },
            newBalance: userBalance - withdrawAmount,
            message: 'تم تقديم طلب السحب بنجاح'
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في تقديم طلب السحب:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to submit withdrawal' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 📋 جلب سجل السحوبات (لـ WebApp)
app.get('/api/withdrawals/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        const withdrawals = await pool.query(`
            SELECT * FROM withdrawals 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 20
        `, [userId]);

        const processedWithdrawals = withdrawals.rows.map(w => ({
            id: w.id,
            amount: parseFloat(w.amount),
            wallet_address: w.wallet_address,
            status: w.status,
            method: w.method,
            memo: w.memo || '',
            created_at: w.created_at
        }));
        
        res.json({
            success: true,
            withdrawals: processedWithdrawals
        });

    } catch (error) {
        console.error('❌ خطأ في جلب سجل السحوبات:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get withdrawal history' 
        });
    }
});

// 🎫 استبدال الكود
app.post('/api/codes/redeem', async (req, res) => {
    let client;
    
    try {
        const { user_id, code } = req.body;

        if (!user_id || !code) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID and code are required' 
            });
        }

        const codeUpper = code.toUpperCase().trim();

        // قائمة الأكواد الثابتة (يمكن تطوير هذا لاحقاً)
        const validCodes = {
            'WELCOME1000': { type: 'RR', value: 1000 },
            'TON5000': { type: 'RR', value: 5000 },
            'BONUS2024': { type: 'points', value: 25 },
            'REFER15': { type: 'points', value: 15 }
        };

        if (!validCodes[codeUpper]) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid or expired code' 
            });
        }

        const reward = validCodes[codeUpper];

        client = await pool.connect();
        await client.query('BEGIN');

        // التحقق من عدم استخدام الكود مسبقاً
        const usedCode = await client.query(`
            SELECT * FROM redeemed_codes WHERE user_id = $1 AND code = $2
        `, [user_id, codeUpper]);

        if (usedCode.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: 'Code already used' 
            });
        }

        let result;

        if (reward.type === 'RR') {
            const tonAmount = reward.value / config.RR_TO_TON_RATE;
            result = await client.query(`
                UPDATE bot_users SET 
                    earning_wallet = COALESCE(earning_wallet, 0) + $1
                WHERE telegram_id = $2
                RETURNING *
            `, [tonAmount, user_id]);
        } else if (reward.type === 'points') {
            result = await client.query(`
                INSERT INTO contest_leaderboard (user_id, points, last_activity)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    points = contest_leaderboard.points + $2,
                    last_activity = EXCLUDED.last_activity
                RETURNING *
            `, [user_id, reward.value]);
        }

        // تسجيل استخدام الكود
        await client.query(`
            INSERT INTO redeemed_codes (user_id, code, reward_type, reward_value)
            VALUES ($1, $2, $3, $4)
        `, [user_id, codeUpper, reward.type, reward.value]);

        await client.query('COMMIT');

        res.json({
            success: true,
            reward_type: reward.type,
            reward_value: reward.value,
            message: 'Code redeemed successfully'
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ خطأ في استبدال الكود:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to redeem code' 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 📺 التحقق من الاشتراك في القنوات
app.post('/api/check-subscription', async (req, res) => {
    try {
        const { user_id, channel_username } = req.body;

        if (!user_id || !channel_username) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID and channel username are required' 
            });
        }

        // في الإصدار الحالي نرجع true للاختبار
        // يمكن تطوير هذا لاحقاً باستخدام Telegram Bot API
        console.log(`📺 التحقق من اشتراك ${user_id} في ${channel_username}`);
        
        res.json({
            success: true,
            is_subscribed: true,
            channel: channel_username
        });

    } catch (error) {
        console.error('❌ خطأ في التحقق من الاشتراك:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to check subscription' 
        });
    }
});

// ⚙️ جلب إعدادات التطبيق
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: config
    });
});

// 🏥 endpoint للصحة
app.get('/api/health', async (req, res) => {
    try {
        // اختبار اتصال قاعدة البيانات
        await pool.query('SELECT 1');
        
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            version: '2.0.0'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message,
            database: 'disconnected'
        });
    }
});

// 🔧 إنشاء الجداول إذا لم تكن موجودة
app.get('/api/setup-database', async (req, res) => {
    try {
        console.log('🔧 بدء إعداد جداول قاعدة البيانات...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS bot_users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                photo_url TEXT,
                language_code VARCHAR(10) DEFAULT 'en',
                balance DECIMAL(15,8) DEFAULT 0,
                earning_wallet DECIMAL(15,8) DEFAULT 0,
                total_earned DECIMAL(15,8) DEFAULT 0,
                total_ads INTEGER DEFAULT 0,
                daily_ad_count INTEGER DEFAULT 0,
                last_ad_date DATE,
                last_ad_timestamp TIMESTAMP,
                referrals INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول bot_users جاهز');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                amount DECIMAL(15,8) NOT NULL,
                wallet_address TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                method VARCHAR(100) DEFAULT 'TON Wallet',
                memo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول withdrawals جاهز');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS contest_leaderboard (
                id SERIAL PRIMARY KEY,
                user_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                points INTEGER DEFAULT 0,
                ads_watched INTEGER DEFAULT 0,
                referrals_count INTEGER DEFAULT 0,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول contest_leaderboard جاهز');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT NOT NULL,
                referred_id BIGINT NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                referrer_earnings DECIMAL(15,8) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول referrals جاهز');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS redeemed_codes (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                code VARCHAR(50) NOT NULL,
                reward_type VARCHAR(20) NOT NULL,
                reward_value DECIMAL(15,8) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول redeemed_codes جاهز');

        res.json({
            success: true,
            message: 'Database tables created successfully',
            tables: ['bot_users', 'withdrawals', 'contest_leaderboard', 'referrals', 'redeemed_codes']
        });

    } catch (error) {
        console.error('❌ خطأ في إعداد الجداول:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🟢 TON Rewards Backend running on port ${PORT}`);
    console.log(`💰 Ad reward: ${config.adValue} TON`);
    console.log(`📊 Daily ads: ${config.dailyAdLimit} ads`);
    console.log(`💸 Min withdrawal: ${config.minWithdrawal} TON`);
    console.log(`🔐 Telegram verification: ENABLED`);
    console.log(`🌐 CORS: ENABLED for secure origins`);
    console.log(`📡 Health check: http://${HOST}:${PORT}/api/health`);
    console.log(`🔧 Database setup: http://${HOST}:${PORT}/api/setup-database`);
});
