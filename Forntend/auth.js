// Shared auth helpers for login/signup pages.
// (Other pages can still work without this file; it's primarily for the auth UI.)

window.BILLMATE_API_BASE_URL =
  window.BILLMATE_API_BASE_URL || "https://billmate-backend.onrender.com";

window.setBillmateSession = ({ token, user }) => {
  if (token) localStorage.setItem("billmateToken", token);
  if (user?.username) localStorage.setItem("billmateUser", user.username);
  if (user?.email) localStorage.setItem("billmateEmail", user.email);
};

window.clearBillmateSession = () => {
  localStorage.removeItem("billmateToken");
  localStorage.removeItem("billmateUser");
  localStorage.removeItem("billmateEmail");
};

