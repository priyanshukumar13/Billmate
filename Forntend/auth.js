// Point this to your running server
const API_BASE_URL = "https://billmate-backend.onrender.com/api/auth";

// Function to Log In
async function loginUser(email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.msg || "Login failed");
            return false;
        }

        // ✅ SAVE THE TOKEN (Crucial Step)
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("billmateUser", data.user.email);
        
        console.log("Login Success! Redirecting...");
        window.location.href = "dashboard.html";
        return true;

    } catch (err) {
        console.error("Login Connection Error:", err);
        alert("Could not connect to server. Is it running?");
        return false;
    }
}

// Function to Verify Token (Used by Dashboard)
async function verifyAuthOrRedirect() {
    const token = localStorage.getItem("authToken");
    if (!token) return null;

    try {
        const response = await fetch(`${API_BASE_URL}/me`, {
            method: "GET",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            }
        });

        if (!response.ok) {
            localStorage.removeItem("authToken"); // Clear bad token
            return null;
        }
        return await response.json();
    } catch (err) {
        return null;
    }
}