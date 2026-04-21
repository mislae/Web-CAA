require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (_error) {
  nodemailer = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 5 * 1024 * 1024); // 5MB por defecto
const DEFAULT_PROPOSAL_RECIPIENT = process.env.PROPOSAL_RECIPIENT || 'misla@alumnos.brs.cl';
const MAIL_FROM = process.env.MAIL_FROM || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const PROPOSAL_PB_URL = String(process.env.PROPOSAL_PB_URL || '').trim();
const PROPOSAL_PB_ADMIN_EMAIL = String(process.env.PROPOSAL_PB_ADMIN_EMAIL || '').trim();
const PROPOSAL_PB_ADMIN_PASSWORD = String(process.env.PROPOSAL_PB_ADMIN_PASSWORD || '').trim();
const PROPOSAL_PB_TOKEN = String(process.env.PROPOSAL_PB_TOKEN || '').trim();
const PROPOSAL_PB_COLLECTION = String(process.env.PROPOSAL_PB_COLLECTION || 'proposals').trim() || 'proposals';
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 1);
const PROPOSAL_STATUS_TOKEN = String(process.env.PROPOSAL_STATUS_TOKEN || '').trim();

const uploadsDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'Images'));
const proposalDataDir = path.join(__dirname, 'data');
const proposalQueueFile = path.join(proposalDataDir, 'proposal-queue.json');
const proposalAuditFile = path.join(proposalDataDir, 'proposal-audit.jsonl');
const proposalInboxFile = path.join(proposalDataDir, 'proposal-inbox.jsonl');
const proposalReadableFile = path.join(proposalDataDir, 'propuestas-recibidas.txt');
const configDir = path.join(__dirname, 'config');
const proposalsConfigFile = path.join(configDir, 'propuestas.json');

function ensureProposalDataDir() {
  if (!fs.existsSync(proposalDataDir)) {
    fs.mkdirSync(proposalDataDir, { recursive: true });
  }
}

function ensureProposalQueueFile() {
  ensureProposalDataDir();
  if (!fs.existsSync(proposalQueueFile)) {
    fs.writeFileSync(proposalQueueFile, '[]', 'utf8');
  }
}

function ensureProposalAuditFile() {
  ensureProposalDataDir();
  if (!fs.existsSync(proposalAuditFile)) {
    fs.writeFileSync(proposalAuditFile, '', 'utf8');
  }
}

function ensureProposalInboxFile() {
  ensureProposalDataDir();
  if (!fs.existsSync(proposalInboxFile)) {
    fs.writeFileSync(proposalInboxFile, '', 'utf8');
  }
}

function ensureProposalReadableFile() {
  ensureProposalDataDir();
  if (!fs.existsSync(proposalReadableFile)) {
    fs.writeFileSync(proposalReadableFile, '=== PROPUESTAS RECIBIDAS ===\n\n', 'utf8');
    return;
  }

  const current = fs.readFileSync(proposalReadableFile, 'utf8');
  const trimmed = current.trim();
  if (!trimmed || trimmed === '=== PROPUESTAS RECIBIDAS ===') {
    regenerateProposalReadableFile();
  }
}

function appendProposalAudit(event, data) {
  ensureProposalAuditFile();
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    ...data
  };
  fs.appendFileSync(proposalAuditFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

function appendProposalInbox(entry) {
  ensureProposalInboxFile();
  fs.appendFileSync(proposalInboxFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * Convierte timestamp ISO 8601 a formato legible en zona horaria de Santiago de Chile
 */
function formatDateSantiago(isoString) {
  try {
    const date = new Date(isoString);
    const formatter = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    
    const parts = formatter.formatToParts(date);
    const map = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        map[part.type] = part.value;
      }
    });
    
    const hour = parseInt(map.hour);
    const period = hour >= 12 ? 'p.m.' : 'a.m.';
    const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    
    return `${map.day}-${map.month}-${map.year}, ${String(hour12).padStart(2, '0')}:${map.minute}:${map.second} ${period}`;
  } catch (error) {
    return isoString;
  }
}

function appendReadableProposal(entry) {
  ensureProposalReadableFile();
  const timestamp = entry.timestamp || new Date().toISOString();
  const fechaLocal = formatDateSantiago(timestamp);
  
  const block = [
    '----------------------------------------',
    `Fecha: ${fechaLocal}`,
    `ID: ${entry.submissionId || 'n/a'}`,
    `Titulo: ${entry.title || 'Sin titulo'}`,
    `Autor: ${entry.author || 'Anónimo'}`,
    `Curso: ${entry.course || 'No especificado'}`,
    `IP: ${(entry.requestMeta && entry.requestMeta.ip) || 'unknown'}`,
    `Estado: Enviado`,
    '',
    'Descripcion:',
    String(entry.description || '').trim() || '(Sin descripcion)',
    ''
  ].join('\n');

  fs.appendFileSync(proposalReadableFile, `${block}\n`, 'utf8');
}

