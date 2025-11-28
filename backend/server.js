const express = require('express');
const mysql = require('mysql2');
const oracledb = require('oracledb');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// --- Config Email Sender (ต้องแก้ไขตรงนี้!) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    // 🔴 แก้ตรงนี้ให้เป็นของจริงครับ 🔴
    user: '*********@gmail.com', // อีเมล Gmail ของคุณ
    pass: '**** **** **** ****'      // รหัส App Password 16 หลักที่ได้มา
  }
});

// Oracle Thin Mode
try { oracledb.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR }); } 
catch (err) { console.log('Oracle Thin Mode Active'); }

oracledb.autoCommit = true;

// --- Config & Keys ---
const CONFIG_FILE = path.join(__dirname, 'db-config.json');
const KEYS_FILE = path.join(__dirname, 'api-keys.json');

// In-Memory Token Store (สำหรับ Demo Reset Password)
const resetTokens = {}; 

const DEFAULT_CONFIG = {
    dbProvider: 'mysql',
    mysqlHost: 'localhost',
    mysqlPort: 3306,
    mysqlUser: 'root',
    mysqlPassword: '123456789',
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
    console.log(`[System] Using Database: ${provider.toUpperCase()}`);

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

// --- API Routes ---

// Forgot Password (ส่งอีเมลจริง)
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    // สร้าง OTP 6 หลัก
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    resetTokens[email] = token;
    
    console.log(`\n[Reset Password] Generating token for ${email}...`);

    const mailOptions = {
        from: 'OCR SplitView Support',
        to: email,
        subject: 'Reset Your Password',
        text: `Your password reset code is: ${token}`,
        html: `
            <h3>Password Reset Request</h3>
            <p>You requested to reset your password for OCR SplitView.</p>
            <p>Your reset code is:</p>
            <h1 style="color: #2563eb; letter-spacing: 5px;">${token}</h1>
            <p>If you did not request this, please ignore this email.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${email}`);
        res.json({ message: 'Reset code sent to your email.' });
    } catch (error) {
        // Fallback Mode: ถ้าส่งเมลไม่ผ่าน ให้แสดงรหัสใน Console แทน (สำหรับ Dev)
        console.error('❌ Failed to send email:', error.message);
        console.log('---------------------------------------------------');
        console.log(`🔑 [DEV MODE] YOUR RESET CODE IS:  >>  ${token}  <<`);
        console.log('---------------------------------------------------');
        
        // ส่ง token กลับไปให้ Frontend เฉพาะตอน Dev เพื่อให้ Test ผ่านได้
        res.json({ 
            message: 'Email delivery failed (Check Server Console for Code).',
            devToken: token 
        });
    }
});

// Reset Password (Confirm)
app.post('/api/reset-password', async (req, res) => {
    const { email, token, newPassword } = req.body;
    
    if (!resetTokens[email] || resetTokens[email] !== token) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    let db = null;
    try {
        db = await getConnection();
        if (db.type === 'mysql') {
            await db.conn.query('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);
        } else {
            await db.conn.execute('UPDATE users SET password = :1 WHERE email = :2', [newPassword, email]);
        }
        delete resetTokens[email];
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update password', error: err.message });
    } finally {
        if (db) {
            if (db.type === 'oracle') await db.conn.close();
            else db.conn.end();
        }
    }
});

// Config
app.get('/api/config', (req, res) => res.json(getGlobalConfig()));
app.post('/api/config', (req, res) => {
    try { saveGlobalConfig(req.body); res.json({ message: 'Saved' }); } 
    catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// Keys
app.get('/api/keys', (req, res) => res.json(getApiKeys()));
app.get('/api/keys/user/:userId', (req, res) => {
    const { userId } = req.params;
    const keys = getApiKeys();
    const userKey = keys.find(k => String(k.userId) === String(userId));
    if (userKey && userKey.status !== 'active') {
        return res.json({ ...userKey, key: '' });
    }
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
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: null, usageLimit: null, usageCount: 0
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
    const updatedKeys = keys.filter(k => k.id !== id);
    saveApiKeys(updatedKeys);
    res.json({ message: 'Deleted' });
});

// Mock OCR Process
app.post('/api/process', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Key' });
    const apiKeyStr = authHeader.split(' ')[1];
    const keys = getApiKeys();
    const keyIndex = keys.findIndex(k => k.key === apiKeyStr);
    if (keyIndex === -1) return res.status(401).json({ error: 'Invalid API Key' });
    const key = keys[keyIndex];
    if (key.status !== 'active') return res.status(403).json({ error: `API Key is ${key.status}` });
    
    // 3. เช็ควันหมดอายุ (แก้ไขใหม่: ให้หมดอายุที่ "สิ้นวัน" ของวันที่เลือก)
    if (key.expiresAt) {
        const expiryDate = new Date(key.expiresAt);
        expiryDate.setHours(23, 59, 59, 999); // ปรับให้เป็นเวลา 23:59:59.999 ของวันนั้น
        
        if (expiryDate < new Date()) {
            return res.status(403).json({ error: 'API Key has expired' });
        }
    }

    if (key.usageLimit !== null && (key.usageCount || 0) >= key.usageLimit) return res.status(429).json({ error: 'Usage limit exceeded' });

    key.usageCount = (key.usageCount || 0) + 1;
    keys[keyIndex] = key;
    saveApiKeys(keys);
    res.json({ status: 'success', message: 'Image processed', usage: { current: key.usageCount, limit: key.usageLimit || 'Unlimited' } });
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

// Auth APIs
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
            if (result.rows.length > 0) {
                const row = result.rows[0];
                user = { id: row.ID, email: row.EMAIL, name: row.NAME, role: row.ROLE, status: row.STATUS, createdAt: row.CREATED_AT };
            }
        }
        if (user) {
            if (user.status === 'pending') return res.status(403).json({ message: 'Account pending approval' });
            if (user.status === 'rejected') return res.status(403).json({ message: 'Account rejected' });
            res.json(user);
        } else { res.status(401).json({ message: 'Invalid credentials' }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (db && db.type === 'oracle') await db.conn.close(); else if(db) db.conn.end(); }
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
    finally { if (db && db.type === 'oracle') await db.conn.close(); else if(db) db.conn.end(); }
});

// Admin APIs
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
    finally { if (db && db.type === 'oracle') await db.conn.close(); else if(db) db.conn.end(); }
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
    finally { if (db && db.type === 'oracle') await db.conn.close(); else if(db) db.conn.end(); }
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
    finally { if (db && db.type === 'oracle') await db.conn.close(); else if(db) db.conn.end(); }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT} (API Keys & DB Config Enabled)`);
});
