const card = document.querySelector('.login-card');
const inputs = document.querySelectorAll('input');
const signupBtn = document.getElementById('signupBtn');

/* 🎴 Card tilt effect */
document.addEventListener('mousemove', (e) => {
  const x = (window.innerWidth / 2 - e.clientX) / 40;
  const y = (window.innerHeight / 2 - e.clientY) / 40;
  card.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`;
});

/* 🏃 Button escape logic when form is NOT valid */
signupBtn.addEventListener('mouseenter', (e) => {
  if (!isFormValid()) {
    escapeFromCursor(e);
  }
});

/* 🧲 Reset button position when cursor leaves */
signupBtn.addEventListener('mouseleave', () => {
  if (!isFormValid()) {
    resetButton();
  }
});

/* 🌐 API URL logic (Flask backend) */
const BASE_URL = 'https://billmate-backend.onrender.com';

/* ✅ Main Signup Logic */
let signupProcessing = false;

signupBtn.addEventListener('click', async (e) => {
  if (signupProcessing) return;

  // Manual validation check on click
  if (!isFormValid()) {
    e.preventDefault();
    alert("Please fill all details first 😄");
    return;
  }

  signupProcessing = true;
  signupBtn.disabled = true;
  signupBtn.innerText = "Processing...";

  const name = document.getElementById('fullName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;

  if (password !== confirmPassword) {
    alert("Passwords do not match. Please confirm your password.");
    signupProcessing = false;
    signupBtn.disabled = false;
    signupBtn.innerText = "Create Account";
    return;
  }

  try {
    const url = `${BASE_URL}/api/auth/signup`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
      res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, email, password }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await res.json();

    if (!res.ok) {
      alert(data?.msg || data?.message || `Signup failed (status ${res.status})`);
      signupProcessing = false;
      signupBtn.disabled = false;
      signupBtn.innerText = "Create Account";
      return;
    }

    // Auto-login into dashboard after signup
    localStorage.setItem("billmateToken", data.token);
    localStorage.setItem("billmateUser", data?.user?.username || name);
    localStorage.setItem("billmateEmail", data?.user?.email || email);

    alert('Signup successful! Redirecting to your dashboard.');

    // Redirect to dashboard
    setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 150);

  } catch (err) {
    console.error('Signup network error', err);
    const msg = err?.name === "AbortError"
      ? "Signup request timed out. Please try again."
      : `Network error. Ensure backend is running at ${BASE_URL}`;
    alert(msg);
    signupProcessing = false;
    signupBtn.disabled = false;
    signupBtn.innerText = "Create Account";
  }
});

/* 🧠 Cursor Escape Math */
function escapeFromCursor(e) {
  const rect = signupBtn.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const moveX = e.clientX < centerX ? 220 : -220;
  const moveY = e.clientY < centerY ? 140 : -140;

  signupBtn.style.transform = `translate(${moveX}px, ${moveY}px)`;
}

/* 🔄 Reset position */
function resetButton() {
  signupBtn.style.transform = "translate(0,0)";
}

/* ✅ Validation Check */
function isFormValid() {
  return [...inputs].every(input => input.value.trim() !== "");
}