/**
 * Regenera el archivo de propuestas legibles desde el JSONL.
 * Se ejecuta al iniciar si el archivo está vacío o corrupto.
 */
function regenerateProposalReadableFile() {
  try {
    ensureProposalDataDir();
    
    if (!fs.existsSync(proposalInboxFile)) {
      return;
    }

    const content = fs.readFileSync(proposalInboxFile, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim());
    
    if (lines.length === 0) {
      return;
    }

    const proposals = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    if (proposals.length === 0) {
      return;
    }

    // Reconstruir el archivo
    let output = '=== PROPUESTAS RECIBIDAS ===\n\n';

    for (const prop of proposals) {
      output += '----------------------------------------\n';
      output += `Fecha: ${formatDateSantiago(prop.timestamp || new Date().toISOString())}\n`;
      output += `ID: ${prop.submissionId || 'N/A'}\n`;
      output += `Titulo: ${prop.title || '(Sin titulo)'}\n`;
      output += `Autor: ${prop.author || 'Anónimo'}\n`;
      output += `Curso: ${prop.course || 'No especificado'}\n`;
      output += `IP: ${(prop.requestMeta && prop.requestMeta.ip) || 'unknown'}\n`;
      output += 'Estado: Enviado\n';
      output += '\n';
      output += 'Descripcion:\n';
      output += `${String(prop.description || '').trim() || '(Sin descripcion)'}\n`;
      output += '\n';
    }

    fs.writeFileSync(proposalReadableFile, output, 'utf8');
    console.log(`✓ Propuestas regeneradas: ${proposals.length} entradas en ${proposalReadableFile}`);
  } catch (error) {
    console.error('❌ Error regenerando propuestas legibles:', error.message);
  }
}

function readJsonlTail(filePath, limit = 20) {
  if (!fs.existsSync(filePath)) return [];

  try {
    const lines = fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const tail = lines.slice(Math.max(0, lines.length - Math.max(1, limit)));
    return tail.map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    }).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function getFileLineCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .length;
  } catch (_error) {
    return 0;
  }
}

function isProposalStatusAuthorized(req) {
  if (!PROPOSAL_STATUS_TOKEN) return true;

  const queryToken = String((req.query && req.query.token) || '').trim();
  const headerToken = String(req.headers['x-proposal-status-token'] || '').trim();
  return queryToken === PROPOSAL_STATUS_TOKEN || headerToken === PROPOSAL_STATUS_TOKEN;
}

function normalizeIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return null;
  return raw.replace(/^::ffff:/, '');
}

function firstForwardedIp(value) {
  const candidate = String(value || '').split(',')[0].trim();
  return normalizeIp(candidate);
}

function clipHeader(value, max = 400) {
  if (value == null) return null;
  const str = String(value);
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

function clipValue(value, max = 4000) {
  if (value == null) return null;
  const str = String(value);
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

function getSocketFingerprint(req) {
  const socket = req.socket || {};
  return {
    encrypted: Boolean(socket.encrypted),
    alpnProtocol: clipValue(socket.alpnProtocol, 64),
    remoteFamily: clipValue(socket.remoteFamily, 32),
    remotePort: Number(socket.remotePort || 0) || null
  };
}

function getRequestMetadata(req) {
  const cfConnectingIp = normalizeIp(req.headers['cf-connecting-ip']);
  const forwardedForRaw = req.headers['x-forwarded-for'];
  const forwardedIp = firstForwardedIp(forwardedForRaw);
  const requestIp = normalizeIp(req.ip || (req.socket && req.socket.remoteAddress));

  return {
    ip: cfConnectingIp || forwardedIp || requestIp || 'unknown',
    cfConnectingIp: cfConnectingIp || null,
    xForwardedFor: clipHeader(forwardedForRaw),
    userAgent: clipHeader(req.headers['user-agent']),
    acceptLanguage: clipHeader(req.headers['accept-language']),
    acceptEncoding: clipHeader(req.headers['accept-encoding']),
    secChUa: clipHeader(req.headers['sec-ch-ua']),
    secChUaPlatform: clipHeader(req.headers['sec-ch-ua-platform']),
    secFetchSite: clipHeader(req.headers['sec-fetch-site']),
    secFetchMode: clipHeader(req.headers['sec-fetch-mode']),
    secFetchDest: clipHeader(req.headers['sec-fetch-dest']),
    contentType: clipHeader(req.headers['content-type']),
    host: clipHeader(req.headers.host),
    origin: clipHeader(req.headers.origin),
    referer: clipHeader(req.headers.referer),
    socket: getSocketFingerprint(req)
  };
}

function getHttpClientForUrl(protocol) {
  return String(protocol || '').startsWith('https:') ? https : http;
}

function doHttpJsonRequest(targetUrl, options = {}) {
  const { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = options;
  const urlObj = new URL(targetUrl);
  const client = getHttpClientForUrl(urlObj.protocol);
  const requestBody = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = client.request({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || undefined,
      path: `${urlObj.pathname}${urlObj.search}`,
      method,
      headers: {
        Accept: 'application/json',
        ...(requestBody ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}),
        ...(requestBody ? { 'Content-Length': Buffer.byteLength(requestBody) } : {}),
        ...headers
      }
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
      });
      response.on('end', () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (_error) {
          parsed = null;
        }

        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ statusCode: response.statusCode, data: parsed, raw });
          return;
        }

        const error = new Error(`HTTP ${response.statusCode} en ${urlObj.pathname}`);
        error.statusCode = Number(response.statusCode || 0);
        error.responseData = parsed;
        error.responseRaw = raw;
        error.transient = error.statusCode >= 500 || error.statusCode === 429;
        reject(error);
      });
    });

    req.on('error', (error) => {
      error.transient = true;
      reject(error);
    });

    req.setTimeout(timeoutMs, () => {
      const timeoutError = new Error(`Timeout HTTP ${method} ${urlObj.pathname}`);
      timeoutError.transient = true;
      req.destroy(timeoutError);
    });

    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

