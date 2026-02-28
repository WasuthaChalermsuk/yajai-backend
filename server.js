const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors()); 
app.use(express.json());

const medicines = [
    { id: 1, name: 'พาราเซตามอล (แก้ปวด)', time: '08:00', status: 'ยังไม่ได้กิน' },
    { id: 2, name: 'วิตามินซี', time: '12:00', status: 'ยังไม่ได้กิน' }
];

app.get('/api/meds', (req, res) => {
    res.json(medicines);
});
// รับคำสั่งจากหน้าบ้าน เพื่ออัปเดตสถานะยา (ใช้ Method PUT)
app.put('/api/meds/:id', (req, res) => {
    // ดึง id ของยาที่ถูกกดส่งมา
    const medId = parseInt(req.params.id);
    
    // ค้นหายาตัวนั้นในระบบ
    const medicine = medicines.find(m => m.id === medId);
    
    if (medicine) {
        // เปลี่ยนสถานะเป็นกินแล้ว
        medicine.status = 'กินแล้ว 💖';
        res.json({ message: 'อัปเดตสถานะสำเร็จ!', medicine });
    } else {
        res.status(404).json({ message: 'ไม่พบข้อมูลยานี้' });
    }
});

// รับคำสั่งเพิ่มยาใหม่ (ใช้ Method POST)
app.post('/api/meds', (req, res) => {
    // รับข้อมูล ชื่อยา และ เวลา ที่ส่งมาจากหน้าบ้าน
    const newMedicine = {
        id: medicines.length + 1, // สร้าง ID ใหม่รันตามลำดับ
        name: req.body.name,
        time: req.body.time,
        status: 'ยังไม่ได้กิน' // ค่าเริ่มต้น
    };
    
    // เอาตัวใหม่ไปต่อท้ายในระบบ
    medicines.push(newMedicine);
    
    // ส่งข้อมูลที่อัปเดตแล้วกลับไปบอกหน้าบ้าน
    res.json({ message: 'เพิ่มยาสำเร็จ!', medicine: newMedicine });
});

app.listen(3000, () => {
    console.log('Backend วิ่งอยู่ที่ http://localhost:3000');
});