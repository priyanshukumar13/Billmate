// ELEMENTS
const card = document.querySelector('.login-card');
const usernameInput = document.querySelector('input#loginUsername');
const passwordInput = document.querySelector('#loginPassword');
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
    usernameInput.value.trim() !== "" &&
    passwordInput.value.trim() !== ""
  );
}

// 🟢 Login click handler (Render backend)
const BASE_URL = 'https://billmate-backend.onrender.com';

let loginProcessing = false;
loginBtn.addEventListener('click', async (e) => {
  if (loginProcessing) return; // prevent double submissions
  if (!isFormValid()) {
    e.preventDefault();
    alert("Please enter username and password first.");
    return;
  }

  loginProcessing = true;
  loginBtn.disabled = true;

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const url = `${BASE_URL}/api/auth/login`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

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

    // Node backend returns JWT token + user info.
    localStorage.setItem("billmateToken", data.token);
    localStorage.setItem("billmateUser", data?.user?.username || username);
    localStorage.setItem("billmateEmail", data?.user?.email || "");

    window.location.href = "dashboard.html";

  } catch (err) {
    console.error('Login network error', err);
    const msg = err?.name === "AbortError"
      ? "Login request timed out. Please try again."
      : `Network error: ${err.message}. Ensure backend is running at ${BASE_URL} and CORS is enabled.`;
    alert(msg);
    loginProcessing = false;
    loginBtn.disabled = false;
  }
});

// ===========================
// Forgot Password OTP Flow
// ===========================
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const forgotPasswordModal = document.getElementById("forgotPasswordModal");
const closeForgotModalBtn = document.getElementById("closeForgotModalBtn");
const sendOtpBtn = document.getElementById("sendOtpBtn");
const resetPasswordBtn = document.getElementById("resetPasswordBtn");

const forgotStep1 = document.getElementById("forgotStep1");
const forgotStep2 = document.getElementById("forgotStep2");

const forgotIdentifierInput = document.getElementById("forgotIdentifier");
const otpInput = document.getElementById("otpInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");

let forgotEmailForReset = null;

function openForgotModal() {
  if (!forgotPasswordModal) return;
  forgotPasswordModal.style.display = "flex";
  if (forgotStep1) forgotStep1.style.display = "block";
  if (forgotStep2) forgotStep2.style.display = "none";
  forgotEmailForReset = null;
}

function closeForgotModal() {
  if (!forgotPasswordModal) return;
  forgotPasswordModal.style.display = "none";
}

forgotPasswordLink?.addEventListener("click", (e) => {
  e.preventDefault();
  openForgotModal();
});

closeForgotModalBtn?.addEventListener("click", () => {
  closeForgotModal();
});

sendOtpBtn?.addEventListener("click", async () => {
  if (!forgotIdentifierInput) return;
  const usernameOrEmail = forgotIdentifierInput.value.trim();
  if (!usernameOrEmail) {
    alert("Please enter your username or email.");
    return;
  }

  sendOtpBtn.disabled = true;
  sendOtpBtn.innerText = "Sending...";

  try {
    const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernameOrEmail })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.msg || "Could not send OTP. Please try again.");
      return;
    }

    // We store email (when available) so reset-password can validate correctly.
    forgotEmailForReset = data?.email || null;
    if (forgotStep1) forgotStep1.style.display = "none";
    if (forgotStep2) forgotStep2.style.display = "block";
  } catch (err) {
    console.error("Forgot password error:", err);
    alert("Network error while sending OTP. Please try again.");
  } finally {
    sendOtpBtn.disabled = false;
    sendOtpBtn.innerText = "Send OTP";
  }
});

resetPasswordBtn?.addEventListener("click", async () => {
  if (!forgotIdentifierInput) return;
  const usernameOrEmail = forgotIdentifierInput.value.trim();
  const otp = otpInput.value.trim();
  const newPassword = newPasswordInput.value;
  const confirmNewPassword = confirmNewPasswordInput.value;

  if (!otp || !newPassword || !confirmNewPassword) {
    alert("Please fill OTP and both password fields.");
    return;
  }
  if (newPassword !== confirmNewPassword) {
    alert("New password and confirm password do not match.");
    return;
  }

  resetPasswordBtn.disabled = true;
  resetPasswordBtn.innerText = "Resetting...";

  try {
    const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Backend accepts either email or usernameOrEmail
        email: forgotEmailForReset || usernameOrEmail,
        otp,
        newPassword
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.msg || "OTP reset failed. Please check OTP and try again.");
      return;
    }

    alert("Password reset successful! Please log in with your new password.");
    closeForgotModal();
  } catch (err) {
    console.error("Reset password error:", err);
    alert("Network error while resetting password. Please try again.");
  } finally {
    resetPasswordBtn.disabled = false;
    resetPasswordBtn.innerText = "Reset Password";
  }
});