function getPocketBaseBaseUrl() {
  if (!PROPOSAL_PB_URL) return '';
  return PROPOSAL_PB_URL.endsWith('/') ? PROPOSAL_PB_URL.slice(0, -1) : PROPOSAL_PB_URL;
}

async function getPocketBaseAuthToken() {
  if (PROPOSAL_PB_TOKEN) return PROPOSAL_PB_TOKEN;

  const baseUrl = getPocketBaseBaseUrl();
  if (!baseUrl || !PROPOSAL_PB_ADMIN_EMAIL || !PROPOSAL_PB_ADMIN_PASSWORD) {
    return '';
  }

  const authResult = await doHttpJsonRequest(`${baseUrl}/api/admins/auth-with-password`, {
    method: 'POST',
    body: {
      identity: PROPOSAL_PB_ADMIN_EMAIL,
      password: PROPOSAL_PB_ADMIN_PASSWORD
    }
  });

  return String(authResult && authResult.data && authResult.data.token ? authResult.data.token : '').trim();
}

async function saveProposalToPocketBase({ titulo, descripcion, autor, curso, mensaje, subject, requestMeta, submissionId }) {
  const baseUrl = getPocketBaseBaseUrl();
  if (!baseUrl) {
    const configError = new Error('PocketBase no configurado (PROPOSAL_PB_URL).');
    configError.provider = 'pocketbase';
    configError.transient = false;
    throw configError;
  }

  const token = await getPocketBaseAuthToken();
  if (!token) {
    const authError = new Error('PocketBase no configurado con token/admin (PROPOSAL_PB_TOKEN o credenciales admin).');
    authError.provider = 'pocketbase';
    authError.transient = false;
    throw authError;
  }

  const payload = {
    submissionId,
    titulo,
    descripcion,
    autor,
    curso,
    mensaje,
    subject,
    ip: (requestMeta && requestMeta.ip) || 'unknown',
    userAgent: (requestMeta && requestMeta.userAgent) || 'unknown',
    origin: (requestMeta && requestMeta.origin) || 'n/a',
    referer: (requestMeta && requestMeta.referer) || 'n/a',
    requestMetaRaw: JSON.stringify(requestMeta || {}),
    status: 'received',
    createdAtServer: new Date().toISOString()
  };

  const createResult = await doHttpJsonRequest(`${baseUrl}/api/collections/${encodeURIComponent(PROPOSAL_PB_COLLECTION)}/records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: payload
  });

  return {
    provider: 'pocketbase',
    statusCode: createResult.statusCode,
    recordId: createResult && createResult.data && createResult.data.id ? createResult.data.id : null
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function readProposalsConfig() {
  ensureConfigDir();
  const defaultConfig = {
    recipient: DEFAULT_PROPOSAL_RECIPIENT
  };

  if (!fs.existsSync(proposalsConfigFile)) {
    fs.writeFileSync(proposalsConfigFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
    return defaultConfig;
  }

  try {
    const raw = fs.readFileSync(proposalsConfigFile, 'utf8');
    const parsed = JSON.parse(raw);
    const recipient = String(parsed && parsed.recipient ? parsed.recipient : '').trim();

    if (!isValidEmail(recipient)) {
      fs.writeFileSync(proposalsConfigFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
      return defaultConfig;
    }

    return { recipient };
  } catch (_error) {
    fs.writeFileSync(proposalsConfigFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
    return defaultConfig;
  }
}

function getProposalRecipient() {
  return readProposalsConfig().recipient;
}

function loadProposalQueue() {
  ensureProposalQueueFile();
  try {
    const raw = fs.readFileSync(proposalQueueFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveProposalQueue(queue) {
  ensureProposalQueueFile();
  fs.writeFileSync(proposalQueueFile, JSON.stringify(queue, null, 2), 'utf8');
}

function createProposalMailer() {
  if (!nodemailer) return null;
  if (!MAIL_FROM || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

const proposalMailer = createProposalMailer();

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function sanitizeName(name, originalName) {
  const base = (name || originalName || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  if (!path.extname(base) && originalName) {
    return `${base}${path.extname(originalName)}`;
  }
  return base;
}

ensureUploadsDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const desiredName = req.body && req.body.filename ? req.body.filename : file.originalname;
    cb(null, sanitizeName(desiredName, file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.'));
    }
  }
});

// Seguridad básica y rendimiento
app.use(helmet({
  contentSecurityPolicy: false // Mantener deshabilitado por ahora para permitir iframes y CDN actuales
}));
app.use(compression());
app.use(cors());
app.use(express.json()); // Parsear bodys JSON para API
app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: 'text/plain' }));
app.disable('x-powered-by');
app.set('trust proxy', Number.isFinite(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS >= 0 ? TRUST_PROXY_HOPS : 1);

// Limitar peticiones
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // máx. 200 peticiones/15min por IP
  standardHeaders: true,
  legacyHeaders: false
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

app.use('/api/', apiLimiter);

// ============================================
// RUTAS DE API (antes de static files)
// ============================================

app.post('/api/upload', uploadLimiter, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se recibió archivo' });
  }

  const fileUrl = `/Images/${req.file.filename}`;
  return res.json({ success: true, url: fileUrl, filename: req.file.filename });
});

app.get('/api/images', (req, res) => {
  ensureUploadsDir();
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'No se pudo leer el directorio' });
    }
    const images = files.filter((name) => !name.startsWith('.'));
    res.json({ success: true, images });
  });
});

function sendProposalEmail({ titulo, descripcion, autor, curso, mensaje, subject, requestMeta, submissionId }) {
  const recipient = getProposalRecipient();
  const traceBlock = requestMeta
    ? `\n\nTRAZA:\nID: ${submissionId || 'n/a'}\nIP: ${requestMeta.ip || 'unknown'}\nUA: ${requestMeta.userAgent || 'unknown'}\nOrigin: ${requestMeta.origin || 'n/a'}\nReferer: ${requestMeta.referer || 'n/a'}`
    : '';
  const messageWithTrace = `${mensaje}${traceBlock}`;

  return saveProposalToPocketBase({
    titulo,
    descripcion,
    autor,
    curso,
    mensaje: messageWithTrace,
    subject,
    requestMeta,
    submissionId
  }).then(async (pbResult) => {
    if (!proposalMailer) {
      return {
        provider: 'pocketbase',
        recordId: pbResult.recordId || null,
        notifiedByEmail: false
      };
    }

    try {
      const smtpInfo = await proposalMailer.sendMail({
        from: MAIL_FROM,
        to: recipient,
        subject,
        text: messageWithTrace,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;">
            <h2>Nueva propuesta CAA</h2>
            <p><strong>ID envio:</strong> ${submissionId || 'n/a'}</p>
            <p><strong>Titulo:</strong> ${titulo}</p>
            <p><strong>Descripcion:</strong></p>
            <p>${String(descripcion).replace(/\n/g, '<br>')}</p>
            <p><strong>Autor:</strong> ${autor}</p>
            <p><strong>Curso:</strong> ${curso}</p>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-CL')}</p>
            <hr>
            <h3>Traza tecnica</h3>
            <p><strong>IP:</strong> ${(requestMeta && requestMeta.ip) || 'unknown'}</p>
            <p><strong>User-Agent:</strong> ${(requestMeta && requestMeta.userAgent) || 'unknown'}</p>
            <p><strong>Origin:</strong> ${(requestMeta && requestMeta.origin) || 'n/a'}</p>
            <p><strong>Referer:</strong> ${(requestMeta && requestMeta.referer) || 'n/a'}</p>
          </div>
        `
      });

      return {
        provider: 'pocketbase+smtp',
        recordId: pbResult.recordId || null,
        notifiedByEmail: true,
        smtpInfo
      };
    } catch (smtpError) {
      appendProposalAudit('proposal_notification_failed', {
        submissionId: submissionId || null,
        provider: 'smtp',
        storedIn: 'pocketbase',
        error: String(smtpError && smtpError.message ? smtpError.message : smtpError)
      });

      return {
        provider: 'pocketbase',
        recordId: pbResult.recordId || null,
        notifiedByEmail: false
      };
    }
  });
}

