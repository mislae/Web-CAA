const { initDatabase, normalizeEmail } = require('../db');

const DEFAULT_DOMAIN = process.env.ALUMNI_DOMAIN || 'alumnos.brs.cl';

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return '';
  }
  return process.argv[index + 1] || '';
}

function printUsage() {
  console.log('Uso: node scripts/add-student.js --email a@alumnos.brs.cl --name "Nombre" --course "4to Medio A" --rut "12.345.678-9" --photoUrl "https://..."');
}

async function main() {
  const email = normalizeEmail(getArgValue('--email'));
  const name = String(getArgValue('--name')).trim();
  const course = String(getArgValue('--course')).trim();
  const rut = String(getArgValue('--rut')).trim();
  const photoUrl = String(getArgValue('--photoUrl')).trim();

  if (!email || !name || !course || !rut) {
    printUsage();
    process.exit(1);
  }

  if (!email.endsWith(`@${DEFAULT_DOMAIN}`)) {
    console.error(`El correo debe ser del dominio @${DEFAULT_DOMAIN}.`);
    process.exit(1);
  }

  const db = await initDatabase();
  const now = Date.now();

  await db.run(
    `
      INSERT INTO students (email, name, course, rut, photo_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        course = excluded.course,
        rut = excluded.rut,
        photo_url = excluded.photo_url,
        updated_at = excluded.updated_at
    `,
    [email, name, course, rut, photoUrl, now, now]
  );

  console.log(`Alumno guardado correctamente: ${email}`);
}

main().catch((error) => {
  console.error('Error guardando alumno:', error.message);
  process.exit(1);
});
