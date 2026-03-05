const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const cron = require('node-cron'); 
const webpush = require('web-push');

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = 'yajai-secret-key'; 

// ✨ 1. ใส่ Channel Access Token ของบอท YaJai ตรงนี้
const LINE_ACCESS_TOKEN = 'IuQUck2cNlkrqT+RB5t9kJGS99ZLVYrHBTmNrviYtbOcld4901JTTwst1PrCsgbJt05J+45lyuySm/ZJx4hk1z4ZdjGdOhyI8Om3YyBwIbwJaiaR7fAV7LMti2QcHv8sBYqHM+qi39dA6mjK7AxDmgdB04t89/1O/w1cDnyilFU=';
// ✨ 2. ตอนแรกปล่อยว่างไว้ก่อน เดี๋ยวเราค่อยมาเติมหลังจากได้ ID จาก Webhook แล้ว
const LINE_TARGET_ID = 'ใส่_USER_ID_หรือ_GROUP_ID_ตรงนี้'; 

const publicVapidKey = 'BOSDiwWnjtEkd-PimXzb_PeyTJpX1J9KARBfm_mYwVDLL-3oJ8wBU2Vvwce4FTRHl1dDokD0096qeSlcJbSeE88';
const privateVapidKey = 'wgjABXeHHgmfh_GuvWjRDX5p1doMaa95IZ50IVWqjRo';
webpush.setVapidDetails('mailto:admin@yajai.com', publicVapidKey, privateVapidKey);

const MONGO_URI = 'mongodb+srv://wasuthachalermsuk_db_user:elKL8IjIOaUYYFAl@cluster0.i4iresm.mongodb.net/yajai?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).then(() => console.log('✅ Connected to MongoDB!'));

const User = mongoose.model('User', new mongoose.Schema({ username: { type: String, required: true, unique: true }, password: { type: String, required: true } }));
const Med = mongoose.model('Med', new mongoose.Schema({ name: String, time: String, meal: { type: String, default: 'เช้า' }, status: { type: String, default: 'ยังไม่ได้กิน' }, owner: String, stock: { type: Number, default: 30 } }));
const History = mongoose.model('History', new mongoose.Schema({ date: String, owner: String, total: Number, taken: Number, percent: Number }));
const Sub = mongoose.model('Sub', new mongoose.Schema({ username: String, sub: Object }));

// ✨ ฟังก์ชันสำหรับส่งข้อความผ่าน LINE Messaging API
const sendLineMessage = async (textMsg) => {
    if (!LINE_ACCESS_TOKEN || LINE_TARGET_ID === 'ใส่_USER_ID_หรือ_GROUP_ID_ตรงนี้') return;
    try {
        await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                to: LINE_TARGET_ID,
                messages: [{ type: 'text', text: textMsg }]
            })
        });
    } catch (err) { console.error('❌ LINE Bot Push Error:', err); }
};

// ================= API ROUTES =================

// ✨ สร้าง Webhook ไว้รับข้อความจากผู้ใช้ เพื่อดึง User ID หรือ Group ID
app.post('/api/webhook', async (req, res) => {
    const events = req.body.events;
    if (events && events.length > 0) {
        for (const event of events) {
            if (event.type === 'message' && event.message.type === 'text') {
                // เช็คว่าเป็นข้อความจากแชทส่วนตัว หรือจากกลุ่ม
                const sourceId = event.source.groupId || event.source.userId;
                
                // ให้บอทตอบกลับเพื่อบอก ID กับคุณ
                try {
                    await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
                        body: JSON.stringify({
                            replyToken: event.replyToken,
                            messages: [
                                { type: 'text', text: `สวัสดี! นี่คือ ID สำหรับส่งข้อความของคุณครับ 👇\n\n${sourceId}\n\nเอาไอดีนี้ไปใส่ในไฟล์ server.js ตรง LINE_TARGET_ID ได้เลยครับ!` }
                            ]
                        })
                    });
                } catch (err) { console.error('Reply error:', err); }
            }
        }
    }
    res.sendStatus(200);
});

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => { if (err) return res.sendStatus(403); req.user = user; next(); });
};

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (await User.findOne({ username })) return res.status(400).json({ message: 'มีชื่อผู้ใช้นี้แล้ว' });
    await new User({ username, password: await bcrypt.hash(password, 10) }).save();
    res.status(201).json({ token: jwt.sign({ username }, SECRET_KEY), username });
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (!user || !await bcrypt.compare(req.body.password, user.password)) return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
    res.json({ token: jwt.sign({ username: user.username }, SECRET_KEY), username: user.username });
});

