const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = "8371336266:AAGeJ6iozisWnkkCmoTsPDt8RYoOgkvhroY";

// قاعدة بيانات بسيطة
let users = new Map();
let transactions = [];
let leaderboardData = { referral: [], earning: [] };

// إعدادات التطبيق
const config = {
    adZoneId: "123456",
    adValue: 0.0005,
    dailyAdLimit: 10,
    referralBonus: 0.001,
    botUsername: "Aborabie777_bot",
    minimumWithdrawReferrals: 0,
    withdrawMethods: [
        { name: "TON Wallet", min: 0.01 },
        { name: "Binance", min: 0.05 }
    ],
    tasks: {
        task1: { 
            name: "Join Our Channel", 
            reward: 0.001, 
            url: "https://t.me/earnmoney174688",
            icon: "https://img.icons8.com/ios-filled/100/group.png"
        },
        task2: { 
            name: "Follow on Twitter", 
            reward: 0.002, 
            url: "https://twitter.com/example",
            icon: "https://img.icons8.com/ios-filled/100/twitter.png"
        }
    },
    links: {
        link1: {
            name: "Official Group",
            url: "https://t.me/earnmoney174688",
            icon: "https://img.icons8.com/ios-filled/100/group.png"
        }
    }
};

// التحقق من توقيع تليجرام
function validateTelegramInitData(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
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
        
        return calculatedHash === hash;
    } catch (error) {
        return false;
    }
}

// استخراج بيانات المستخدم
function parseTelegramUser(initData) {
    try {
        const urlParams = new URLSearchParams(initData);
        const userStr = urlParams.get('user');
        return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
        return null;
    }
}

// تحديث اللوادر بورد
function updateLeaderboards() {
    leaderboardData.referral = Array.from(users.values())
        .sort((a, b) => (b.referrals || 0) - (a.referrals || 0))
        .slice(0, 10);

    leaderboardData.earning = Array.from(users.values())
        .sort((a, b) => (b.totalEarned || 0) - (a.totalEarned || 0))
        .slice(0, 10);
}

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({ 
        message: 'TON Rewards Backend is Running! 🚀',
        status: 'Active',
        users: users.size,
        transactions: transactions.length
    });
});

// جلب الإعدادات
app.get('/api/config', (req, res) => {
    res.json({ success: true, config });
});

// تسجيل مستخدم جديد
app.post('/api/register', (req, res) => {
    try {
        const { initData, referralCode } = req.body;
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();

        // إذا المستخدم موجود
        if (users.has(userId)) {
            const user = users.get(userId);
            return res.json({ success: true, user });
        }

        // إنشاء مستخدم جديد
        const newUser = {
            id: userId,
            firstName: telegramUser.first_name || 'User',
            lastName: telegramUser.last_name || '',
            username: telegramUser.username || '',
            photoUrl: '',
            balance: 0,
            earningWallet: 0,
            referrals: 0,
            totalEarned: 0,
            dailyAdCount: 0,
            lastAdDate: new Date().toISOString().split('T')[0],
            lifetimeAdCount: 0,
            completedTasks: {},
            joinDate: new Date().toISOString(),
            referredBy: referralCode || null
        };

        users.set(userId, newUser);

        // معالجة الإحالة
        if (referralCode && users.has(referralCode) && referralCode !== userId) {
            const referrer = users.get(referralCode);
            referrer.balance += config.referralBonus;
            referrer.referrals = (referrer.referrals || 0) + 1;
            updateLeaderboards();
        }

        res.json({ success: true, user: newUser });

    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// مشاهدة إعلان
app.post('/api/watch-ad', (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();
        const user = users.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // التحقق من التاريخ
        const today = new Date().toISOString().split('T')[0];
        if (user.lastAdDate !== today) {
            user.dailyAdCount = 0;
            user.lastAdDate = today;
        }

        // التحقق من الحد اليومي
        if (user.dailyAdCount >= config.dailyAdLimit) {
            return res.status(400).json({ error: 'Daily ad limit reached' });
        }

        // حساب قيمة الإعلان
        const adValue = config.adValue;

        // تحديث البيانات
        user.earningWallet += adValue;
        user.totalEarned += adValue;
        user.dailyAdCount += 1;
        user.lifetimeAdCount += 1;

        // تسجيل العملية
        const transactionId = 'txn_' + Date.now();
        transactions.push({
            id: transactionId,
            userId: userId,
            type: 'ad_reward',
            amount: adValue,
            timestamp: Date.now()
        });

        // تحديث اللوادر بورد
        updateLeaderboards();

        res.json({
            success: true,
            amount: adValue,
            earningWallet: user.earningWallet,
            dailyRemaining: config.dailyAdLimit - user.dailyAdCount,
            transactionId: transactionId
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to process ad' });
    }
});

// تحويل المحفظة
app.post('/api/move-to-balance', (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();
        const user = users.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.earningWallet < 0.001) {
            return res.status(400).json({ error: 'Minimum 0.001 TON required' });
        }

        user.balance += user.earningWallet;
        user.earningWallet = 0;

        res.json({
            success: true,
            newBalance: user.balance,
            earningWallet: 0
        });

    } catch (error) {
        res.status(500).json({ error: 'Transfer failed' });
    }
});

// جلب اللوادر بورد
app.get('/api/leaderboard/:type', (req, res) => {
    try {
        const type = req.params.type;
        const data = leaderboardData[type] || [];
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

// المطالبة بمهمة
app.post('/api/claim-task', (req, res) => {
    try {
        const { initData, taskId } = req.body;
        
        if (!validateTelegramInitData(initData)) {
            return res.status(401).json({ error: 'Invalid security signature' });
        }

        const telegramUser = parseTelegramUser(initData);
        if (!telegramUser?.id) {
            return res.status(400).json({ error: 'Invalid user data' });
        }

        const userId = telegramUser.id.toString();
        const user = users.get(userId);
        const task = config.tasks[taskId];
        
        if (!user || !task) {
            return res.status(404).json({ error: 'User or task not found' });
        }

        if (user.completedTasks[taskId]) {
            return res.status(400).json({ error: 'Task already claimed' });
        }

        // منح المكافأة
        user.balance += task.reward;
        user.completedTasks[taskId] = true;

        res.json({
            success: true,
            reward: task.reward,
            newBalance: user.balance
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to claim task' });
    }
});

// إبدأ السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 TON Rewards Backend running on port ${PORT}`);
});
