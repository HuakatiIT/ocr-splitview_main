const express = require('express');
const mysql = require('mysql2');
const oracledb = require('oracledb');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// --- [ใหม่] Library สำหรับ API Gateway ---
const multer = require('multer');       // รับไฟล์ Upload
const axios = require('axios');         // ยิง Request ไปหา AI Engine
const FormData = require('form-data');  // จัดการ Form Data

const app = express();

app.use(cors());
app.use(bodyParser.json());

// --- [ใหม่] ตั้งค่า Multer ให้เก็บไฟล์ใน Memory เพื่อรอส่งต่อ ---
const upload = multer({ storage: multer.memoryStorage() });

// --- Config Email Sender ---
// (อย่าลืมแก้เป็น Email จริงของคุณถ้าต้องการใช้ระบบ Reset Password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: '*******@gmail.com', 
    pass: '**** **** **** ****'      
  }
});

// Oracle Thin Mode
try { oracledb.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR }); } 
catch (err) { console.log('Oracle Thin Mode Active'); }

oracledb.autoCommit = true;

// --- Config & Keys ---
const CONFIG_FILE = path.join(__dirname, 'db-config.json');
const KEYS_FILE = path.join(__dirname, 'api-keys.json');
const resetTokens = {}; 

const DEFAULT_CONFIG = {
    dbProvider: 'mysql',
    mysqlHost: 'localhost',
    mysqlPort: 3306,
    mysqlUser: 'root',
    mysqlPassword: '123456789', // แก้รหัสผ่าน DB ตามเครื่องคุณ
    mysqlDatabase: 'ocr_users_db',
    oracleHost: 'localhost',
    oraclePort: 1521,
    oracleUser: 'SYSTEM',
    oraclePassword: 'admin123',
    oracleServiceName: 'FREEPDB1',
    // AI Config Default
    apiKey: '',
    baseUrl: 'https://api.opentyphoon.ai/v1',
    model: 'typhoon-ocr',
    taskType: 'default',
    maxTokens: 16000,
    temperature: 0.1,
    topP: 0.6,
    repetitionPenalty: 1.1
};

const getGlobalConfig = () => {
    if (fs.existsSync(CONFIG_FILE)) {
        try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch (e) {}
    }
    return DEFAULT_CONFIG;
};

const saveGlobalConfig = (newConfig) => {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
};

const getApiKeys = () => {
    if (fs.existsSync(KEYS_FILE)) {
        try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch (e) { return []; }
    }
    return [];
};

const saveApiKeys = (keys) => {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
};

// Helper: เชื่อมต่อ Database
const getConnection = async () => {
    const settings = getGlobalConfig();
    const provider = settings.dbProvider || 'mysql';
    // console.log(`[System] Using Database: ${provider.toUpperCase()}`); // ปิด log รกหน้าจอ

    if (provider === 'oracle') {
        return {
            type: 'oracle',
            conn: await oracledb.getConnection({
                user: settings.oracleUser,
                password: settings.oraclePassword,
                connectString: `${settings.oracleHost}:${settings.oraclePort}/${settings.oracleServiceName}`
            })
        };
    } else {
        const connection = mysql.createConnection({
            host: settings.mysqlHost,
            port: settings.mysqlPort,
            user: settings.mysqlUser,
            password: settings.mysqlPassword,
            database: settings.mysqlDatabase
        });
        const promiseConn = {
            query: (sql, params) => new Promise((resolve, reject) => {
                connection.query(sql, params, (err, results) => err ? reject(err) : resolve(results));
            }),
            end: () => connection.end()
        };
        return { type: 'mysql', conn: promiseConn };
    }
};

// ==========================================
// 🔥 [ใหม่] API Gateway สำหรับ OCR 🔥
// ==========================================
// เปลี่ยนจาก /api/process เป็น /v1/ocr ตามโจทย์หัวหน้า
// รับไฟล์ด้วย upload.single('file')

