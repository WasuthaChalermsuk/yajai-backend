require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จ!'))
  .catch((err) => console.log('❌ เชื่อมต่อฐานข้อมูลล้มเหลว:', err));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const medicineSchema = new mongoose.Schema({
    name: String,
    time: String,
    status: { type: String, default: 'ยังไม่ได้กิน' },
    userId: { type: String, required: true }
});

medicineSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});
const Medicine = mongoose.model('Medicine', medicineSchema);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ message: 'กรุณาล็อกอิน' });

    jwt.verify(token, process.env.JWT_SECRET || 'yajai-secret-key', (err, user) => {
        if (err) return res.status(403).json({ message: 'ตั๋วหมดอายุหรือไม่ถูกต้อง' });
        req.user = user;
        next();
    });
};

app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const newUser = new User({ username: req.body.username, password: hashedPassword });
        await newUser.save();
        res.json({ message: 'สมัครสมาชิกสำเร็จ!' });
    } catch (error) {
        res.status(400).json({ message: 'สมัครล้มเหลว (ชื่อผู้ใช้อาจซ้ำ)' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });
        if (!user) return res.status(400).json({ message: 'ไม่พบชื่อผู้ใช้นี้' });

        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'yajai-secret-key', { expiresIn: '1d' });
        res.json({ message: 'เข้าสู่ระบบสำเร็จ!', token: token, username: user.username });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
    }
});

app.get('/api/meds', authenticateToken, async (req, res) => {
    try {
        const meds = await Medicine.find({ userId: req.user.id });
        res.json(meds);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

app.post('/api/meds', authenticateToken, async (req, res) => {
    try {
        const newMedicine = new Medicine({
            name: req.body.name,
            time: req.body.time,
            status: 'ยังไม่ได้กิน',
            userId: req.user.id
        });
        const savedMedicine = await newMedicine.save();
        res.json({ message: 'เพิ่มยาสำเร็จ!', medicine: savedMedicine });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

app.put('/api/meds/:id', authenticateToken, async (req, res) => {
    try {
        const updatedMed = await Medicine.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { status: 'กินแล้ว 💖' }, 
            { new: true }
        );
        res.json({ message: 'อัปเดตสถานะสำเร็จ!', medicine: updatedMed });
    } catch (error) {
        res.status(404).json({ message: 'ไม่พบข้อมูลยานี้' });
    }
});

app.delete('/api/meds/:id', authenticateToken, async (req, res) => {
    try {
        await Medicine.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.json({ message: 'ลบยาสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

// ✨ ฟีเจอร์ใหม่: รีเซ็ตสถานะยาทุกตัวของ User ให้เป็น "ยังไม่ได้กิน"
app.put('/api/meds-reset', authenticateToken, async (req, res) => {
    try {
        await Medicine.updateMany(
            { userId: req.user.id }, 
            { $set: { status: 'ยังไม่ได้กิน' } }
        );
        res.json({ message: 'รีเซ็ตข้อมูลสำหรับวันใหม่เรียบร้อย!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการรีเซ็ตข้อมูล' });
    }
});

app.listen(3000, () => {
    console.log('Backend วิ่งอยู่ที่ http://localhost:3000');
});