async function sendOrQueueProposal({ titulo, descripcion, autor, curso, mensaje, subject, requestMeta, submissionId }) {
  try {
    const providerResult = await sendProposalEmail({ titulo, descripcion, autor, curso, mensaje, subject, requestMeta, submissionId });
    return { delivered: true, queued: false, queueId: null, provider: providerResult && providerResult.provider ? providerResult.provider : 'unknown' };
  } catch (error) {
    const queue = loadProposalQueue();
    const queueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const retryAfterMs = Number(error && error.retryAfterMs) > 0 ? Number(error.retryAfterMs) : 30000;
    queue.push({
      id: queueId,
      submissionId,
      titulo,
      descripcion,
      autor,
      curso,
      mensaje,
      subject,
      requestMeta,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: String(error && error.message ? error.message : error),
      lastStatusCode: Number(error && error.statusCode ? error.statusCode : 0) || null,
      nextRetryAt: Date.now() + retryAfterMs
    });
    saveProposalQueue(queue);
    return { delivered: false, queued: true, queueId, provider: 'queue' };
  }
}

let queueWorkerRunning = false;
async function processProposalQueue() {
  if (queueWorkerRunning) return;
  queueWorkerRunning = true;

  try {
    const queue = loadProposalQueue();
    if (!queue.length) return;

    const now = Date.now();
    const pending = [];

    for (const item of queue) {
      if ((item.nextRetryAt || 0) > now) {
        pending.push(item);
        continue;
      }

      try {
        await sendProposalEmail(item);
        appendProposalAudit('proposal_retry_delivered', {
          submissionId: item.submissionId || null,
          queueId: item.id,
          attempts: Number(item.attempts || 0),
          ip: item.requestMeta && item.requestMeta.ip ? item.requestMeta.ip : 'unknown',
          title: item.titulo
        });
      } catch (error) {
        const attempts = Number(item.attempts || 0) + 1;
        const retryAfterMs = Number(error && error.retryAfterMs) > 0 ? Number(error.retryAfterMs) : 0;
        const exponentialDelayMs = Math.min(30 * 60 * 1000, 30000 * Math.pow(2, attempts));
        const delayMs = Math.max(retryAfterMs, exponentialDelayMs);
        appendProposalAudit('proposal_retry_failed', {
          submissionId: item.submissionId || null,
          queueId: item.id,
          attempts,
          ip: item.requestMeta && item.requestMeta.ip ? item.requestMeta.ip : 'unknown',
          title: item.titulo,
          statusCode: Number(error && error.statusCode ? error.statusCode : 0) || null,
          retryAfterMs,
          error: String(error && error.message ? error.message : error)
        });
        pending.push({
          ...item,
          attempts,
          lastError: String(error && error.message ? error.message : error),
          lastStatusCode: Number(error && error.statusCode ? error.statusCode : 0) || null,
          nextRetryAt: Date.now() + delayMs
        });
      }
    }

    saveProposalQueue(pending);
  } finally {
    queueWorkerRunning = false;
  }
}

