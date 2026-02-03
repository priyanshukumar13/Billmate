document.addEventListener("DOMContentLoaded", () => {

  const authArea = document.getElementById("auth-area");
  const getStartedBtn = document.querySelector(".cta-btn-blue");
  const userEmail = localStorage.getItem("billmateUser");

  if (userEmail) {

    if (authArea) {
      const name = userEmail.split("@")[0];
      const shortName = name.length > 8 ? name.slice(0, 8) + "…" : name;

      authArea.innerHTML = `
        <div class="user-profile-wrapper">
          <div class="user-btn">👤 ${shortName}</div>
          <div class="user-dropdown">
            <a href="profile.html">My Profile</a>
            <a href="#" id="navbarLogoutBtn" class="logout-link">Logout</a>
          </div>
        </div>
      `;

      // ✅ SAFE logout (unique ID)
      document
        .getElementById("navbarLogoutBtn")
        .addEventListener("click", (e) => {
          e.preventDefault();
          localStorage.removeItem("billmateUser");
          window.location.href = "login.html";
        });
    }

    if (getStartedBtn) {
      getStartedBtn.href = "dashboard.html";
      getStartedBtn.textContent = "Go to Dashboard";
    }

  } else {
    if (getStartedBtn) {
      getStartedBtn.href = "signup.html";
      getStartedBtn.textContent = "Get Started Now";
    }
  }

});
