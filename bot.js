const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const fs = require('fs');

const TOKEN = '8746894087:AAHmdTT-2GMK0YnAcHLymSrUow5nKGukd3Q';
const ADMIN_IDS = [6183869749];

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();

app.use(express.json());
app.use(express.static('public'));

// قاعدة بيانات
let db = { users: {}, transactions: [] };
const DB_FILE = 'data.json';

if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) {}
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
}

function getUser(userId, firstName, username) {
    if (!db.users[userId]) {
        db.users[userId] = {
            id: userId,
            name: firstName,
            username: username || '',
            balance: 0,
            created: new Date().toISOString()
        };
        db.transactions.push({
            userId: userId,
            type: 'create',
            amount: 0,
            desc: 'إنشاء الحساب',
            date: new Date().toISOString()
        });
        saveDB();
    }
    return db.users[userId];
}

app.get('/api/user', (req, res) => {
    const user = db.users[req.query.user_id];
    if (!user) return res.json({ success: false });
    res.json({ success: true, user: { user_id: user.id, first_name: user.name, balance: user.balance, created_at: user.created } });
});

app.get('/api/transactions', (req, res) => {
    const tx = db.transactions.filter(t => t.userId == req.query.user_id).reverse().slice(0, 10);
    res.json({ success: true, transactions: tx });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OK port ' + PORT));

let WEB_APP_URL = process.env.RAILWAY_PUBLIC_URL || 'https://xxx.up.railway.app';

bot.onText(/\/start/, (msg) => {
    const user = getUser(msg.from.id, msg.from.first_name, msg.from.username);
    bot.sendMessage(msg.chat.id, '👋 ' + msg.from.first_name + '\n💰 الرصيد: ' + user.balance, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 فتح التطبيق', web_app: { url: WEB_APP_URL } }],
                [{ text: '💰 رصيدي', callback_data: 'balance' }, { text: '📋 المعاملات', callback_data: 'history' }]
            ]
        }
    });
});

bot.on('callback_query', (q) => {
    if (q.data === 'balance') {
        const u = db.users[q.from.id];
        bot.sendMessage(q.message.chat.id, '💰 ' + (u ? u.balance : 0));
    }
    if (q.data === 'history') {
        const tx = db.transactions.filter(t => t.userId == q.from.id).reverse().slice(0, 5);
        bot.sendMessage(q.message.chat.id, tx.length ? tx.map(t => t.desc + ': ' + t.amount).join('\n') : 'لا توجد');
    }
    bot.answerCallbackQuery(q.id);
});

bot.on('web_app_data', (msg) => {
    try {
        const d = JSON.parse(msg.web_app_data.data);
        if (d.action === 'purchase') {
            const u = db.users[msg.from.id];
            if (!u || u.balance < d.amount) return bot.sendMessage(msg.chat.id, '❌ رصيد غير كافي');
            u.balance -= d.amount;
            db.transactions.push({ userId: msg.from.id, type: 'deduct', amount: -d.amount, desc: d.description, date: new Date().toISOString() });
            saveDB();
            return bot.sendMessage(msg.chat.id, '✅ تم! المتبقي: ' + u.balance);
        }
        bot.sendMessage(msg.chat.id, '✅ ' + d.action);
    } catch(e) {
        bot.sendMessage(msg.chat.id, '❌ خطأ');
    }
});

bot.onText(/\/addbalance (.+)/, (msg, match) => {
    if (!ADMIN_IDS.includes(msg.from.id)) return;
    const p = match[1].split(' ');
    const u = db.users[parseInt(p[0])];
    if (!u) return bot.sendMessage(msg.chat.id, '❌ مستخدم غير موجود');
    u.balance += parseFloat(p[1]);
    db.transactions.push({ userId: parseInt(p[0]), type: 'add', amount: parseFloat(p[1]), desc: 'إضافة', date: new Date().toISOString() });
    saveDB();
    bot.sendMessage(msg.chat.id, '✅ الرصيد: ' + u.balance);
});

console.log('READY');