app.post('/api/propuestas', async (req, res) => {
  const body = (() => {
    if (req.body && typeof req.body === 'object') {
      return req.body;
    }
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (_error) {
        return {};
      }
    }
    return {};
  })();
  const titulo = String(body.titulo || '').trim();
  const descripcion = String(body.descripcion || '').trim();
  const autor = String(body.autor || 'Anónimo').trim() || 'Anónimo';
  const curso = String(body.curso || 'No especificado').trim() || 'No especificado';
  const requestMeta = getRequestMetadata(req);
  const submissionId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  console.log('📨 Propuesta recibida:', {
    submissionId,
    titulo,
    autor,
    curso,
    recipient: getProposalRecipient(),
    ip: requestMeta.ip
  });
  appendProposalAudit('proposal_received', {
    submissionId,
    title: titulo,
    author: autor,
    course: curso,
    recipient: getProposalRecipient(),
    requestMeta
  });

  if (!titulo || !descripcion) {
    console.log('❌ Validación fallida: Título o descripción vacía');
    appendProposalAudit('proposal_invalid', {
      submissionId,
      title: titulo,
      requestMeta,
      reason: 'missing_required_fields'
    });
    return res.status(400).json({
      success: false,
      error: 'El título y la descripción son obligatorios.'
    });
  }

  const mensaje = `TÍTULO: ${titulo}\n\nDESCRIPCIÓN:\n${descripcion}\n\nAUTOR: ${autor}\nCURSO: ${curso}\nFECHA: ${new Date().toLocaleString('es-CL')}`;
  const subject = `Nueva Propuesta: ${titulo}`;

  appendProposalInbox({
    event: 'proposal_inbox_received',
    timestamp: new Date().toISOString(),
    submissionId,
    title: titulo,
    description: descripcion,
    author: autor,
    course: curso,
    requestMeta
  });

  appendReadableProposal({
    timestamp: new Date().toISOString(),
    submissionId,
    title: titulo,
    description: descripcion,
    author: autor,
    course: curso,
    requestMeta
  });

  try {
    const delivery = await sendOrQueueProposal({
      titulo,
      descripcion,
      autor,
      curso,
      mensaje,
      subject,
      requestMeta,
      submissionId
    });

    if (delivery.delivered) {
      console.log('Propuesta enviada correctamente.');
      appendProposalAudit('proposal_delivered', {
        submissionId,
        title: titulo,
        provider: delivery.provider || 'unknown',
        recipient: getProposalRecipient(),
        requestMeta
      });
      return res.json({
        success: true,
        provider: delivery.provider || 'unknown',
        message: 'Propuesta enviada'
      });
    }

    console.warn(`Propuesta en cola de reintento. ID=${delivery.queueId}`);
    appendProposalAudit('proposal_queued', {
      submissionId,
      queueId: delivery.queueId,
      title: titulo,
      recipient: getProposalRecipient(),
      requestMeta
    });
    return res.json({
      success: true,
      queued: true,
      queueId: delivery.queueId,
      message: 'Propuesta enviada'
    });
  } catch (error) {
    console.error('Error en /api/propuestas:', error.message);
    appendProposalAudit('proposal_delivery_error', {
      submissionId,
      title: titulo,
      recipient: getProposalRecipient(),
      requestMeta,
      error: String(error && error.message ? error.message : error)
    });
    return res.status(502).json({
      success: false,
      error: `No se pudo enviar la propuesta: ${error.message}`
    });
  }
});