app.post('/api/subscribe', authenticateToken, async (req, res) => {
    await Sub.findOneAndUpdate({ username: req.user.username }, { username: req.user.username, sub: req.body }, { upsert: true });
    res.status(201).json({ message: 'Subscribed' });
});

app.get('/api/users', authenticateToken, async (req, res) => {
    if (req.user.username !== 'admin') return res.sendStatus(403);
    res.json((await User.find({ username: { $ne: 'admin' } }).select('username')).map(u => u.username));
});

app.get('/api/meds', authenticateToken, async (req, res) => {
    let meds = req.user.username === 'admin' ? await Med.find() : await Med.find({ owner: req.user.username }); 
    res.json(meds.map(m => ({ id: m._id.toString(), name: m.name, time: m.time, meal: m.meal || 'เช้า', status: m.status, owner: m.owner, stock: m.stock })));
});

app.post('/api/meds', authenticateToken, async (req, res) => {
    const newMed = new Med({ name: req.body.name, time: req.body.time, meal: req.body.meal || 'เช้า', status: 'ยังไม่ได้กิน', owner: req.body.patientName || req.user.username, stock: req.body.stock || 30 });
    await newMed.save(); 

    try {
        const userSub = await Sub.findOne({ username: newMed.owner });
        if (userSub && userSub.sub) {
            const payload = JSON.stringify({ title: 'YaJai 💊', body: `คุณหมอสั่งยาใหม่: ${newMed.name} (มื้อ${newMed.meal})` });
            await webpush.sendNotification(userSub.sub, payload);
        }
    } catch(err) { console.log('Push Alert Error:', err); }

    res.status(201).json({ medicine: { id: newMed._id.toString(), name: newMed.name, time: newMed.time, meal: newMed.meal, status: newMed.status, owner: newMed.owner, stock: newMed.stock } });
});

app.put('/api/meds/edit/:id', authenticateToken, async (req, res) => {
    const updatedMed = await Med.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    res.json({ id: updatedMed._id.toString(), name: updatedMed.name, time: updatedMed.time, meal: updatedMed.meal, status: updatedMed.status, owner: updatedMed.owner, stock: updatedMed.stock });
});

app.put('/api/meds/:id', authenticateToken, async (req, res) => {
    const med = await Med.findById(req.params.id);
    if (med && (med.owner === req.user.username || req.user.username === 'admin')) { 
        med.status = 'กินแล้ว 💖'; 
        
        if (med.stock > 0) med.stock -= 1; 
        await med.save(); 
        
        // ✨ ส่งข้อความเข้า LINE บอท
        let lineMessage = `✅ คุณ ${med.owner} กินยา "${med.name}" เรียบร้อยแล้วครับ (เหลือ ${med.stock} เม็ด) 💖`;
        
        try {
            const adminSub = await Sub.findOne({ username: 'admin' });
            if (adminSub && adminSub.sub) {
                let alertMsg = `คุณ ${med.owner} กินยา ${med.name} (มื้อ${med.meal || 'เช้า'}) แล้วครับ 💖`;
                let alertTitle = '✅ กินยาเรียบร้อย!';

                if (med.stock <= 5) {
                    alertTitle = '🚨 ยาใกล้หมดแล้ว!';
                    alertMsg += `\n⚠️ ด่วน! ยาเหลือแค่ ${med.stock} เม็ด ต้องเตรียมไปรับยาเพิ่มแล้วนะ!`;
                    lineMessage += `\n\n🚨 คำเตือน: ยาใกล้หมดแล้ว! (เหลือ ${med.stock} เม็ด) ผู้ดูแลเตรียมไปรับยาด้วยครับ!`;
                }

                const payload = JSON.stringify({ title: alertTitle, body: alertMsg });
                await webpush.sendNotification(adminSub.sub, payload);
            }
        } catch(err) { console.log('Push to Admin Error:', err); }

        await sendLineMessage(lineMessage);
        res.json(med); 
    } 
    else res.sendStatus(404);
});

