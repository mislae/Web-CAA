const card = document.querySelector('.card-container');
const securityClock = document.getElementById('reloj-seguridad');
const nameField = document.getElementById('student-name');
const courseField = document.getElementById('student-course');
const rutField = document.getElementById('student-rut');
const photoField = document.getElementById('student-photo');

function formatTwoDigits(value) {
  return String(value).padStart(2, '0');
}

function updateSecurityClock() {
  if (!securityClock) {
    return;
  }

  const now = new Date();
  const timeText = [
    formatTwoDigits(now.getHours()),
    formatTwoDigits(now.getMinutes()),
    formatTwoDigits(now.getSeconds())
  ].join(':');

  securityClock.textContent = timeText;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const normalized = (value - inMin) / (inMax - inMin);
  return outMin + normalized * (outMax - outMin);
}

function applyGlareFromOrientation(beta, gamma) {
  if (!card) {
    return;
  }

  const safeBeta = clamp(beta ?? 0, -45, 45);
  const safeGamma = clamp(gamma ?? 0, -45, 45);

  const glareX = mapRange(safeGamma, -45, 45, 10, 90);
  const glareY = mapRange(safeBeta, -45, 45, 15, 85);

  card.style.setProperty('--glare-x', `${glareX.toFixed(2)}%`);
  card.style.setProperty('--glare-y', `${glareY.toFixed(2)}%`);
}

function onDeviceOrientation(event) {
  applyGlareFromOrientation(event.beta, event.gamma);
}

function startOrientationTracking() {
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
}

function createSensorPermissionButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'activar-giroscopio';
  button.textContent = 'Activar efecto holografico';
  button.style.position = 'fixed';
  button.style.left = '50%';
  button.style.bottom = '1rem';
  button.style.transform = 'translateX(-50%)';
  button.style.zIndex = '999';
  button.style.padding = '0.65rem 1rem';
  button.style.borderRadius = '999px';
  button.style.border = '1px solid rgba(255,255,255,0.35)';
  button.style.background = 'rgba(0, 42, 92, 0.85)';
  button.style.color = '#f4f7ff';
  button.style.fontWeight = '700';
  button.style.backdropFilter = 'blur(8px)';
  return button;
}

async function requestOrientationPermissionAndStart() {
  const supportsOrientation = 'DeviceOrientationEvent' in window;
  if (!supportsOrientation) {
    return;
  }

  const needsIOSPermission =
    typeof DeviceOrientationEvent.requestPermission === 'function';

  if (!needsIOSPermission) {
    startOrientationTracking();
    return;
  }

  const permissionButton = createSensorPermissionButton();
  document.body.appendChild(permissionButton);

  permissionButton.addEventListener('click', async () => {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission === 'granted') {
        startOrientationTracking();
        permissionButton.remove();
      } else {
        permissionButton.textContent = 'Permiso de movimiento denegado';
      }
    } catch (error) {
      permissionButton.textContent = 'No se pudo activar el giroscopio';
      console.error('Error solicitando permiso de orientacion:', error);
    }
  });
}

function getEmailFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('email') || '').trim().toLowerCase();
}

function renderStudent(student) {
  if (!student) {
    return;
  }

  nameField.textContent = student.name;
  courseField.textContent = student.course;
  rutField.textContent = `RUT: ${student.rut}`;
  photoField.src = student.photoUrl;
  photoField.alt = `Foto de ${student.name}`;
}

async function loadStudentData() {
  const email = getEmailFromQuery();
  if (!email) {
    window.location.href = '/';
    return;
  }

  try {
    const response = await fetch(`/api/students/${encodeURIComponent(email)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Alumno no encontrado.');
    }

    renderStudent(payload.student);
  } catch (error) {
    console.error('Error cargando alumno:', error);
    nameField.textContent = 'No se pudo cargar la credencial';
    courseField.textContent = 'Verifica tus datos e intenta nuevamente';
    rutField.textContent = '';
  }
}

updateSecurityClock();
setInterval(updateSecurityClock, 1000);
requestOrientationPermissionAndStart();
loadStudentData();
