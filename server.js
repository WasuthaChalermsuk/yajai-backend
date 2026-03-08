const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const cron = require('node-cron'); 
const webpush = require('web-push');

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: '*' } 
});


app.use(cors());
app.use(express.json({ limit: '10mb' })); 

const SECRET_KEY = 'yajai-secret-key'; 

// ✨ อย่าลืมใส่ Token และ ID ของคุณ!
const LINE_ACCESS_TOKEN = 'IuQUck2cNlkrqT+RB5t9kJGS99ZLVYrHBTmNrviYtbOcld4901JTTwst1PrCsgbJt05J+45lyuySm/ZJx4hk1z4ZdjGdOhyI8Om3YyBwIbwJaiaR7fAV7LMti2QcHv8sBYqHM+qi39dA6mjK7AxDmgdB04t89/1O/w1cDnyilFU='; 
const LINE_TARGET_ID = 'Ua5418ecc9ae9eb2fa5d7a1ad6ec46359'; 

const publicVapidKey = 'BOSDiwWnjtEkd-PimXzb_PeyTJpX1J9KARBfm_mYwVDLL-3oJ8wBU2Vvwce4FTRHl1dDokD0096qeSlcJbSeE88';
const privateVapidKey = 'wgjABXeHHgmfh_GuvWjRDX5p1doMaa95IZ50IVWqjRo';
webpush.setVapidDetails('mailto:admin@yajai.com', publicVapidKey, privateVapidKey);

const MONGO_URI = 'mongodb+srv://wasuthachalermsuk_db_user:elKL8IjIOaUYYFAl@cluster0.i4iresm.mongodb.net/yajai?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).then(() => console.log('✅ Connected to MongoDB!'));

const User = mongoose.model('User', new mongoose.Schema({ username: { type: String, required: true, unique: true }, password: { type: String, required: true } }));
const Med = mongoose.model('Med', new mongoose.Schema({ name: String, time: String, meal: { type: String, default: 'เช้า' }, status: { type: String, default: 'ยังไม่ได้กิน' }, owner: String, stock: { type: Number, default: 30 }, imageUrl: { type: String, default: '' } }));
const History = mongoose.model('History', new mongoose.Schema({ date: String, owner: String, total: Number, taken: Number, percent: Number }));
const Sub = mongoose.model('Sub', new mongoose.Schema({ username: String, sub: Object }));


const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => { if (err) return res.sendStatus(403); req.user = user; next(); });
};

// ✨ เพิ่มตารางเก็บข้อความแชท
const Message = mongoose.model('Message', new mongoose.Schema({ 
    sender: String, 
    receiver: String, 
    text: String, 
    image: String, // ✨ เพิ่มฟิลด์นี้สำหรับเก็บ Base64 ของรูป
    timestamp: { type: Date, default: Date.now } 
}));

// แก้ไข Route ส่งข้อความ (ประมาณบรรทัดที่ 84)


// ✨ ตารางเก็บสมุดบันทึกอาการรายวัน
const Diary = mongoose.model('Diary', new mongoose.Schema({ 
    owner: String, 
    note: String, 
    timestamp: { type: Date, default: Date.now } 
}));

const sendLineMessage = async (textMsg) => {
    if (!LINE_ACCESS_TOKEN || LINE_TARGET_ID === 'ใส่_USER_ID_หรือ_GROUP_ID_ตรงนี้') return;
    try {
        await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
            body: JSON.stringify({ to: LINE_TARGET_ID, messages: [{ type: 'text', text: textMsg }] })
        });
    } catch (err) { console.error('❌ LINE Bot Push Error:', err); }
};

io.on('connection', (socket) => {
    console.log('⚡ มีคนเชื่อมต่อ Socket.IO เข้ามาแล้ว! ID:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('❌ มีคนปิดเว็บออกไป');
    });
});

