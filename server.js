require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 5 * 1024 * 1024); // 5MB por defecto

const uploadsDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'Images'));

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
app.disable('x-powered-by');

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
// SERVIR ARCHIVOS ESTÁTICOS (después de API)
// ============================================
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
  etag: true 
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
});
