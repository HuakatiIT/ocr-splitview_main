// ✅ 1. เพิ่มบรรทัดนี้บนสุด เพื่อโหลดค่าจาก .env
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
let oracledb = null;
try { oracledb = require('oracledb'); } 
catch (err) { console.log('Oracle driver not installed; Oracle mode disabled'); }
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Library สำหรับ API Gateway
const multer = require('multer');       
const axios = require('axios');         
const FormData = require('form-data');  

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ตั้งค่า Multer
const upload = multer({ storage: multer.memoryStorage() });

// --- [Dynamic] Config Email Sender ---
// ✅ 2. เปลี่ยนมาใช้ process.env
// Support generic SMTP (e.g., MailDev) with Gmail fallback
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
const smtpUser = process.env.SMTP_USER || process.env.MAIL_USER;
const smtpPass = process.env.SMTP_PASS || process.env.MAIL_PASS;
const useAuth = Boolean(smtpUser && smtpPass && !['maildev', 'maildev.default', 'maildev.default.svc.cluster.local'].includes(smtpHost));

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: useAuth ? { user: smtpUser, pass: smtpPass } : undefined
});

const MOCK_OCR = process.env.MOCK_OCR === 'true';

// Oracle Thin Mode
if (oracledb) {
  try { oracledb.initOracleClient({ libDir: process.env.ORACLE_LIB_DIR }); } 
  catch (err) { console.log('Oracle Thin Mode Active'); }
  oracledb.autoCommit = true;
}

// --- Config & Keys ---
// DATA_DIR จะใช้สำหรับเก็บไฟล์ state (config/keys) เพื่อให้ mount volume ได้บน container/K8s
const DATA_DIR = process.env.DATA_DIR || __dirname;
const CONFIG_FILE = path.join(DATA_DIR, 'db-config.json');
const KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const resetTokens = {}; 

// Helpers for persisted config/keys
const readJsonFile = (filePath, fallback) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error reading file ${filePath}:`, e);
    return fallback;
  }
};

const writeJsonFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error writing file ${filePath}:`, e);
  }
};

// --- [Dynamic] Default Config ---
// ✅ 3. เปลี่ยนค่า Hardcode ทั้งหมดเป็น process.env
const DEFAULT_CONFIG = {
    // Database Config
    dbProvider: process.env.DB_PROVIDER || 'mysql',
    allowSignup: true,
    
    // MySQL
    mysqlHost: process.env.MYSQL_HOST || 'localhost',
    mysqlPort: parseInt(process.env.MYSQL_PORT || '3306'),
    mysqlUser: process.env.MYSQL_USER || 'root',
    mysqlPassword: process.env.MYSQL_PASS || '', // ถ้าไม่มีใน env ให้เป็นค่าว่าง
    mysqlDatabase: process.env.MYSQL_DB || 'ocr_users_db',
    
    // Oracle
    oracleHost: process.env.ORACLE_HOST || 'localhost',
    oraclePort: parseInt(process.env.ORACLE_PORT || '1521'),
    oracleUser: process.env.ORACLE_USER || 'SYSTEM',
    oraclePassword: process.env.ORACLE_PASS || '',
    oracleServiceName: process.env.ORACLE_SERVICE || 'FREEPDB1',
    
    // AI Config (Typhoon)
    apiKey: process.env.TYPHOON_API_KEY || '', // Key ของบริษัท
    baseUrl: process.env.TYPHOON_BASE_URL || 'https://api.opentyphoon.ai/v1',
    model: 'typhoon-ocr',
    taskType: 'default',
    maxTokens: 16000,
    temperature: 0.1,
    topP: 0.6,
    repetitionPenalty: 1.1,

    // Ollama Config
    ocrEngine: process.env.OCR_ENGINE || 'typhoon', // Default engine
    ollamaUrl: process.env.OLLAMA_URL || 'http://ocr-ollama:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llava'
};

const CRAFT_URL = process.env.CRAFT_URL || 'http://craft-service:5000/detect';

const getApiKeys = () => readJsonFile(KEYS_FILE, []);
const saveApiKeys = (keys) => writeJsonFile(KEYS_FILE, keys);
const generateApiKey = () => `dev-${crypto.randomBytes(24).toString('hex')}`;
const generateSimplePdfBuffer = (text) => {
  const sanitize = (str) => String(str || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines = sanitize(text).split(/\r?\n/).slice(0, 200);
  const contentLines = [];
  let y = 760;
  const leading = 14;
  lines.forEach(line => {
    if (y < 40) return;
    contentLines.push(`BT /F1 12 Tf 40 ${y} Td (${line}) Tj ET`);
    y -= leading;
  });
  const contentStream = contentLines.join('\n') || 'BT /F1 12 Tf 40 760 Td (No OCR text) Tj ET';
  const contentLength = Buffer.byteLength(contentStream, 'utf8');

  const objects = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj');
  objects.push(`4 0 obj << /Length ${contentLength} >> stream\n${contentStream}\nendstream endobj`);
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach(obj => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj + '\n';
  });
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.forEach(off => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
};

const getGlobalConfig = () => {
    // 1. Start from defaults (.env)
    let finalConfig = { ...DEFAULT_CONFIG };

    // 2. Merge with saved config file if present
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            finalConfig = { ...finalConfig, ...fileConfig };
        } catch (e) {
            console.error("Error reading config file:", e);
        }
    }

    return finalConfig;
};