app.post('/api/messages', authenticateToken, async (req, res) => {
    const { receiver, text, image } = req.body; 
    
    // 1. บันทึกลง Database
    const newMsg = new Message({ 
        sender: req.user.username, 
        receiver, 
        text, 
        image 
    });
    await newMsg.save();

    // 2. ✨ ตะโกนบอกหน้าเว็บให้โหลดแชทใหม่ทันที (Socket.IO)
    io.emit('chatUpdated');

    // 3. จัดการแจ้งเตือน (ถ้าคนไข้ส่งหาแอดมิน)
    if (req.user.username !== 'admin' && receiver === 'admin') {
        
        // --- ส่วนของ LINE Bot ---
        let lineNotifyText = `💬 แชทจาก ${req.user.username}:\n"${text || ''}"`;
        if (image) lineNotifyText += `\n🖼️ [ส่งรูปภาพมาด้วย]`;
        await sendLineMessage(lineNotifyText);

        // --- ส่วนของ Web Push (เด้งเตือนในคอมแอดมิน) ---
        try {
            const adminSub = await Sub.findOne({ username: 'admin' });
            if (adminSub && adminSub.sub) {
                let pushBody = text || 'ส่งรูปภาพมาให้คุณ 🖼️'; // ถ้าส่งแต่รูป ไม่มีข้อความ ให้ขึ้นเตือนแบบนี้
                await webpush.sendNotification(adminSub.sub, JSON.stringify({ 
                    title: `แชทใหม่จาก ${req.user.username}`, 
                    body: pushBody 
                }));
            }
        } catch(err) { console.log('Push chat err', err); }
    }

    res.status(201).json(newMsg);
});


app.post('/api/webhook', async (req, res) => {
    const events = req.body.events;
    if (events && events.length > 0) {
        for (const event of events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const sourceId = event.source.groupId || event.source.userId;
                try {
                    await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
                        body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text: `สวัสดี! นี่คือ ID ของคุณครับ 👇\n\n${sourceId}` }] })
                    });
                } catch (err) { console.error('Reply error:', err); }
            }
        }
    }
    res.sendStatus(200);
});


// ================= API ROUTES (แชท) =================
// ✨ ดึงแชท
app.get('/api/messages/:target', authenticateToken, async (req, res) => {
    const u1 = req.user.username; 
    const u2 = req.params.target;
    const msgs = await Message.find({ $or: [{ sender: u1, receiver: u2 }, { sender: u2, receiver: u1 }] }).sort({ timestamp: 1 });
    res.json(msgs);
});


// ================= API ROUTES (ระบบเดิม) =================
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (await User.findOne({ username })) return res.status(400).json({ message: 'มีชื่อผู้ใช้นี้แล้ว' });
    await new User({ username, password: await bcrypt.hash(password, 10) }).save();
    io.emit('patientsUpdated');
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
    res.json(meds.map(m => ({ id: m._id.toString(), name: m.name, time: m.time, meal: m.meal || 'เช้า', status: m.status, owner: m.owner, stock: m.stock, imageUrl: m.imageUrl })));
});

app.post('/api/meds', authenticateToken, async (req, res) => {
    const newMed = new Med({ name: req.body.name, time: req.body.time, meal: req.body.meal || 'เช้า', status: 'ยังไม่ได้กิน', owner: req.body.patientName || req.user.username, stock: req.body.stock || 30, imageUrl: req.body.imageUrl || '' });
    await newMed.save(); 
    io.emit('medsUpdated');
    try {
        const userSub = await Sub.findOne({ username: newMed.owner });
        if (userSub && userSub.sub) { await webpush.sendNotification(userSub.sub, JSON.stringify({ title: 'YaJai 💊', body: `คุณหมอสั่งยาใหม่: ${newMed.name}` })); }
    } catch(err) { console.log('Push Alert Error:', err); }
    res.status(201).json({ medicine: { id: newMed._id.toString(), name: newMed.name, time: newMed.time, meal: newMed.meal, status: newMed.status, owner: newMed.owner, stock: newMed.stock, imageUrl: newMed.imageUrl } });
});

app.put('/api/meds/edit/:id', authenticateToken, async (req, res) => {
    const updatedMed = await Med.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    res.json({ id: updatedMed._id.toString(), name: updatedMed.name, time: updatedMed.time, meal: updatedMed.meal, status: updatedMed.status, owner: updatedMed.owner, stock: updatedMed.stock, imageUrl: updatedMed.imageUrl });
});

app.put('/api/meds/:id', authenticateToken, async (req, res) => {
    const med = await Med.findById(req.params.id);
    if (med && (med.owner === req.user.username || req.user.username === 'admin')) { 
        med.status = 'กินแล้ว 💖'; 
        if (med.stock > 0) med.stock -= 1; 
        await med.save(); 
        io.emit('medsUpdated');
        let lineMessage = `✅ คุณ ${med.owner} กินยา "${med.name}" เรียบร้อยแล้วครับ (เหลือ ${med.stock} เม็ด) 💖`;
        try {
            const adminSub = await Sub.findOne({ username: 'admin' });
            if (adminSub && adminSub.sub) {
                let alertMsg = `คุณ ${med.owner} กินยา ${med.name} แล้วครับ 💖`;
                let alertTitle = '✅ กินยาเรียบร้อย!';
                if (med.stock <= 5) {
                    alertTitle = '🚨 ยาใกล้หมดแล้ว!';
                    alertMsg += `\n⚠️ ด่วน! ยาเหลือแค่ ${med.stock} เม็ด!`;
                    lineMessage += `\n\n🚨 คำเตือน: ยาใกล้หมดแล้ว! (เหลือ ${med.stock} เม็ด) ผู้ดูแลเตรียมไปรับยาด้วยครับ!`;
                }
                await webpush.sendNotification(adminSub.sub, JSON.stringify({ title: alertTitle, body: alertMsg }));
            }
        } catch(err) {}
        await sendLineMessage(lineMessage);
        res.json(med); 
    } else res.sendStatus(404);
});

