const crypto = require('node:crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('node:path');
const { initDatabase, normalizeEmail } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ALUMNI_DOMAIN = process.env.ALUMNI_DOMAIN || 'alumnos.brs.cl';
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const OTP_SECRET = process.env.OTP_SECRET || 'change-this-otp-secret';

const MAIL_FROM = process.env.MAIL_FROM;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

const publicDir = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(publicDir));

function createTransporter() {
  if (!MAIL_FROM || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

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

const mailer = createTransporter();

function hashOtp(email, code) {
  return crypto
    .createHash('sha256')
    .update(`${email}:${code}:${OTP_SECRET}`)
    .digest('hex');
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isInstitutionalEmail(email) {
  return email.endsWith(`@${ALUMNI_DOMAIN}`);
}

function toPublicStudent(student) {
  return {
    name: student.name,
    course: student.course,
    rut: student.rut,
    photoUrl: student.photo_url
  };
}

async function getStudentByEmail(email) {
  const db = await initDatabase();
  return db.get(
    'SELECT email, name, course, rut, photo_url FROM students WHERE email = ?',
    [email]
  );
}

async function sendVerificationEmail(email, code) {
  if (!mailer) {
    throw new Error('Servicio de correo no configurado en el servidor.');
  }

  await mailer.sendMail({
    from: MAIL_FROM,
    to: email,
    subject: 'Codigo de verificacion - Credencial CAA',
    text: `Tu codigo de verificacion es: ${code}. Expira en ${OTP_TTL_MINUTES} minutos.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;">
        <h2>Credencial CAA</h2>
        <p>Tu codigo de verificacion es:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:3px;">${code}</p>
        <p>Este codigo expira en ${OTP_TTL_MINUTES} minutos.</p>
      </div>
    `
  });
}

async function createSession(email) {
  const db = await initDatabase();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const token = crypto.randomBytes(32).toString('hex');

  await db.run(
    `
      INSERT INTO auth_sessions (token, email, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `,
    [token, email, expiresAt, now]
  );

  return token;
}

async function getSessionFromToken(token) {
  const db = await initDatabase();
  const now = Date.now();
  return db.get(
    `
      SELECT token, email, expires_at
      FROM auth_sessions
      WHERE token = ? AND expires_at > ?
    `,
    [token, now]
  );
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return header.slice(7).trim();
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/tarjeta', (_req, res) => {
  res.sendFile(path.join(publicDir, 'tarjeta.html'));
});

app.post('/api/login/request-code', async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  if (!isInstitutionalEmail(email)) {
    return res.status(400).json({
      error: `Debes usar un correo institucional @${ALUMNI_DOMAIN}.`
    });
  }

  try {
    const student = await getStudentByEmail(email);
    if (!student) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    const db = await initDatabase();
    const now = Date.now();
    const expiresAt = now + OTP_TTL_MINUTES * 60 * 1000;
    const code = generateOtpCode();
    const codeHash = hashOtp(email, code);

    await db.run('DELETE FROM login_codes WHERE email = ? OR expires_at <= ?', [email, now]);
    await db.run(
      `
        INSERT INTO login_codes (email, code_hash, expires_at, used_at, created_at)
        VALUES (?, ?, ?, NULL, ?)
      `,
      [email, codeHash, expiresAt, now]
    );

    await sendVerificationEmail(email, code);

    return res.json({ success: true, message: 'Codigo enviado al correo institucional.' });
  } catch (error) {
    console.error('Error en /api/login/request-code:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
});

app.post('/api/login/verify-code', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();

  if (!email || !code) {
    return res.status(400).json({ error: 'Correo y codigo son obligatorios.' });
  }

  if (!isInstitutionalEmail(email)) {
    return res.status(400).json({
      error: `Debes usar un correo institucional @${ALUMNI_DOMAIN}.`
    });
  }

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'El codigo debe tener 6 digitos.' });
  }

  try {
    const db = await initDatabase();
    const now = Date.now();
    const loginCode = await db.get(
      `
        SELECT rowid, code_hash, expires_at
        FROM login_codes
        WHERE email = ? AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [email]
    );

    if (!loginCode || loginCode.expires_at <= now) {
      return res.status(401).json({ error: 'Codigo invalido o expirado.' });
    }

    const expectedHash = hashOtp(email, code);
    if (expectedHash !== loginCode.code_hash) {
      return res.status(401).json({ error: 'Codigo invalido o expirado.' });
    }

    await db.run('UPDATE login_codes SET used_at = ? WHERE rowid = ?', [now, loginCode.rowid]);

    const student = await getStudentByEmail(email);
    if (!student) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    const sessionToken = await createSession(email);
    return res.json({
      success: true,
      email,
      sessionToken,
      student: toPublicStudent(student)
    });
  } catch (error) {
    console.error('Error en /api/login/verify-code:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/students/me', async (req, res) => {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Sesion no valida.' });
  }

  try {
    const session = await getSessionFromToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Sesion no valida o expirada.' });
    }

    const student = await getStudentByEmail(session.email);
    if (!student) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    return res.json({ student: toPublicStudent(student) });
  } catch (error) {
    console.error('Error en /api/students/me:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/logout', async (req, res) => {
  const token = readBearerToken(req);
  if (!token) {
    return res.json({ success: true });
  }

  try {
    const db = await initDatabase();
    await db.run('DELETE FROM auth_sessions WHERE token = ?', [token]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error en /api/logout:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor listo en http://localhost:${PORT}`);
      console.log(`Dominio institucional permitido: @${ALUMNI_DOMAIN}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo iniciar la base de datos:', error);
    process.exit(1);
  });