app.get('/api/propuestas/status', (req, res) => {
  if (!isProposalStatusAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado para consultar estado de propuestas.'
    });
  }

  const queue = loadProposalQueue();
  const inboxTail = readJsonlTail(proposalInboxFile, 50);
  const auditTail = readJsonlTail(proposalAuditFile, 100);

  const countEvent = (eventName) => auditTail.filter((entry) => entry && entry.event === eventName).length;
  const recentDeliveries = auditTail
    .filter((entry) => entry && (entry.event === 'proposal_delivered' || entry.event === 'proposal_retry_delivered'))
    .slice(-10)
    .map((entry) => ({
      timestamp: entry.timestamp || null,
      submissionId: entry.submissionId || null,
      queueId: entry.queueId || null,
      provider: entry.provider || null,
      title: entry.title || null
    }));

  const oldestQueued = queue.length
    ? queue.reduce((acc, item) => {
      if (!acc) return item;
      return new Date(item.createdAt || 0).getTime() < new Date(acc.createdAt || 0).getTime() ? item : acc;
    }, null)
    : null;

  const newestQueued = queue.length
    ? queue.reduce((acc, item) => {
      if (!acc) return item;
      return new Date(item.createdAt || 0).getTime() > new Date(acc.createdAt || 0).getTime() ? item : acc;
    }, null)
    : null;

  const lastInboxEntry = inboxTail.length ? inboxTail[inboxTail.length - 1] : null;
  const lastAuditEntry = auditTail.length ? auditTail[auditTail.length - 1] : null;

  return res.json({
    success: true,
    now: new Date().toISOString(),
    recipient: getProposalRecipient(),
    monitoring: {
      tokenRequired: Boolean(PROPOSAL_STATUS_TOKEN),
      pocketBaseConfigured: Boolean(getPocketBaseBaseUrl()) && Boolean(PROPOSAL_PB_TOKEN || (PROPOSAL_PB_ADMIN_EMAIL && PROPOSAL_PB_ADMIN_PASSWORD)),
      pocketBaseCollection: PROPOSAL_PB_COLLECTION
    },
    inbox: {
      file: 'data/proposal-inbox.jsonl',
      totalEntries: getFileLineCount(proposalInboxFile),
      lastSubmissionId: lastInboxEntry ? (lastInboxEntry.submissionId || null) : null,
      lastTimestamp: lastInboxEntry ? (lastInboxEntry.timestamp || null) : null
    },
    readableLog: {
      file: 'data/propuestas-recibidas.txt',
      totalLines: getFileLineCount(proposalReadableFile)
    },
    queue: {
      file: 'data/proposal-queue.json',
      length: queue.length,
      oldestSubmissionId: oldestQueued ? (oldestQueued.submissionId || null) : null,
      oldestCreatedAt: oldestQueued ? (oldestQueued.createdAt || null) : null,
      newestSubmissionId: newestQueued ? (newestQueued.submissionId || null) : null,
      newestCreatedAt: newestQueued ? (newestQueued.createdAt || null) : null,
      nextRetryAt: queue
        .map((item) => Number(item.nextRetryAt || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b)
        .slice(0, 1)
        .map((value) => new Date(value).toISOString())[0] || null
    },
    recent: {
      deliveriesInTail: recentDeliveries.length,
      deliveredEventsInTail: countEvent('proposal_delivered'),
      retryDeliveredEventsInTail: countEvent('proposal_retry_delivered'),
      queuedEventsInTail: countEvent('proposal_queued'),
      failedRetryEventsInTail: countEvent('proposal_retry_failed'),
      lastAuditEvent: lastAuditEntry ? {
        event: lastAuditEntry.event || null,
        timestamp: lastAuditEntry.timestamp || null,
        submissionId: lastAuditEntry.submissionId || null
      } : null,
      lastDeliveries: recentDeliveries
    }
  });
});