app.put('/api/meds/reset/all', authenticateToken, async (req, res) => { await Med.updateMany({}, { status: 'ยังไม่ได้กิน' }); res.json({ message: 'รีเซ็ตสำเร็จ' }); });
app.delete('/api/meds/:id', authenticateToken, async (req, res) => { await Med.findOneAndDelete({ _id: req.params.id });
io.emit('medsUpdated'); res.sendStatus(204); });

app.get('/api/history', authenticateToken, async (req, res) => { res.json(req.user.username === 'admin' ? await History.find().sort({ _id: -1 }).limit(50) : await History.find({ owner: req.user.username }).sort({ _id: -1 }).limit(14)); });

app.post('/api/call-admin', authenticateToken, async (req, res) => {
    try {
        await sendLineMessage(`🚨 ด่วน! คุณ ${req.user.username} กดปุ่มเรียกหาผู้ดูแลครับ! รีบไปดูหน่อยน้า`);
        res.json({ message: 'Success' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

cron.schedule('* * * * *', async () => {
    try {
        
        const options = { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false };
        const currentTime = new Intl.DateTimeFormat('en-US', options).format(new Date());

        
        const medsToTake = await Med.find({ time: currentTime, status: 'ยังไม่ได้กิน' });

        for (let med of medsToTake) {
            
            const userSub = await Sub.findOne({ username: med.owner });
            if (userSub && userSub.sub) {
                const payload = JSON.stringify({ 
                    title: '⏰ ถึงเวลากินยาแล้วครับ!', 
                    body: `คุณ ${med.owner} อย่าลืมทานยา "${med.name}" (${med.meal}) นะครับ 💊` 
                });
                // ส่ง Push แจ้งเตือน
                await webpush.sendNotification(userSub.sub, payload).catch(err => console.log('Push Error:', err));
            }

            // 4. (แถม) ส่งแจ้งเตือนเข้า LINE กลุ่มด้วย เพื่อให้ผู้ดูแลรู้
            await sendLineMessage(`⏰ แจ้งเตือน: ถึงเวลากินยา "${med.name}" ของคุณ ${med.owner} แล้วครับ!`);
        }
    } catch (err) {
        console.error('Error in Reminder Cron:', err);
    }
});


cron.schedule('* * * * *', async () => {
    console.log("กำลังสรุปผลการกินยา...");
    const today = new Date().toLocaleDateString('th-TH');
    const users = await User.find({ username: { $ne: 'admin' } });

    for (let user of users) {
        const meds = await Med.find({ owner: user.username });
        if (meds.length === 0) continue; 

        const total = meds.length;
        const taken = meds.filter(m => m.status.includes('กินแล้ว')).length;
        const percent = Math.round((taken / total) * 100);

        await History.findOneAndUpdate(
            { owner: user.username, date: today },
            { owner: user.username, date: today, total, taken, percent },
            { upsert: true, new: true }
        );
    }
    console.log("✅ สรุปผลเรียบร้อย!");
});


// ================= API ROUTES (สมุดบันทึกอาการ) =================
app.post('/api/diaries', authenticateToken, async (req, res) => {
    const newNote = new Diary({ owner: req.user.username, note: req.body.note });
    await newNote.save();
    // แจ้งเตือนแอดมินเวลามีคนไข้บ่นอาการ
    await sendLineMessage(`📓 คุณ ${req.user.username} บันทึกอาการใหม่:\n"${req.body.note}"`);
    res.status(201).json(newNote);
});

app.get('/api/diary/:target', authenticateToken, async (req, res) => {
    const target = req.user.username === 'admin' ? req.params.target : req.user.username;

    let query = {}; 
    if (target !== 'all') {
        query.owner = target; 
    }

    const notes = await Diary.find(query).sort({ timestamp: -1 });
    res.json(notes);
});


const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));