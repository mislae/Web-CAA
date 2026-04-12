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
app.use(express.json()); // Parsear bodys JSON para API
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
// RUTAS DE CONFIGURACIÓN (Admin Panel)
// ============================================

const configDir = path.join(__dirname, 'config');

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
});