const saveGlobalConfig = (cfg) => writeJsonFile(CONFIG_FILE, cfg);

// --- Developer API Key Guard ---
const requireDeveloperKey = (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = tokenFromHeader || String(req.headers['x-api-key'] || '').trim();

    if (!token) {
        return res.status(401).json({ error: 'Missing Authorization header', detail: 'Send developer key as Bearer <key>' });
    }

    const keys = getApiKeys();
    const match = keys.find(k => k.key === token && k.status === 'active');
    if (!match) {
        return res.status(401).json({ error: 'Invalid or inactive developer key' });
    }

    req.developerKey = match;
    next();
};

// Helper: เชื่อมต่อ Database
const getConnection = async () => {
    const settings = getGlobalConfig();
    const provider = settings.dbProvider || 'mysql';

    if (provider === 'oracle') {
        if (!oracledb) throw new Error('Oracle driver not available');
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
// 🔥 API Gateway Logic (เหมือนเดิม 100%) 🔥
// ==========================================

app.post('/v1/ocr', upload.single('file'), async (req, res) => {
    console.log(`\n[API Gateway] Request received at /v1/ocr`);

    // Mock mode: skip auth and upstream call entirely
    if (MOCK_OCR) {
        console.log('🟢 MOCK_OCR enabled, returning stub result (no auth required)');
        return res.json({
            results: [
                {
                    success: true,
                    message: {
                        choices: [{
                            message: { content: JSON.stringify({ natural_text: 'Mock OCR result for testing UI' }) }
                        }]
                    }
                }
            ]
        });
    }

    // Developer/user API key check disabled per request (UI does not require bearer)
    const keys = [];
    const keyIndex = -1;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const allowedMime = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/tiff', 'image/bmp', 'image/heic', 'image/heif', 'application/pdf'];
        if (!allowedMime.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Unsupported file type for OCR', detail: `Got ${req.file.mimetype}` });
        }

        console.log('Security Passed. Determining OCR Engine...');

        const systemConfig = getGlobalConfig();

        // Determine engine: request parameter takes precedence over system config
        const engine = (req.body?.engine || req.query?.engine || systemConfig.ocrEngine || 'typhoon').toLowerCase();
        console.log(`Using OCR Engine: ${engine}`);

        let response;

        if (engine === 'ollama') {
            // Route to Ollama
            const base64Image = req.file.buffer.toString('base64');
            const imageMime = req.file.mimetype;
            const ollamaPayload = {
                model: systemConfig.ollamaModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Extract all visible text from this image. Return only the extracted text without any additional commentary.' },
                            { type: 'image_url', image_url: { url: `data:${imageMime};base64,${base64Image}` } }
                        ]
                    }
                ],
                stream: false
            };

            let ollamaUrl = (systemConfig.ollamaUrl || '').trim();
            if (!ollamaUrl) {
                return res.status(500).json({ error: 'Ollama URL is not configured' });
            }
            if (ollamaUrl.endsWith('/')) ollamaUrl = ollamaUrl.slice(0, -1);
            if (!ollamaUrl.endsWith('/api/chat')) ollamaUrl += '/api/chat';

            response = await axios.post(ollamaUrl, ollamaPayload, {
                headers: { 'Content-Type': 'application/json' },
                maxBodyLength: 30 * 1024 * 1024,
                timeout: 120000, // Ollama might take longer
                validateStatus: () => true
            });

            if (response.status >= 400) {
                throw Object.assign(new Error('Ollama returned error'), { response });
            }

            // Normalize Ollama response to Typhoon format
            const extractedText = response.data.message?.content || '';
            const normalizedResponse = {
                results: [
                    {
                        success: true,
                        message: {
                            choices: [{
                                message: { content: JSON.stringify({ natural_text: extractedText }) }
                            }]
                        }
                    }
                ]
            };
            response.data = normalizedResponse;

        } else {
            // Default to Typhoon (backward compatibility)
            const formData = new FormData();
            formData.append('file', req.file.buffer, req.file.originalname || 'upload.bin');
            formData.append('model', systemConfig.model);
            formData.append('task_type', systemConfig.taskType);
            formData.append('max_tokens', String(systemConfig.maxTokens));
            formData.append('temperature', String(systemConfig.temperature));
            formData.append('top_p', String(systemConfig.topP));
            formData.append('repetition_penalty', String(systemConfig.repetitionPenalty));

            let typhoonUrl = (systemConfig.baseUrl || '').trim();
            if (!typhoonUrl) {
                return res.status(500).json({ error: 'Typhoon base URL is not configured' });
            }
            if (typhoonUrl.endsWith('/')) typhoonUrl = typhoonUrl.slice(0, -1);
            if (!typhoonUrl.endsWith('/ocr')) typhoonUrl += '/ocr';

            response = await axios.post(typhoonUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${systemConfig.apiKey}`
                },
                maxBodyLength: 30 * 1024 * 1024,
                timeout: 60000,
                validateStatus: () => true
            });

            if (response.status === 401) {
                throw Object.assign(new Error('Typhoon auth failed'), { response });
            }
            if (response.status >= 400) {
                throw Object.assign(new Error('Typhoon returned error'), { response });
            }
        }

        if (keyIndex >= 0) {
            keys[keyIndex].usageCount = (keys[keyIndex].usageCount || 0) + 1;
            saveApiKeys(keys);
        }

        console.log('✅ Engine Response Success. Usage Updated.');

        res.json(response.data);

    } catch (error) {
        console.error('❌ Engine Proxy Error:', error.response?.data || error.message);

        const statusCode = error.response?.status || 500;
        let finalErrorMsg = 'Failed to process image with OCR Engine';

        if (statusCode === 401) {
             finalErrorMsg = '[System Error] OCR Engine Authentication Failed. Please contact Administrator to check System API Key.';
        } else if (error.response?.data?.error) {
             finalErrorMsg = `[Engine Error] ${error.response.data.error}`;
        }

        res.status(statusCode).json({
            error: finalErrorMsg,
            details: error.response?.data || error.message
        });
    }
});

// Developer-facing OCR endpoint (Bearer developer key required)
app.post('/api/ocr_v1', requireDeveloperKey, upload.single('file'), async (req, res) => {
    console.log(`\n[Developer API] /api/ocr_v1 by user ${req.developerKey.userId || 'unknown'}`);

    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const allowedMime = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/tiff', 'image/bmp', 'image/heic', 'image/heif', 'application/pdf'];
        if (!allowedMime.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Unsupported file type for OCR', detail: `Got ${req.file.mimetype}` });
        }

        const systemConfig = getGlobalConfig();

        // Determine engine: request parameter takes precedence over system config
        const engine = (req.body?.engine || req.query?.engine || systemConfig.ocrEngine || 'typhoon').toLowerCase();
        console.log(`[Developer API] Using OCR Engine: ${engine}`);

        let response;

        if (engine === 'ollama') {
            // Route to Ollama
            const base64Image = req.file.buffer.toString('base64');
            const imageMime = req.file.mimetype;
            const ollamaPayload = {
                model: systemConfig.ollamaModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Extract all visible text from this image. Return only the extracted text without any additional commentary.' },
                            { type: 'image_url', image_url: { url: `data:${imageMime};base64,${base64Image}` } }
                        ]
                    }
                ],
                stream: false
            };

            let ollamaUrl = (systemConfig.ollamaUrl || '').trim();
            if (!ollamaUrl) return res.status(500).json({ error: 'Ollama URL is not configured' });
            if (ollamaUrl.endsWith('/')) ollamaUrl = ollamaUrl.slice(0, -1);
            if (!ollamaUrl.endsWith('/api/chat')) ollamaUrl += '/api/chat';

            response = await axios.post(ollamaUrl, ollamaPayload, {
                headers: { 'Content-Type': 'application/json' },
                maxBodyLength: 30 * 1024 * 1024,
                timeout: 120000,
                validateStatus: () => true
            });

            if (response.status >= 400) {
                console.error('[Developer API] Ollama error:', response.data);
                return res.status(response.status).json({ error: 'Ollama processing failed', details: response.data });
            }

            // Normalize Ollama response to Typhoon format
            const extractedText = response.data.message?.content || '';
            const normalizedResponse = {
                results: [
                    {
                        success: true,
                        message: {
                            choices: [{
                                message: { content: JSON.stringify({ natural_text: extractedText }) }
                            }]
                        }
                    }
                ]
            };
            response.data = normalizedResponse;

        } else {
            // Default to Typhoon
            const formData = new FormData();
            formData.append('file', req.file.buffer, req.file.originalname || 'upload.bin');
            formData.append('model', systemConfig.model);
            formData.append('task_type', systemConfig.taskType);
            formData.append('max_tokens', String(systemConfig.maxTokens));
            formData.append('temperature', String(systemConfig.temperature));
            formData.append('top_p', String(systemConfig.topP));
            formData.append('repetition_penalty', String(systemConfig.repetitionPenalty));

            let typhoonUrl = (systemConfig.baseUrl || '').trim();
            if (!typhoonUrl) return res.status(500).json({ error: 'Typhoon base URL is not configured' });
            if (typhoonUrl.endsWith('/')) typhoonUrl = typhoonUrl.slice(0, -1);
            if (!typhoonUrl.endsWith('/ocr')) typhoonUrl += '/ocr';

            response = await axios.post(typhoonUrl, formData, {
                headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${systemConfig.apiKey}` },
                maxBodyLength: 30 * 1024 * 1024,
                timeout: 60000,
                validateStatus: () => true
            });

            if (response.status >= 400) {
                console.error('[Developer API] Typhoon error:', response.data);
                return res.status(response.status).json(response.data);
            }
        }

        res.json(response.data);
    } catch (err) {
        console.error('[Developer API] OCR proxy failed:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ error: 'Failed to process image', details: err.response?.data || err.message });
    }
});

