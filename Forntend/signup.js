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

/* 🌐 API URL logic */
function getBaseURL() {
  return 'https://billmate-backend.onrender.com/api/auth';
}
const BASE_URL = getBaseURL();

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

  try {
    const url = `${BASE_URL}/signup`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data?.msg || `Signup failed (status ${res.status})`);
      signupProcessing = false;
      signupBtn.disabled = false;
      signupBtn.innerText = "Signup";
      return;
    }

    /* ==================================================
       🚀 AUTO-LOGIN LOGIC
       Save token and email so Dashboard recognizes user
       ================================================== */
    if (data.token) {
        localStorage.setItem('authToken', data.token);
    }
    localStorage.setItem("billmateUser", email);

    alert('Signup successful! Welcome to BillMate.');

    // ✅ REDIRECT TO DASHBOARD (NOT LOGIN)
    setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 150);

  } catch (err) {
    console.error('Signup network error', err);
    alert(`Network error. Ensure backend is running at ${BASE_URL}`);
    signupProcessing = false;
    signupBtn.disabled = false;
    signupBtn.innerText = "Signup";
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