app.put('/api/meds/reset/all', authenticateToken, async (req, res) => {
    await Med.updateMany({}, { status: 'ยังไม่ได้กิน' }); res.json({ message: 'รีเซ็ตสำเร็จ' });
});

app.delete('/api/meds/:id', authenticateToken, async (req, res) => {
    await Med.findOneAndDelete({ _id: req.params.id }); res.sendStatus(204);
});

app.get('/api/history', authenticateToken, async (req, res) => {
    res.json(req.user.username === 'admin' ? await History.find().sort({ _id: -1 }).limit(50) : await History.find({ owner: req.user.username }).sort({ _id: -1 }).limit(14));
});

app.post('/api/call-admin', authenticateToken, async (req, res) => {
    try {
        await sendLineMessage(`🚨 ด่วน! คุณ ${req.user.username} กดปุ่มเรียกหาผู้ดูแลครับ! รีบไปดูหน่อยน้า`);

        const adminSub = await Sub.findOne({ username: 'admin' });
        if (adminSub && adminSub.sub) {
            const payload = JSON.stringify({ title: '🚨 การแจ้งเตือนจากคนไข้!', body: `คุณ ${req.user.username} กดปุ่มเรียกหาผู้ดูแลครับ` });
            await webpush.sendNotification(adminSub.sub, payload);
        }
        res.json({ message: 'Success' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

cron.schedule('* * * * *', async () => {
    try {
        const bangkokTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
        const hours = String(bangkokTime.getHours()).padStart(2, '0');
        const minutes = String(bangkokTime.getMinutes()).padStart(2, '0');
        const nowTime = `${hours}:${minutes}`;

        const dueMeds = await Med.find({ time: nowTime, status: 'ยังไม่ได้กิน' });

        if (dueMeds.length > 0) {
            for (const med of dueMeds) {
                const userSub = await Sub.findOne({ username: med.owner });
                if (userSub && userSub.sub) {
                    const payload = JSON.stringify({ title: '⏰ ถึงเวลากินยาแล้ว!', body: `ยา: ${med.name} (มื้อ${med.meal || 'เช้า'}) \nรีบกินแล้วเข้าแอปมากด "✅ กินแล้ว" ด้วยนะครับ 💖` });
                    try { await webpush.sendNotification(userSub.sub, payload); } 
                    catch(err) { console.log(`Push Error:`, err); }
                }
            }
        }
    } catch (error) { console.error('Cron Error:', error); }
}, { scheduled: true, timezone: "Asia/Bangkok" });

cron.schedule('0 0 * * *', async () => {
    try {
        const today = new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
        const allMeds = await Med.find();
        const usersMeds = {};
        allMeds.forEach(m => {
            if (!usersMeds[m.owner]) usersMeds[m.owner] = { total: 0, taken: 0 };
            usersMeds[m.owner].total += 1;
            if (m.status === 'กินแล้ว 💖') usersMeds[m.owner].taken += 1;
        });
        for (const owner in usersMeds) {
            const stats = usersMeds[owner];
            await new History({ date: today, owner, total: stats.total, taken: stats.taken, percent: stats.total === 0 ? 0 : Math.round((stats.taken / stats.total) * 100) }).save();
        }
        await Med.updateMany({}, { status: 'ยังไม่ได้กิน' });
        console.log('✅ Midnight Reset Success');
    } catch (error) { console.error('Cron Error:', error); }
}, { scheduled: true, timezone: "Asia/Bangkok" });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));