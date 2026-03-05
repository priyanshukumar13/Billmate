// ELEMENTS
const card = document.querySelector('.login-card');
const emailInput = document.querySelector('input[type="email"]');
const passwordInput = document.querySelector('input[type="password"]');
const loginBtn = document.getElementById('loginBtn');

// 🎴 Card tilt (smooth, independent from button)
document.addEventListener('mousemove', (e) => {
  const x = (window.innerWidth / 2 - e.clientX) / 40;
  const y = (window.innerHeight / 2 - e.clientY) / 40;

  gsap.to(card, {
    rotateY: x,
    rotateX: y,
    duration: 0.4,
    ease: "power2.out"
  });
});

// 🧠 Button escape logic (GSAP only)
let escaping = false;

loginBtn.addEventListener("mouseenter", (e) => {
  if (!isFormValid() && !escaping) {
    escaping = true;
    escapeSmooth(e);
  }
});

loginBtn.addEventListener("mouseleave", () => {
  if (!isFormValid()) {
    gsap.to(loginBtn, {
      x: 0,
      y: 0,
      duration: 0.5,
      ease: "power3.out",
      overwrite: "auto",
      onComplete: () => escaping = false
    });
  }
});

// 🚀 Smooth escape animation
function escapeSmooth(e) {
  const rect = loginBtn.getBoundingClientRect();

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const dirX = centerX > e.clientX ? 1 : -1;
  const dirY = centerY > e.clientY ? 1 : -1;

  gsap.to(loginBtn, {
    x: dirX * 140,
    y: dirY * 90,
    duration: 0.25,
    ease: "expo.out",
    overwrite: "auto",
    onComplete: () => escaping = false
  });
}

// ✅ Form validation
function isFormValid() {
  return (
    emailInput.value.trim() !== "" &&
    passwordInput.value.trim() !== ""
  );
}

// 🟢 Login click handler (Flask backend)
const BASE_URL = 'https://billmate-backend.onrender.com';
console.log('Auth BASE_URL =', BASE_URL);

let loginProcessing = false;
loginBtn.addEventListener('click', async (e) => {
  if (loginProcessing) return; // prevent double submissions
  if (!isFormValid()) {
    e.preventDefault();
    alert("Please enter email and password first 😄");
    return;
  }

  loginProcessing = true;
  loginBtn.disabled = true;

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const url = `${BASE_URL}/api/auth/login`;
    console.log('Login request to', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      let data;
      try { data = await res.json(); } catch (e) { data = null; }
      alert(data?.msg || `Login failed (status ${res.status})`);
      loginProcessing = false;
      loginBtn.disabled = false;
      return;
    }

    const data = await res.json();
    console.log('Login response:', data);
    // Flask backend returns message + user info; no token.
    localStorage.setItem("billmateUser", data.email || email);
    window.location.href = "dashboard.html";

  } catch (err) {
    console.error('Login network error', err);
    alert(`Network error: ${err.message}. Ensure backend is running at ${BASE_URL} and CORS is enabled.`);
    loginProcessing = false;
    loginBtn.disabled = false;
  }
});


