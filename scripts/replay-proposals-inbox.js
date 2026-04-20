#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (_error) {
  nodemailer = null;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const INBOX_FILE = path.join(DATA_DIR, 'proposal-inbox.jsonl');
const AUDIT_FILE = path.join(DATA_DIR, 'proposal-audit.jsonl');
const DEFAULT_TO = String(process.env.PROPOSAL_EMERGENCY_RECIPIENT || '').trim();
const DEFAULT_LIMIT = 50;
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
const DEFAULT_DELAY_MS = Math.max(0, Number(process.env.PROPOSAL_REPLAY_DELAY_MS || 1200) || 1200);
const DEFAULT_MAX_RETRIES = Math.max(0, Number(process.env.PROPOSAL_REPLAY_MAX_RETRIES || 2) || 2);

function parseArgs(argv) {
  const args = {
    to: DEFAULT_TO,
    limit: DEFAULT_LIMIT,
    since: null,
    dryRun: false,
    onlyFailed: false,
    delayMs: DEFAULT_DELAY_MS,
    maxRetries: DEFAULT_MAX_RETRIES
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--to' && argv[i + 1]) {
      args.to = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === '--limit' && argv[i + 1]) {
      args.limit = Math.max(1, Number(argv[i + 1]) || DEFAULT_LIMIT);
      i += 1;
      continue;
    }
    if (token === '--since' && argv[i + 1]) {
      args.since = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--only-failed') {
      args.onlyFailed = true;
      continue;
    }
    if (token === '--delay-ms' && argv[i + 1]) {
      args.delayMs = Math.max(0, Number(argv[i + 1]) || DEFAULT_DELAY_MS);
      i += 1;
      continue;
    }
    if (token === '--max-retries' && argv[i + 1]) {
      args.maxRetries = Math.max(0, Number(argv[i + 1]) || DEFAULT_MAX_RETRIES);
      i += 1;
      continue;
    }
  }

  return args;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function appendAudit(event, payload) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    ...payload
  };
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function createMailer() {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
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

async function saveReplayToPocketBase(message, textBody, subject) {
  const baseUrl = getPocketBaseBaseUrl();
  if (!baseUrl) {
    const configError = new Error('PocketBase no configurado (PROPOSAL_PB_URL).');
    configError.provider = 'pocketbase';
    configError.transient = false;
    throw configError;
  }

  const token = await getPocketBaseAuthToken();
  if (!token) {
    const authError = new Error('PocketBase no configurado con token/admin.');
    authError.provider = 'pocketbase';
    authError.transient = false;
    throw authError;
  }

  const payload = {
    submissionId: message.submissionId || null,
    titulo: message.title || 'Sin titulo',
    descripcion: message.description || '',
    autor: message.author || 'Anónimo',
    curso: message.course || 'No especificado',
    mensaje: textBody,
    subject,
    ip: (message.requestMeta && message.requestMeta.ip) || 'unknown',
    userAgent: (message.requestMeta && message.requestMeta.userAgent) || 'unknown',
    origin: (message.requestMeta && message.requestMeta.origin) || 'n/a',
    referer: (message.requestMeta && message.requestMeta.referer) || 'n/a',
    requestMetaRaw: JSON.stringify(message.requestMeta || {}),
    status: 'replayed',
    replayedFromInbox: true,
    originalTimestamp: message.timestamp || null,
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

async function sendReplayMessage(mailer, to, message) {
  const textBody = [
    `REPROCESAMIENTO DE EMERGENCIA`,
    `ID original: ${message.submissionId || 'n/a'}`,
    `Fecha original: ${message.timestamp || 'n/a'}`,
    `Titulo: ${message.title || 'Sin titulo'}`,
    '',
    'Descripcion:',
    message.description || '',
    '',
    `Autor: ${message.author || 'Anónimo'}`,
    `Curso: ${message.course || 'No especificado'}`,
    `IP origen: ${(message.requestMeta && message.requestMeta.ip) || 'unknown'}`,
    `UA origen: ${(message.requestMeta && message.requestMeta.userAgent) || 'unknown'}`
  ].join('\n');

  const subject = `[REPLAY] Nueva Propuesta: ${message.title || 'Sin titulo'} (${message.submissionId || 'n/a'})`;

  const stored = await saveReplayToPocketBase(message, textBody, subject);

  if (mailer && to) {
    try {
      await mailer.sendMail({
        from: MAIL_FROM,
        to,
        subject,
        text: textBody
      });
      return { provider: 'pocketbase+smtp', recordId: stored.recordId || null };
    } catch (_error) {
      return { provider: 'pocketbase', recordId: stored.recordId || null };
    }
  }

  return { provider: 'pocketbase', recordId: stored.recordId || null };
}

function parseSinceDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.to && !isValidEmail(args.to)) {
    console.error('Correo destino invalido. Usa --to correo@dominio.com');
    process.exit(1);
  }

  const since = parseSinceDate(args.since);
  if (args.since && !since) {
    console.error('Fecha invalida en --since. Usa formato ISO, ejemplo 2026-04-17T00:00:00Z');
    process.exit(1);
  }

  const inbox = readJsonl(INBOX_FILE);
  const audit = readJsonl(AUDIT_FILE);
  const replayedIds = new Set(
    audit
      .filter((entry) => entry && entry.event === 'proposal_inbox_replay_sent' && entry.submissionId)
      .map((entry) => String(entry.submissionId))
  );

  const failedIds = new Set(
    audit
      .filter((entry) => entry && ['proposal_delivery_error', 'proposal_retry_failed', 'proposal_inbox_replay_failed'].includes(entry.event) && entry.submissionId)
      .map((entry) => String(entry.submissionId))
  );

  let selected = inbox
    .filter((entry) => entry && entry.submissionId)
    .filter((entry) => !replayedIds.has(String(entry.submissionId)));

  if (since) {
    selected = selected.filter((entry) => {
      const t = new Date(entry.timestamp || 0).getTime();
      return Number.isFinite(t) && t >= since.getTime();
    });
  }

  if (args.onlyFailed) {
    selected = selected.filter((entry) => failedIds.has(String(entry.submissionId)));
  }

  selected = selected.slice(Math.max(0, selected.length - args.limit));

  console.log(`Total inbox: ${inbox.length}`);
  console.log(`Candidatos a replay: ${selected.length}`);
  console.log(`Destino emergencia: ${args.to || '(omitido)'}`);
  console.log(`Delay entre envios: ${args.delayMs} ms`);
  console.log(`Max reintentos por mensaje: ${args.maxRetries}`);

  if (!selected.length) {
    console.log('No hay propuestas pendientes de replay con los filtros actuales.');
    process.exit(0);
  }

  if (args.dryRun) {
    console.log('Modo dry-run activado. No se enviaron correos.');
    console.log(selected.map((item) => `${item.submissionId} | ${item.title || 'Sin titulo'}`).join('\n'));
    process.exit(0);
  }

  const mailer = createMailer();
  let ok = 0;
  let fail = 0;

  for (const item of selected) {
    try {
      let delivery = null;
      let attempt = 0;

      while (attempt <= args.maxRetries) {
        try {
          delivery = await sendReplayMessage(mailer, args.to, item);
          break;
        } catch (error) {
          const retriesLeft = args.maxRetries - attempt;
          const canRetry = Boolean(error && error.transient) && retriesLeft > 0;
          if (!canRetry) {
            throw error;
          }

          const providerDelayMs = Number(error && error.retryAfterMs) > 0 ? Number(error.retryAfterMs) : 0;
          const backoffMs = Math.min(120000, 1500 * Math.pow(2, attempt));
          const waitMs = Math.max(providerDelayMs, backoffMs);
          console.warn(`Retry ${item.submissionId}: espera ${waitMs}ms por error transitorio (${error.message})`);
          await sleep(waitMs);
        }
        attempt += 1;
      }

      ok += 1;
      appendAudit('proposal_inbox_replay_sent', {
        submissionId: item.submissionId,
        title: item.title || null,
        emergencyRecipient: args.to,
        provider: delivery && delivery.provider ? delivery.provider : 'unknown'
      });
      console.log(`OK ${item.submissionId} (${item.title || 'Sin titulo'})`);
    } catch (error) {
      fail += 1;
      appendAudit('proposal_inbox_replay_failed', {
        submissionId: item.submissionId,
        title: item.title || null,
        emergencyRecipient: args.to,
        statusCode: Number(error && error.statusCode ? error.statusCode : 0) || null,
        retryAfterMs: Number(error && error.retryAfterMs ? error.retryAfterMs : 0) || null,
        error: String(error && error.message ? error.message : error)
      });
      console.error(`FAIL ${item.submissionId}: ${error.message}`);
    }

    await sleep(args.delayMs);
  }

  console.log(`Replay terminado. Exitosos: ${ok}. Fallidos: ${fail}.`);
  process.exit(fail > 0 ? 2 : 0);
})().catch((error) => {
  console.error('Error fatal replay:', error.message);
  process.exit(1);
});