app.get('/api/propuestas/pending', (req, res) => {
  if (!isProposalStatusAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado para consultar propuestas pendientes.'
    });
  }

  const queue = loadProposalQueue();
  const limit = Math.max(1, Math.min(200, Number(req.query && req.query.limit) || 50));

  const items = queue
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    })
    .slice(0, limit)
    .map((item) => ({
      queueId: item.id || null,
      submissionId: item.submissionId || null,
      titulo: item.titulo || null,
      descripcion: item.descripcion || null,
      autor: item.autor || null,
      curso: item.curso || null,
      createdAt: item.createdAt || null,
      attempts: Number(item.attempts || 0),
      lastStatusCode: Number(item.lastStatusCode || 0) || null,
      lastError: item.lastError || null,
      nextRetryAt: Number(item.nextRetryAt || 0) > 0 ? new Date(Number(item.nextRetryAt)).toISOString() : null,
      requestMeta: item.requestMeta || null
    }));

  return res.json({
    success: true,
    count: items.length,
    totalQueued: queue.length,
    recipient: getProposalRecipient(),
    items
  });
});

app.get('/api/propuestas/log.txt', (req, res) => {
  if (!isProposalStatusAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado para consultar el log de propuestas.'
    });
  }

  ensureProposalReadableFile();
  try {
    const text = fs.readFileSync(proposalReadableFile, 'utf8');
    res.type('text/plain; charset=utf-8');
    return res.send(text);
  } catch (_error) {
    return res.status(500).type('text/plain; charset=utf-8').send('No se pudo leer el log de propuestas.');
  }
});

// Endpoint para obtener imágenes de la galería
app.get('/api/gallery/images', (req, res) => {
  const galleryDir = path.join(uploadsDir, 'Galeria');
  
  // Crear carpeta si no existe
  if (!fs.existsSync(galleryDir)) {
    fs.mkdirSync(galleryDir, { recursive: true });
    return res.json({ success: true, images: [] });
  }
  
  fs.readdir(galleryDir, (err, files) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.json({ success: true, images: [] });
      }
      return res.status(500).json({ success: false, message: 'No se pudo leer el directorio' });
    }
    
    // Filtrar solo archivos de imagen
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const images = files
      .filter(name => !name.startsWith('.') && imageExtensions.includes(path.extname(name).toLowerCase()))
      .sort(); // Ordenar alfabéticamente
    
    res.json({ success: true, images });
  });
});

// ============================================
// RUTAS DE CONFIGURACIÓN (Admin Panel)
// ============================================

function readBRS100Config() {
  ensureConfigDir();
  const configFile = path.join(configDir, 'brs100palabras.json');
  if (!fs.existsSync(configFile)) {
    return { enabled: true };
  }
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (_error) {
    return { enabled: true };
  }
}

// Asegurar que existe el directorio de configuración
function ensureConfigDir() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

