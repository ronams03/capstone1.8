// Login page with secure math captcha
let captchaToken = null;
let captchaExpectedAnswer = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    loadCaptcha();

    // Refresh captcha button
    document.getElementById('refreshCaptcha').addEventListener('click', loadCaptcha);

    // Form submission
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Prevent form submission on Enter in captcha field
    document.getElementById('captcha').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('loginForm').dispatchEvent(new Event('submit'));
        }
    });

    // Live captcha correctness indicator while typing
    document.getElementById('captcha').addEventListener('input', updateCaptchaIndicator);
});

/**
 * Load captcha from server
 */
async function loadCaptcha() {
    try {
        const response = await fetch('api/captcha.php?action=generate', {
            method: 'GET',
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('captchaQuestion').textContent = data.data.question;
            captchaToken = data.data.token;
            captchaExpectedAnswer = parseCaptchaAnswer(data.data.question);
            document.getElementById('captcha').value = '';
            resetCaptchaIndicator();
            document.getElementById('captcha').focus();
        } else {
            captchaExpectedAnswer = null;
            resetCaptchaIndicator();
            showError('Failed to load captcha. Please refresh the page.');
        }
    } catch (error) {
        console.error('Captcha load error:', error);
        captchaExpectedAnswer = null;
        resetCaptchaIndicator();
        showError('Network error. Please check your connection.');
    }
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
    e.preventDefault();

    // Clear previous errors
    hideError();

    // Get form values
    const emailInput = document.getElementById('email') || document.getElementById('username');
    const email = emailInput ? emailInput.value.trim() : '';
    const password = document.getElementById('password').value;
    const captchaAnswer = document.getElementById('captcha').value.trim();

    // Validate inputs
    if (!email || !password || !captchaAnswer) {
        showError('Please fill in all fields');
        return;
    }

    if (!captchaToken) {
        showError('Captcha not loaded. Please refresh.');
        loadCaptcha();
        return;
    }

    // Disable form during submission
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.classList.add('loading');
    loginBtn.textContent = 'Logging in';

    try {
        // First, verify captcha
        const captchaResponse = await fetch('api/captcha.php?action=verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                token: captchaToken,
                answer: captchaAnswer
            })
        });

        const captchaData = await captchaResponse.json();

        if (!captchaData.success) {
            showError('Incorrect captcha answer. Please try again.');
            loadCaptcha(); // Reload captcha
            resetForm();
            return;
        }

        // If captcha is correct, proceed with login
        const loginResponse = await fetch('api/auth.php?action=login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const loginData = await loginResponse.json();

        if (loginData.success) {
            // Login successful
            showSuccess('Login successful! Redirecting...');

            // Redirect based on role
            setTimeout(() => {
                const role = loginData.data.role;
                if (role === 'admin') {
                    window.location.href = 'admin-dashboard.html';
                } else if (role === 'manager') {
                    window.location.href = 'manager-dashboard.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            }, 1000);
        } else {
            showError(loginData.message || 'Invalid email or password');
            loadCaptcha(); // Reload captcha after failed login
            resetForm();
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Network error. Please try again.');
        loadCaptcha();
        resetForm();
    }
}

/**
 * Reset form state
 */
function resetForm() {
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = false;
    loginBtn.classList.remove('loading');
    loginBtn.textContent = 'Login';
    document.getElementById('captcha').value = '';
    resetCaptchaIndicator();
}

/**
 * Show error message
 */
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.className = 'error-message show';
    errorDiv.style.background = '#fee';
    errorDiv.style.color = '#c33';
    errorDiv.style.borderLeftColor = '#c33';
}

/**
 * Show success message
 */
function showSuccess(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.className = 'error-message show';
    errorDiv.style.background = '#efe';
    errorDiv.style.color = '#3c3';
    errorDiv.style.borderLeftColor = '#3c3';
}

/**
 * Hide error message
 */
function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.className = 'error-message';
}

function parseCaptchaAnswer(question) {
    const raw = String(question || '');
    const match = raw.match(/(\d+)\s*\+\s*(\d+)/);
    if (!match) return null;
    return parseInt(match[1], 10) + parseInt(match[2], 10);
}

function ensureCaptchaIndicator() {
    let indicator = document.getElementById('captchaIndicator');
    if (indicator) return indicator;

    const captchaInput = document.getElementById('captcha');
    if (!captchaInput) return null;

    let inputWrap = document.getElementById('captchaInputWrap');
    if (!inputWrap) {
        inputWrap = document.createElement('div');
        inputWrap.id = 'captchaInputWrap';
        inputWrap.style.display = 'flex';
        inputWrap.style.flexDirection = 'column';
        inputWrap.style.gap = '6px';
        inputWrap.style.flex = '1';
        inputWrap.style.minWidth = '0';

        const parent = captchaInput.parentNode;
        if (parent) {
            parent.insertBefore(inputWrap, captchaInput);
            inputWrap.appendChild(captchaInput);
        }
    }

    const indicatorRow = document.createElement('div');
    indicatorRow.id = 'captchaIndicatorRow';
    indicatorRow.style.display = 'none';
    indicatorRow.style.textAlign = 'left';

    indicator = document.createElement('span');
    indicator.id = 'captchaIndicator';
    indicator.setAttribute('aria-live', 'polite');
    indicator.style.display = 'inline-flex';
    indicator.style.minWidth = '28px';
    indicator.style.height = '28px';
    indicator.style.padding = '0 8px';
    indicator.style.borderRadius = '999px';
    indicator.style.fontSize = '12px';
    indicator.style.fontWeight = '700';
    indicator.style.alignItems = 'center';
    indicator.style.justifyContent = 'center';
    indicator.style.border = '2px solid transparent';
    indicator.style.userSelect = 'none';

    indicatorRow.appendChild(indicator);
    inputWrap.appendChild(indicatorRow);

    return indicator;
}

function resetCaptchaIndicator() {
    const captchaInput = document.getElementById('captcha');
    const indicator = ensureCaptchaIndicator();
    const indicatorRow = document.getElementById('captchaIndicatorRow');
    if (indicator) {
        indicator.textContent = '';
        indicator.style.background = 'transparent';
        indicator.style.color = 'inherit';
        indicator.style.borderColor = 'transparent';
    }
    if (indicatorRow) {
        indicatorRow.style.display = 'none';
    }
    if (captchaInput) {
        captchaInput.style.borderColor = '';
        captchaInput.style.boxShadow = '';
    }
}

function updateCaptchaIndicator() {
    const captchaInput = document.getElementById('captcha');
    const indicator = ensureCaptchaIndicator();
    const indicatorRow = document.getElementById('captchaIndicatorRow');
    if (!captchaInput || !indicator) return;

    const raw = captchaInput.value.trim();
    if (!raw || captchaExpectedAnswer === null) {
        resetCaptchaIndicator();
        return;
    }

    const numericAnswer = Number(raw);
    const isValidNumber = Number.isInteger(numericAnswer);
    const isCorrect = isValidNumber && numericAnswer === captchaExpectedAnswer;

    if (indicatorRow) {
        indicatorRow.style.display = 'block';
    }

    if (isCorrect) {
        indicator.textContent = 'OK';
        indicator.style.background = '#e8f5e9';
        indicator.style.color = '#2e7d32';
        indicator.style.borderColor = '#2e7d32';
        captchaInput.style.borderColor = '#2e7d32';
        captchaInput.style.boxShadow = '0 0 0 3px rgba(46, 125, 50, 0.15)';
    } else {
        indicator.textContent = 'X';
        indicator.style.background = '#ffebee';
        indicator.style.color = '#c62828';
        indicator.style.borderColor = '#c62828';
        captchaInput.style.borderColor = '#c62828';
        captchaInput.style.boxShadow = '0 0 0 3px rgba(198, 40, 40, 0.15)';
    }
}
