const fs = require('node:fs/promises');
const { parse } = require('csv-parse/sync');
const { initDatabase, normalizeEmail } = require('../db');

const DEFAULT_DOMAIN = process.env.ALUMNI_DOMAIN || 'alumnos.brs.cl';

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return '';
  }
  return process.argv[index + 1] || '';
}

function hasInstitutionalDomain(email) {
  return email.endsWith(`@${DEFAULT_DOMAIN}`);
}

function printUsage() {
  console.log('Uso: node scripts/import-students.js --file data/students.csv');
  console.log('Columnas requeridas: email,name,course,rut,photoUrl');
}

async function main() {
  const filePath = getArgValue('--file');
  if (!filePath) {
    printUsage();
    process.exit(1);
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const db = await initDatabase();
  const now = Date.now();

  let processed = 0;
  let skipped = 0;

  await db.exec('BEGIN');
  try {
    for (const row of records) {
      const email = normalizeEmail(row.email);
      const name = String(row.name || '').trim();
      const course = String(row.course || '').trim();
      const rut = String(row.rut || '').trim();
      const photoUrl = String(row.photoUrl || '').trim();

      if (!email || !name || !course || !rut || !hasInstitutionalDomain(email)) {
        skipped += 1;
        continue;
      }

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

      processed += 1;
    }

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }

  console.log(`Importacion completada. Procesados: ${processed}. Omitidos: ${skipped}.`);
}

main().catch((error) => {
  console.error('Error importando estudiantes:', error.message);
  process.exit(1);
});
