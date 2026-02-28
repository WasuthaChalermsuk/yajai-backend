const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = 'YOUR_SUPER_SECRET_KEY'; // เปลี่ยนเป็นรหัสลับของคุณ

// ฐานข้อมูลจำลอง (ในงานจริงควรใช้ MongoDB)
let users = []; 
let meds = []; 

// Middleware ตรวจสอบ Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- ระบบ User ---
app.post('/api/register', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = { username: req.body.username, password: hashedPassword };
    users.push(user);
    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ' });
});

app.post('/api/login', async (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (!user || !await bcrypt.compare(req.body.password, user.password)) {
        return res.status(400).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const token = jwt.sign({ username: user.username }, SECRET_KEY);
    res.json({ token, username: user.username });
});

// --- ระบบจัดการยา (แยกตามเจ้าของ) ---

// 1. ดึงยา (เฉพาะของตัวเอง)
app.get('/api/meds', authenticateToken, (req, res) => {
    const userMeds = meds.filter(m => m.owner === req.user.username);
    res.json(userMeds);
});

// 2. เพิ่มยา (บันทึกชื่อเจ้าของด้วย)
app.post('/api/meds', authenticateToken, (req, res) => {
    const newMed = {
        id: Date.now(),
        name: req.body.name,
        time: req.body.time,
        status: 'ยังไม่ได้กิน',
        owner: req.user.username // ✨ เก็บว่าใครเป็นเจ้าของ
    };
    meds.push(newMed);
    res.status(201).json({ medicine: newMed });
});

// 3. อัปเดตสถานะ (ต้องเป็นเจ้าของถึงจะแก้ได้)
app.put('/api/meds/:id', authenticateToken, (req, res) => {
    const med = meds.find(m => m.id === parseInt(req.params.id) && m.owner === req.user.username);
    if (med) {
        med.status = 'กินแล้ว 💖';
        res.json(med);
    } else {
        res.status(404).send('ไม่พบรายการยา');
    }
});

// 4. ลบยา (ต้องเป็นเจ้าของถึงลบได้)
app.delete('/api/meds/:id', authenticateToken, (req, res) => {
    meds = meds.filter(m => !(m.id === parseInt(req.params.id) && m.owner === req.user.username));
    res.status(204).send();
});

// --- ระบบ LINE Notification ---
app.post('/api/notify', authenticateToken, async (req, res) => {
    const { message } = req.body;
    const LINE_ACCESS_TOKEN = 'IuQUck2cNlkrqT+RB5t9kJGS99ZLVYrHBTmNrviYtbOcld4901JTTwst1PrCsgbJt05J+45lyuySm/ZJx4hk1z4ZdjGdOhyI8Om3YyBwIbwJaiaR7fAV7LMti2QcHv8sBYqHM+qi39dA6mjK7AxDmgdB04t89/1O/w1cDnyilFU=';
    const LINE_USER_ID = 'Ua5418ecc9ae9eb2fa5d7a1ad6ec46359';

    try {
        await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                to: LINE_USER_ID,
                messages: [{ type: 'text', text: message }]
            })
        });
        res.json({ message: 'ส่ง LINE สำเร็จ' });
    } catch (error) {
        res.status(500).send('Error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));