// GET: Obtener configuración de BRS 100 Palabras
app.get('/api/config/brs100palabras', (req, res) => {
  ensureConfigDir();
  const configFile = path.join(configDir, 'brs100palabras.json');
  
  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      res.json(config);
    } else {
      // Configuración por defecto si no existe el archivo
      const defaultConfig = {
        moduleName: 'BRS en 100 Palabras',
        enabled: true,
        lastModified: new Date().toISOString(),
        features: {
          popup: { enabled: true, name: 'Popup de Bienvenida', description: 'Mostrar popup en la página de inicio' },
          participaPage: { enabled: true, name: 'Página de Participación', description: 'Permitir acceso a participa.html' },
          reglasPage: { enabled: true, name: 'Página de Reglas', description: 'Mostrar reglas del concurso' },
          rubricaPage: { enabled: true, name: 'Página de Rúbrica', description: 'Mostrar criterios de evaluación' },
          uploadForm: { enabled: true, name: 'Formulario de Envío', description: 'Permitir envío de participaciones' },
          gallery: { enabled: true, name: 'Galería de Participaciones', description: 'Mostrar participaciones enviadas' }
        }
      };
      res.json(defaultConfig);
    }
  } catch (error) {
    console.error('Error reading config:', error);
    res.status(500).json({ success: false, message: 'Error al leer configuración' });
  }
});

// POST: Guardar configuración de BRS 100 Palabras
app.post('/api/config/brs100palabras', (req, res) => {
  ensureConfigDir();
  const configFile = path.join(configDir, 'brs100palabras.json');
  
  try {
    const config = req.body;
    config.lastModified = new Date().toISOString();
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, message: 'Configuración guardada', config });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ success: false, message: 'Error al guardar configuración' });
  }
});

// GET: Obtener todas las configuraciones
app.get('/api/config', (req, res) => {
  ensureConfigDir();
  try {
    const files = fs.readdirSync(configDir);
    const configs = {};
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const configName = file.replace('.json', '');
        configs[configName] = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
      }
    });
    
    res.json({ success: true, configs });
  } catch (error) {
    console.error('Error reading configs:', error);
    res.status(500).json({ success: false, message: 'Error al leer configuraciones' });
  }
});

// ============================================
// SERVIR ARCHIVOS ESTÁTICOS (después de API)
// ============================================

// Bloqueo total del modulo BRS 100 Palabras cuando está deshabilitado.
app.use('/brs100palabras', (req, res, next) => {
  const config = readBRS100Config();
  if (config && config.enabled === false) {
    return res.redirect('/');
  }
  next();
});

// INTERCEPTAR index.html de BRS100 para inyectar configuración
app.get('/brs100palabras/index.html', (req, res) => {
  ensureConfigDir();
  const configFile = path.join(configDir, 'brs100palabras.json');
  
  try {
    let config = {
      enabled: true,
      features: {
        popup: { enabled: true }
      }
    };
    
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
    
    // Leer el HTML
    const htmlPath = path.join(__dirname, 'brs100palabras', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Si el módulo está deshabilitado, remover el popup del HTML completamente
    if (!config.enabled) {
      html = html.replace(/<div class="popup-overlay"[\s\S]*?<\/div>\s*<script src="app.js"><\/script>/, '<script src="app.js"><\/script>');
    }
    
    // Inyectar la configuración
    const configScript = `<script>window.BRS100_CONFIG=${JSON.stringify(config)};</script>`;
    html = html.replace('<script src="app.js"></script>', configScript + '\n  <script src="app.js"></script>');
    
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(html);
  } catch (error) {
    console.error('Error serving BRS100 index:', error);
    res.status(500).send('Error cargando página');
  }
});

// Bloqueo temporal del modulo de credencial estudiantil.
app.use('/credencial-caa', (_req, res) => {
  res.status(404).send('Seccion temporalmente no disponible.');
});

// Servir panel admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Cache agresivo para imágenes (30 días)
app.use('/Images', express.static(uploadsDir, { 
  maxAge: '30d', 
  etag: true,
  setHeaders: (res, _filePath) => {
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
  }
}));
// Cache moderado para otros archivos (1 día)
app.use(express.static(path.join(__dirname), { 
  maxAge: '1d', 
  etag: true,
  setHeaders: (res, filePath) => {
    if (path.extname(filePath).toLowerCase() === '.html') {
      // Evita que vistas HTML queden obsoletas durante desarrollo y cambios frecuentes.
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
    }
  }
}));

// Manejo de errores
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message || 'Error al subir archivo' });
  }
  next();
});

// Catch-all: servir index.html para rutas no encontradas
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
  ensureProposalQueueFile();
  ensureProposalInboxFile();
  ensureProposalReadableFile();
  regenerateProposalReadableFile(); // Regenera desde JSONL si está vacío
  setInterval(processProposalQueue, 30000).unref();
  processProposalQueue().catch((error) => {
    console.error('Error al procesar cola inicial de propuestas:', error.message);
  });
});

