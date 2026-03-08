const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 3000;
const INSTITUTIONAL_DOMAIN = 'britishroyalschool.cl';

const publicDir = path.join(__dirname, 'public');
const studentsDbPath = path.join(__dirname, 'data', 'students.json');

app.use(express.json());
app.use(express.static(publicDir));

async function readStudents() {
  const data = await fs.readFile(studentsDbPath, 'utf8');
  return JSON.parse(data);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isInstitutionalEmail(email) {
  return email.endsWith(`@${INSTITUTIONAL_DOMAIN}`);
}

function toPublicStudent(student) {
  return {
    name: student.name,
    course: student.course,
    rut: student.rut,
    photoUrl: student.photoUrl
  };
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/tarjeta', (_req, res) => {
  res.sendFile(path.join(publicDir, 'tarjeta.html'));
});

app.post('/api/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  if (!isInstitutionalEmail(email)) {
    return res.status(400).json({
      error: `Debes usar un correo institucional @${INSTITUTIONAL_DOMAIN}.`
    });
  }

  try {
    const students = await readStudents();
    const student = students.find((item) => normalizeEmail(item.email) === email);

    if (!student) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    return res.json({
      success: true,
      email,
      student: toPublicStudent(student)
    });
  } catch (error) {
    console.error('Error en /api/login:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/students/:email', async (req, res) => {
  const email = normalizeEmail(req.params.email);

  if (!isInstitutionalEmail(email)) {
    return res.status(400).json({
      error: `Debes usar un correo institucional @${INSTITUTIONAL_DOMAIN}.`
    });
  }

  try {
    const students = await readStudents();
    const student = students.find((item) => normalizeEmail(item.email) === email);

    if (!student) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    return res.json({ student: toPublicStudent(student) });
  } catch (error) {
    console.error('Error en /api/students/:email:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