app.post('/v1/ocr', upload.single('file'), async (req, res) => {
    console.log(`\n[API Gateway] Request received at /v1/ocr`);

    // 1. ตรวจสอบ Authorization Header
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ Auth Error: Missing Header');
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const clientApiKey = authHeader.split(' ')[1];
    
    // 2. ตรวจสอบ Key ในระบบของเรา
    const keys = getApiKeys();
    const keyIndex = keys.findIndex(k => k.key === clientApiKey);

    if (keyIndex === -1) {
        console.log('❌ Auth Error: Invalid Key');
        return res.status(401).json({ error: 'Invalid User API Key' });
    }

    const keyData = keys[keyIndex];

    // 3. ตรวจสอบ Status, Expire, Usage
    if (keyData.status !== 'active') {
        console.log(`❌ Access Denied: Key is ${keyData.status}`);
        return res.status(403).json({ error: `API Key is ${keyData.status}` });
    }

    if (keyData.expiresAt) {
        // แปลงวันที่จากฐานข้อมูล
        const expiryDate = new Date(keyData.expiresAt);
        
        // 🔥 จุดสำคัญ: ปรับเวลาให้เป็น "วินาทีสุดท้าย" ของวันนั้น (23:59:59.999)
        // เพื่อให้ลูกค้าใช้งานได้ "จนจบวัน" ของวันที่ 28
        expiryDate.setHours(23, 59, 59, 999);

        const now = new Date();

        // เช็คว่า "เวลาปัจจุบัน" เลย "วินาทีสุดท้ายของวันหมดอายุ" ไปหรือยัง?
        // ตัวอย่าง: ตอนนี้ 21:00 (28) > หมดอายุ 23:59 (28) -> เป็น False (ยังไม่หมดอายุ) ✅
        // ตัวอย่าง: พรุ่งนี้ 00:01 (29) > หมดอายุ 23:59 (28) -> เป็น True (หมดอายุแล้ว) ❌
        if (now > expiryDate) {
            console.log('❌ Access Denied: Key Expired');
            return res.status(403).json({ error: 'API Key has expired' });
        }
    }

    if (keyData.usageLimit !== null && (keyData.usageCount || 0) >= keyData.usageLimit) {
        console.log('❌ Access Denied: Usage Limit Exceeded');
        return res.status(429).json({ error: 'Usage limit exceeded' });
    }

    // 4. ส่งต่อให้ Typhoon Engine (Proxy)
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('✅ Security Passed. Forwarding to Engine...');

        // ดึง Config ของระบบ (ที่มี Key จริงของบริษัท)
        const systemConfig = getGlobalConfig();

        // เตรียม Form Data
        const formData = new FormData();
        formData.append('file', req.file.buffer, req.file.originalname);
        formData.append('model', systemConfig.model);
        formData.append('task_type', systemConfig.taskType);
        formData.append('max_tokens', String(systemConfig.maxTokens));
        formData.append('temperature', String(systemConfig.temperature));
        formData.append('top_p', String(systemConfig.topP));
        formData.append('repetition_penalty', String(systemConfig.repetitionPenalty));

        // แก้ไข URL ให้ถูกต้อง (ป้องกัน // ซ้อน)
        let typhoonUrl = systemConfig.baseUrl.trim();
        if (typhoonUrl.endsWith('/')) typhoonUrl = typhoonUrl.slice(0, -1);
        if (!typhoonUrl.endsWith('/ocr')) typhoonUrl += '/ocr';

        // ยิง Request (Server-to-Server)
        const response = await axios.post(typhoonUrl, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${systemConfig.apiKey}` // ใช้ Key จริงของบริษัท
            }
        });

        // 5. อัปเดต Usage ของ User
        keys[keyIndex].usageCount = (keys[keyIndex].usageCount || 0) + 1;
        saveApiKeys(keys);

        console.log('✅ Engine Response Success. Usage Updated.');
        
        // ส่งผลลัพธ์กลับ Client
        res.json(response.data);

    } catch (error) {
        console.error('❌ Engine Proxy Error:', error.response?.data || error.message);
        
        const statusCode = error.response?.status || 500;
        let finalErrorMsg = 'Failed to process image with OCR Engine';

        // ดักจับ Error 401 จาก Typhoon โดยเฉพาะ
        if (statusCode === 401) {
             finalErrorMsg = '[System Error] OCR Engine Authentication Failed. Please contact Administrator to check System API Key.';
        } else if (error.response?.data?.error) {
             // ถ้ามี error msg จาก typhoon ให้เอามาแปะต่อ
             finalErrorMsg = `[Engine Error] ${error.response.data.error}`;
        }

        res.status(statusCode).json({ 
            error: finalErrorMsg,
            details: error.response?.data || error.message
        });
    }
});

// ==========================================
// 📌 API เดิม (Auth, Config, Admin) คงไว้เหมือนเดิม 📌
// ==========================================

// Forgot Password
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    resetTokens[email] = token;
    
    console.log(`\n[Reset Password] Generating token for ${email}...`);

    const mailOptions = {
        from: 'OCR SplitView Support',
        to: email,
        subject: 'Reset Your Password',
        text: `Your password reset code is: ${token}`,
        html: `<h3>Password Reset</h3><h1>${token}</h1>`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: 'Reset code sent.' });
    } catch (error) {
        console.error('❌ Failed to send email:', error.message);
        console.log(`🔑 [DEV MODE] CODE: ${token}`);
        res.json({ message: 'Email failed (See Console)', devToken: token });
    }
});

// Reset Password Confirm
app.post('/api/reset-password', async (req, res) => {
    const { email, token, newPassword } = req.body;
    if (!resetTokens[email] || resetTokens[email] !== token) {
        return res.status(400).json({ message: 'Invalid token' });
    }
    let db = null;
    try {
        db = await getConnection();
        if (db.type === 'mysql') await db.conn.query('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);
        else await db.conn.execute('UPDATE users SET password = :1 WHERE email = :2', [newPassword, email]);
        delete resetTokens[email];
        res.json({ message: 'Password updated' });
    } catch (err) { res.status(500).json({ message: 'Failed', error: err.message }); }
    finally { if(db) (db.type === 'oracle' ? await db.conn.close() : db.conn.end()); }
});

// Config APIs
app.get('/api/config', (req, res) => res.json(getGlobalConfig()));
app.post('/api/config', (req, res) => {
    try { saveGlobalConfig(req.body); res.json({ message: 'Saved' }); } 
    catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// Keys Management APIs
app.get('/api/keys', (req, res) => res.json(getApiKeys()));
app.get('/api/keys/user/:userId', (req, res) => {
    const { userId } = req.params;
    const keys = getApiKeys();
    const userKey = keys.find(k => String(k.userId) === String(userId));
    if (userKey && userKey.status !== 'active') return res.json({ ...userKey, key: '' });
    res.json(userKey || null);
});
app.post('/api/keys/request', (req, res) => {
    const { userId } = req.body;
    const keys = getApiKeys();
    const cleanKeys = keys.filter(k => String(k.userId) !== String(userId));
    const newKey = {
        id: `key-${Date.now()}`,
        userId,
        key: 'sk-ocr-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        status: 'pending', createdAt: new Date().toISOString(), expiresAt: null, usageLimit: null, usageCount: 0
    };
    cleanKeys.push(newKey);
    saveApiKeys(cleanKeys);
    res.json(newKey);
});
app.put('/api/keys/:id/status', (req, res) => {
    const { id } = req.params;
    const { status, expiresAt, usageLimit } = req.body;
    const keys = getApiKeys();
    const updatedKeys = keys.map(k => {
        if (k.id === id) return { ...k, status, expiresAt: expiresAt !== undefined ? expiresAt : k.expiresAt, usageLimit: usageLimit !== undefined ? usageLimit : k.usageLimit };
        return k;
    });
    saveApiKeys(updatedKeys);
    res.json({ message: 'Updated' });
});
app.delete('/api/keys/:id', (req, res) => {
    const { id } = req.params;
    const keys = getApiKeys();
    saveApiKeys(keys.filter(k => k.id !== id));
    res.json({ message: 'Deleted' });
});

// Test Connection
app.post('/api/test-db-connection', async (req, res) => {
    const { provider, host, port, user, password, database, serviceName } = req.body;
    if (provider === 'mysql') {
        const conn = mysql.createConnection({ host, port, user, password, database });
        conn.connect(err => {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            conn.end();
            res.json({ status: 'success' });
        });
    } else if (provider === 'oracle') {
        let conn;
        try {
            conn = await oracledb.getConnection({ user, password, connectString: `${host}:${port}/${serviceName}` });
            res.json({ status: 'success' });
        } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
        finally { if (conn) await conn.close(); }
    } else { res.status(400).json({ status: 'error', message: 'Unknown provider' }); }
});

// Auth APIs (Login/Register)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    let db = null;
    try {
        db = await getConnection();
        let user = null;
        if (db.type === 'mysql') {
            const results = await db.conn.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
            user = results[0];
        } else {
            const result = await db.conn.execute(`SELECT * FROM users WHERE email = :1 AND password = :2`, [email, password], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            if (result.rows.length > 0) user = { id: result.rows[0].ID, email: result.rows[0].EMAIL, name: result.rows[0].NAME, role: result.rows[0].ROLE, status: result.rows[0].STATUS, createdAt: result.rows[0].CREATED_AT };
        }
        if (user) {
            if (user.status === 'pending') return res.status(403).json({ message: 'Account pending approval' });
            if (user.status === 'rejected') return res.status(403).json({ message: 'Account rejected' });
            res.json(user);
        } else { res.status(401).json({ message: 'Invalid credentials' }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if(db) (db.type === 'oracle' ? await db.conn.close() : db.conn.end()); }
});

app.post('/api/register', async (req, res) => {
    const { email, password, name } = req.body;
    let db = null;
    try {
        db = await getConnection();
        if (db.type === 'mysql') await db.conn.query('INSERT INTO users (email, password, name, role, status) VALUES (?, ?, ?, "user", "pending")', [email, password, name]);
        else await db.conn.execute(`INSERT INTO users (email, password, name, role, status) VALUES (:1, :2, :3, 'user', 'pending')`, [email, password, name]);
        res.json({ message: 'Success' });
    } catch (err) { 
        if (err.message && (err.message.includes('Duplicate') || err.message.includes('unique constraint'))) return res.status(400).json({ message: 'Email exists' });
        res.status(500).json({ error: err.message }); 
    }
    finally { if(db) (db.type === 'oracle' ? await db.conn.close() : db.conn.end()); }
});

// Admin User APIs
app.get('/api/users', async (req, res) => {
    let db = null;
    try {
        db = await getConnection();
        let users = [];
        if (db.type === 'mysql') {
            users = await db.conn.query('SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC');
        } else {
            const result = await db.conn.execute(`SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            users = result.rows.map(row => ({ id: row.ID, email: row.EMAIL, name: row.NAME, role: row.ROLE, status: row.STATUS, createdAt: row.CREATED_AT }));
        }
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if(db) (db.type === 'oracle' ? await db.conn.close() : db.conn.end()); }
});

app.put('/api/users/:id/status', async (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    let db = null;
    try {
        db = await getConnection();
        if (db.type === 'mysql') await db.conn.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        else await db.conn.execute('UPDATE users SET status = :1 WHERE id = :2', [status, id]);
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if(db) (db.type === 'oracle' ? await db.conn.close() : db.conn.end()); }
});

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    let db = null;
    try {
        db = await getConnection();
        if (db.type === 'mysql') await db.conn.query('DELETE FROM users WHERE id = ?', [id]);
        else await db.conn.execute('DELETE FROM users WHERE id = :1', [id]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if(db) (db.type === 'oracle' ? await db.conn.close() : db.conn.end()); }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`✨ API Gateway ready at: http://localhost:${PORT}/v1/ocr`);
});
