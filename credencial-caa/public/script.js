const loginForm = document.getElementById('login-form');
const loginInput = document.getElementById('institutional-email');
const verificationStep = document.getElementById('verification-step');
const verificationCodeInput = document.getElementById('verification-code');
const requestCodeButton = document.getElementById('request-code-button');
const verifyCodeButton = document.getElementById('verify-code-button');
const changeEmailButton = document.getElementById('change-email-button');
const loginMessage = document.getElementById('login-message');
const topBackButton = document.getElementById('top-back-button');
const SESSION_KEY = 'caa_credencial_email';
const SESSION_TOKEN_KEY = 'caa_credencial_token';

let pendingEmail = '';

function setMessage(message, isError = false) {
	if (!loginMessage) {
		return;
	}

	loginMessage.textContent = message;
	loginMessage.dataset.state = isError ? 'error' : 'ok';
}

function setVerifyMode(enabled) {
	if (!verificationStep || !requestCodeButton || !verifyCodeButton || !changeEmailButton || !loginInput) {
		return;
	}

	verificationStep.classList.toggle('is-hidden', !enabled);
	verifyCodeButton.classList.toggle('is-hidden', !enabled);
	changeEmailButton.classList.toggle('is-hidden', !enabled);
	requestCodeButton.classList.toggle('is-hidden', enabled);
	loginInput.readOnly = enabled;
}

async function requestVerificationCode() {
	if (!loginInput || !requestCodeButton) {
		return;
	}

	const email = loginInput.value.trim().toLowerCase();
	if (!email) {
		setMessage('Ingresa tu correo institucional.', true);
		return;
	}

	requestCodeButton.disabled = true;
	setMessage('Enviando codigo de verificacion...');

	try {
		const response = await fetch('/api/login/request-code', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email })
		});

		const payload = await response.json();
		if (!response.ok) {
			setMessage(payload.error || 'No se pudo enviar el codigo.', true);
			return;
		}

		pendingEmail = email;
		setVerifyMode(true);
		if (verificationCodeInput) {
			verificationCodeInput.value = '';
			verificationCodeInput.focus();
		}
		setMessage('Codigo enviado. Revisa tu correo institucional.');
	} catch (error) {
		console.error('Error solicitando codigo:', error);
		setMessage('Error de conexion con el servidor.', true);
	} finally {
		requestCodeButton.disabled = false;
	}
}

async function handleLoginSubmit(event) {
	event.preventDefault();

	if (!verifyCodeButton || !verificationCodeInput) {
		return;
	}

	const email = pendingEmail || loginInput.value.trim().toLowerCase();
	const code = verificationCodeInput.value.trim();

	if (!email || !code) {
		setMessage('Ingresa el codigo de verificacion.', true);
		return;
	}

	verifyCodeButton.disabled = true;
	setMessage('Verificando codigo...');

	try {
		const response = await fetch('/api/login/verify-code', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email, code })
		});

		const payload = await response.json();
		if (!response.ok) {
			setMessage(payload.error || 'No se pudo verificar el codigo.', true);
			return;
		}

		localStorage.setItem(SESSION_KEY, payload.email);
		localStorage.setItem(SESSION_TOKEN_KEY, payload.sessionToken);
		window.location.href = '/tarjeta';
	} catch (error) {
		console.error('Error verificando codigo:', error);
		setMessage('Error de conexion con el servidor.', true);
	} finally {
		verifyCodeButton.disabled = false;
	}
}

if (loginForm) {
	loginForm.addEventListener('submit', handleLoginSubmit);
}

if (requestCodeButton) {
	requestCodeButton.addEventListener('click', requestVerificationCode);
}

if (changeEmailButton) {
	changeEmailButton.addEventListener('click', () => {
		pendingEmail = '';
		setVerifyMode(false);
		setMessage('');
		if (loginInput) {
			loginInput.focus();
		}
	});
}

function configureBackButton() {
	if (!topBackButton) {
		return;
	}

	topBackButton.addEventListener('click', () => {
		if (window.history.length > 1) {
			window.history.back();
			return;
		}

		window.location.href = '/';
	});
}

function restoreSavedSession() {
	const savedEmail = (localStorage.getItem(SESSION_KEY) || '').trim().toLowerCase();
	const savedToken = (localStorage.getItem(SESSION_TOKEN_KEY) || '').trim();
	if (!savedEmail || !savedToken) {
		return;
	}

	window.location.href = '/tarjeta';
}

restoreSavedSession();
configureBackButton();