// Generate searchable PDF from provided text (reuses API-key checks)
app.post('/v1/gen_pdf', async (req, res) => {
    console.log(`\n[API Gateway] Request received at /v1/gen_pdf`);

    // Developer/user API key check disabled per request
    const keys = [];
    const keyIndex = -1;

    const { text, filename } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Text is required to generate PDF' });
    }
    const safeName = String(filename || 'ocr-output.pdf').replace(/[^\w.\-]+/g, '_') || 'ocr-output.pdf';

    try {
        const pdfBuffer = generateSimplePdfBuffer(text);
        if (keyIndex >= 0) {
            keys[keyIndex].usageCount = (keys[keyIndex].usageCount || 0) + 1;
            saveApiKeys(keys);
        }

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${safeName.endsWith('.pdf') ? safeName : safeName + '.pdf'}"`
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Г?O PDF Generation Error:', err.message);
        res.status(500).json({ error: 'Failed to generate PDF', details: err.message });
    }
});

// Developer-facing searchable PDF download (Bearer developer key required)
app.post('/api/searchable_pdf', requireDeveloperKey, async (req, res) => {
    console.log(`\n[Developer API] /api/searchable_pdf by user ${req.developerKey.userId || 'unknown'}`);
    const { text, filename } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Text is required to generate PDF' });
    }
    const safeName = String(filename || 'ocr-output.pdf').replace(/[^\w.\-]+/g, '_') || 'ocr-output.pdf';

    try {
        const pdfBuffer = generateSimplePdfBuffer(text);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${safeName.endsWith('.pdf') ? safeName : safeName + '.pdf'}"`
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('[Developer API] PDF generation error:', err.message);
        res.status(500).json({ error: 'Failed to generate PDF', details: err.message });
    }
});

