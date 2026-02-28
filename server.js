require('dotenv').config(); // เรียกใช้ไฟล์ซ่อนรหัสผ่าน
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// 1. เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จ!'))
  .catch((err) => console.log('❌ เชื่อมต่อฐานข้อมูลล้มเหลว:', err));

// 2. สร้างโครงสร้างข้อมูลยา (Schema & Model)
const medicineSchema = new mongoose.Schema({
    name: String,
    time: String,
    status: { type: String, default: 'ยังไม่ได้กิน' }
});

// แปลง _id ของ MongoDB ให้เป็น id ธรรมดา เพื่อให้ Frontend ตัวเดิมใช้งานได้เลย
medicineSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});

const Medicine = mongoose.model('Medicine', medicineSchema);

// --- 3. สร้าง API (CRUD) ---

// ดึงข้อมูลยาทั้งหมด (Read)
app.get('/api/meds', async (req, res) => {
    try {
        const meds = await Medicine.find();
        res.json(meds);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// เพิ่มยาใหม่ (Create)
app.post('/api/meds', async (req, res) => {
    try {
        const newMedicine = new Medicine({
            name: req.body.name,
            time: req.body.time,
            status: 'ยังไม่ได้กิน'
        });
        const savedMedicine = await newMedicine.save();
        res.json({ message: 'เพิ่มยาสำเร็จ!', medicine: savedMedicine });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// อัปเดตสถานะการกินยา (Update)
app.put('/api/meds/:id', async (req, res) => {
    try {
        const updatedMed = await Medicine.findByIdAndUpdate(
            req.params.id, 
            { status: 'กินแล้ว 💖' }, 
            { new: true } // ให้ส่งข้อมูลที่อัปเดตแล้วกลับมา
        );
        res.json({ message: 'อัปเดตสถานะสำเร็จ!', medicine: updatedMed });
    } catch (error) {
        res.status(404).json({ message: 'ไม่พบข้อมูลยานี้' });
    }
});
// ลบรายการยา (Delete)
app.delete('/api/meds/:id', async (req, res) => {
    try {
        await Medicine.findByIdAndDelete(req.params.id);
        res.json({ message: 'ลบยาสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

app.listen(3000, () => {
    console.log('Backend วิ่งอยู่ที่ http://localhost:3000');
});