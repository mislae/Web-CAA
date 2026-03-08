const loginForm = document.getElementById('login-form');
const loginInput = document.getElementById('institutional-email');
const loginButton = document.getElementById('login-button');
const loginMessage = document.getElementById('login-message');

function setMessage(message, isError = false) {
	if (!loginMessage) {
		return;
	}

	loginMessage.textContent = message;
	loginMessage.dataset.state = isError ? 'error' : 'ok';
}

async function handleLoginSubmit(event) {
	event.preventDefault();

	if (!loginInput || !loginButton) {
		return;
	}

	const email = loginInput.value.trim().toLowerCase();
	if (!email) {
		setMessage('Ingresa tu correo institucional.', true);
		return;
	}

	loginButton.disabled = true;
	setMessage('Validando acceso...');

	try {
		const response = await fetch('/api/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email })
		});

		const payload = await response.json();
		if (!response.ok) {
			setMessage(payload.error || 'No se pudo iniciar sesion.', true);
			return;
		}

		window.location.href = `/tarjeta?email=${encodeURIComponent(payload.email)}`;
	} catch (error) {
		console.error('Error en login:', error);
		setMessage('Error de conexion con el servidor.', true);
	} finally {
		loginButton.disabled = false;
	}
}

if (loginForm) {
	loginForm.addEventListener('submit', handleLoginSubmit);
}