// ==========================================
// 📌 API เดิม (Auth, Config, Admin) 📌
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
    try {
        // merge with existing config so missing fields (e.g., allowSignup) are preserved instead of reset to defaults
        const currentConfig = getGlobalConfig();
        const nextConfig = { ...currentConfig, ...req.body };
        saveGlobalConfig(nextConfig);
        res.json({ message: 'Saved', config: nextConfig });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
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
        key: generateApiKey(),
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
    const cfg = getGlobalConfig();
    if (cfg.allowSignup === false) {
        return res.status(403).json({ message: 'Signup is disabled by admin' });
    }
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

// Admin reset password (no token needed)
app.put('/api/users/:id/password', async (req, res) => {
    const { password } = req.body;
    const { id } = req.params;
    if (!password || String(password).length < 4) {
        return res.status(400).json({ error: 'Password is required (min 4 chars)' });
    }
    let db = null;
    try {
        db = await getConnection();
        if (db.type === 'mysql') await db.conn.query('UPDATE users SET password = ? WHERE id = ?', [password, id]);
        else await db.conn.execute('UPDATE users SET password = :1 WHERE id = :2', [password, id]);
        res.json({ message: 'Password reset' });
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

// เพิ่ม API สำหรับลบไฟล์ config (Factory Reset)
app.delete('/api/config', (req, res) => {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            fs.unlinkSync(CONFIG_FILE); // ลบไฟล์ทิ้งเลย
        }
        res.json({ message: 'Reset to factory settings (.env)' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to reset config' });
    }
});

// ✅ 4. เปลี่ยน Port เป็นค่าจาก .env
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`✨ API Gateway ready at: http://localhost:${PORT}/v1/ocr`);
});
