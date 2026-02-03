// 🔐 Protect page
const email = localStorage.getItem("billmateUser");

if (!email) {
  window.location.href = "login.html";
}

// Show user data
const name = email.split("@")[0];
document.getElementById("userName").textContent = name;
document.getElementById("userEmail").textContent = email;
