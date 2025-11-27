document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
  
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const message = document.getElementById("login-message");
  
    // Simulated validation - replace this with your real backend logic later
    if (email && password) {
      message.style.color = "green";
      message.textContent = "Login successful! Redirecting...";
  
      setTimeout(() => {
        // Redirect to homepage (update path as per your folder structure)
        window.location.href = "index.html"; 
      }, 1000);
    } else {
      message.style.color = "red";
      message.textContent = "Please enter valid email and password.";
    }
  });
  