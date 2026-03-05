const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const cron = require('node-cron'); // ระบบตั้งเวลา

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = 'yajai-secret-key'; 

// 1. เชื่อมต่อ MongoDB
const MONGO_URI = 'mongodb+srv://wasuthachalermsuk_db_user:elKL8IjIOaUYYFAl@cluster0.i4iresm.mongodb.net/yajai?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB! (YaJai Database)'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 2. สร้างโครงสร้าง Database
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const MedSchema = new mongoose.Schema({
    name: String,
    time: String,
    meal: { type: String, default: 'เช้า' }, // ✨ เพิ่มหมวดหมู่มื้ออาหาร
    status: { type: String, default: 'ยังไม่ได้กิน' },
    owner: String
});
const Med = mongoose.model('Med', MedSchema);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Forbidden' });
        req.user = user;
        next();
    });
};

// ================= API ROUTES =================

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'มีชื่อผู้ใช้นี้แล้ว' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        const token = jwt.sign({ username }, SECRET_KEY);
        res.status(201).json({ token, username });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !await bcrypt.compare(password, user.password)) return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
        const token = jwt.sign({ username }, SECRET_KEY);
        res.json({ token, username });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        if (req.user.username !== 'admin') return res.status(403).json({ message: 'ไม่มีสิทธิ์' });
        const usersList = await User.find({ username: { $ne: 'admin' } }).select('username');
        res.json(usersList.map(u => u.username));
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/meds', authenticateToken, async (req, res) => {
    try {
        let meds = req.user.username === 'admin' ? await Med.find() : await Med.find({ owner: req.user.username }); 
        res.json(meds.map(m => ({ id: m._id.toString(), name: m.name, time: m.time, meal: m.meal || 'เช้า', status: m.status, owner: m.owner })));
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/meds', authenticateToken, async (req, res) => {
    try {
        const newMed = new Med({
            name: req.body.name, time: req.body.time, meal: req.body.meal || 'เช้า', // ✨ รับค่ามื้อ
            status: 'ยังไม่ได้กิน', owner: req.body.patientName || req.user.username
        });
        await newMed.save(); 
        res.status(201).json({ medicine: { id: newMed._id.toString(), name: newMed.name, time: newMed.time, meal: newMed.meal, status: newMed.status, owner: newMed.owner } });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// ✨ 🟢 API สำหรับแก้ไขยา (Admin)
app.put('/api/meds/edit/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.username !== 'admin') return res.status(403).json({ message: 'ไม่มีสิทธิ์' });
        const { name, time, meal } = req.body;
        const updatedMed = await Med.findByIdAndUpdate(req.params.id, { name, time, meal }, { new: true });
        res.json({ id: updatedMed._id.toString(), name: updatedMed.name, time: updatedMed.time, meal: updatedMed.meal, status: updatedMed.status, owner: updatedMed.owner });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.put('/api/meds/:id', authenticateToken, async (req, res) => {
    try {
        const med = await Med.findById(req.params.id);
        if (med && (med.owner === req.user.username || req.user.username === 'admin')) {
            med.status = 'กินแล้ว 💖'; await med.save(); res.json(med);
        } else { res.status(404).json({ message: 'ไม่พบรายการยา' }); }
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.put('/api/meds/reset/all', authenticateToken, async (req, res) => {
    try {
        if (req.user.username !== 'admin') return res.status(403).json({ message: 'ไม่มีสิทธิ์' });
        await Med.updateMany({}, { status: 'ยังไม่ได้กิน' });
        res.json({ message: 'รีเซ็ตสำเร็จ' });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/meds/:id', authenticateToken, async (req, res) => {
    try {
        await Med.findOneAndDelete({ _id: req.params.id }); res.status(204).send();
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/notify', authenticateToken, async (req, res) => {
    const { message } = req.body;
    const LINE_ACCESS_TOKEN = 'IuQUck2cNlkrqT+RB5t9kJGS99ZLVYrHBTmNrviYtbOcld4901JTTwst1PrCsgbJt05J+45lyuySm/ZJx4hk1z4ZdjGdOhyI8Om3YyBwIbwJaiaR7fAV7LMti2QcHv8sBYqHM+qi39dA6mjK7AxDmgdB04t89/1O/w1cDnyilFU=';
    const LINE_USER_ID = 'Ua5418ecc9ae9eb2fa5d7a1ad6ec46359';
    try {
        await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
            body: JSON.stringify({ to: LINE_USER_ID, messages: [{ type: 'text', text: message }] })
        });
        res.json({ message: 'ส่ง LINE สำเร็จ' });
    } catch (error) { res.status(500).send('Error'); }
});

// ⏰ ระบบรีเซ็ตยาอัตโนมัติทุกๆ เที่ยงคืน
cron.schedule('0 0 * * *', async () => {
    try {
        await Med.updateMany({}, { status: 'ยังไม่ได้กิน' });
        console.log('✅ รีเซ็ตสถานะยาทุกรายการสำเร็จ (Midnight Reset)');
    } catch (error) { console.error('❌ Error cron:', error); }
}, { scheduled: true, timezone: "Asia/Bangkok" });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));