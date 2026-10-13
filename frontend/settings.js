document.addEventListener("DOMContentLoaded", async () => {
    /* ===============================
       🔐 1. AUTH CHECK
    =============================== */
    const token = localStorage.getItem('billmateToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const $ = id => document.getElementById(id);
    const BASE_URL = (typeof window.getBillmateApiBase === 'function')
        ? window.getBillmateApiBase()
        : (window.BILLMATE_API_BASE_URL || "http://localhost:5000");

    const getAuthHeaders = () => (typeof window.getBillmateAuthHeaders === 'function')
        ? window.getBillmateAuthHeaders()
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('billmateToken') || ''}`
        };

    let currentAvatarBase64 = localStorage.getItem("billmateProfilePicture") || "";

    /* ===============================
       📥 2. LOAD PROFILE DATA
    =============================== */
    async function loadProfile() {
        // Initial populate from localStorage
        const storedName = localStorage.getItem("billmateUser") || "";
        const storedEmail = localStorage.getItem("billmateEmail") || "";
        
        if ($("profileFullName")) $("profileFullName").value = storedName;
        if ($("profileEmail")) $("profileEmail").value = storedEmail;
        if ($("settingsAvatarPreview") && currentAvatarBase64) {
            $("settingsAvatarPreview").src = currentAvatarBase64;
        }

        // Fetch fresh from backend API
        try {
            const res = await fetch(`${BASE_URL}/api/profile`, { headers: getAuthHeaders() });
            if (res.ok) {
                const user = await res.json();
                if ($("profileFullName")) $("profileFullName").value = user.full_name || user.username || "";
                if ($("profileEmail")) $("profileEmail").value = user.email || "";
                if ($("profilePhone")) $("profilePhone").value = user.phone_number || "";
                if (user.profile_picture) {
                    currentAvatarBase64 = user.profile_picture;
                    if ($("settingsAvatarPreview")) $("settingsAvatarPreview").src = user.profile_picture;
                    localStorage.setItem("billmateProfilePicture", user.profile_picture);
                }
                if ($("notifEmailToggle")) {
                    $("notifEmailToggle").checked = Boolean(user.email_notifications);
                }
            }
        } catch (err) {
            console.warn("Could not fetch profile:", err);
        }

        // Avatar & Initials preview
        const initials = (window.getBillmateInitials && window.getBillmateInitials(fullName)) || 'U';
        if ($("settingsAvatarInitials")) $("settingsAvatarInitials").textContent = initials;

        if (currentAvatarBase64 && currentAvatarBase64 !== 'icons/user-avatar.png') {
            if ($("settingsAvatarPreview")) {
                $("settingsAvatarPreview").src = currentAvatarBase64;
                $("settingsAvatarPreview").style.display = "block";
            }
            if ($("settingsAvatarInitials")) $("settingsAvatarInitials").style.display = "none";
        } else {
            if ($("settingsAvatarPreview")) $("settingsAvatarPreview").style.display = "none";
            if ($("settingsAvatarInitials")) $("settingsAvatarInitials").style.display = "flex";
        }

        // Load Preferences
        const curr = localStorage.getItem("billmateCurrency") || "INR";
        if ($("prefCurrencySelect")) $("prefCurrencySelect").value = curr;
    }

    /* ===============================
       🖼️ 3. AVATAR UPLOAD
    =============================== */
    const avatarInput = $("avatarFileInput");
    if (avatarInput) {
        avatarInput.addEventListener("change", function () {
            const file = this.files && this.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                alert("Image is too large. Please select a photo under 5MB.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                currentAvatarBase64 = e.target.result;
                if ($("settingsAvatarPreview")) {
                    $("settingsAvatarPreview").src = currentAvatarBase64;
                    $("settingsAvatarPreview").style.display = "block";
                }
                if ($("settingsAvatarInitials")) $("settingsAvatarInitials").style.display = "none";
                if ($("headerUserAvatar")) {
                    $("headerUserAvatar").src = currentAvatarBase64;
                    $("headerUserAvatar").style.display = "block";
                }
                if ($("headerUserInitials")) $("headerUserInitials").style.display = "none";
                localStorage.setItem("billmateProfilePicture", currentAvatarBase64);
            };
            reader.readAsDataURL(file);
        });
    }

    /* ===============================
       💾 4. SAVE PROFILE
    =============================== */
    const profileForm = $("profileForm");
    if (profileForm) {
        profileForm.onsubmit = async (e) => {
            e.preventDefault();
            const fullName = $("profileFullName")?.value.trim();
            const email = $("profileEmail")?.value.trim();
            const phone = $("profilePhone")?.value.trim();

            if (!fullName || !email) {
                alert("Full Name and Email are required.");
                return;
            }

            try {
                const res = await fetch(`${BASE_URL}/api/profile/update`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        full_name: fullName,
                        email: email,
                        phone_number: phone,
                        profile_picture: currentAvatarBase64
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem("billmateUser", fullName);
                    localStorage.setItem("billmateEmail", email);
                    if (currentAvatarBase64) localStorage.setItem("billmateProfilePicture", currentAvatarBase64);

                    // Update Top Header in real time
                    if (window.initGlobalLayout) {
                        window.initGlobalLayout();
                    } else {
                        document.querySelectorAll("#userName, #headerGreeting").forEach(el => el.textContent = fullName);
                        document.querySelectorAll("#topUserName").forEach(el => el.textContent = fullName);
                    }

                    const feedback = $("profileSuccessFeedback");
                    if (feedback) {
                        feedback.style.display = "inline-block";
                        setTimeout(() => { feedback.style.display = "none"; }, 3000);
                    }
                } else {
                    const errData = await res.json().catch(() => ({}));
                    alert(errData.msg || "Failed to update profile.");
                }
            } catch (err) {
                console.error("Profile save error:", err);
                alert("Network error updating profile.");
            }
        };
    }

    /* ===============================
       ⚙️ 5. TAB SWITCHING
    =============================== */
    const tabs = [
        { btn: "tabBtnProfile", content: "tabContentProfile" },
        { btn: "tabBtnPreferences", content: "tabContentPreferences" },
        { btn: "tabBtnNotifications", content: "tabContentNotifications" },
        { btn: "tabBtnSecurity", content: "tabContentSecurity" }
    ];

    function switchTab(activeBtnId) {
        tabs.forEach(t => {
            const b = $(t.btn);
            const c = $(t.content);
            if (b && c) {
                const isActive = t.btn === activeBtnId;
                b.classList.toggle("active", isActive);
                c.style.display = isActive ? "block" : "none";
            }
        });
    }

    tabs.forEach(t => {
        $(t.btn)?.addEventListener("click", () => switchTab(t.btn));
    });

    $("btnGoToPassword")?.addEventListener("click", () => switchTab("tabBtnSecurity"));

    /* ===============================
       🎨 6. PREFERENCES
    =============================== */
    $("preferencesForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const selectedCurrency = $("prefCurrencySelect")?.value || "INR";
        localStorage.setItem("billmateCurrency", selectedCurrency);
        const fb = $("prefSaveFeedback");
        if (fb) {
            fb.style.display = "inline-block";
            setTimeout(() => { fb.style.display = "none"; }, 2500);
        }
    });

    /* ===============================
       🔔 7. NOTIFICATIONS
    =============================== */
    $("notificationsForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const isEmailNotif = $("notifEmailToggle") ? $("notifEmailToggle").checked : true;
        const days = $("notifDaysSelect") ? Number($("notifDaysSelect").value) : 3;

        try {
            const res = await fetch(`${BASE_URL}/api/profile/notifications`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    email_notifications: isEmailNotif,
                    reminder_days_before: [days]
                })
            });
            if (res.ok) {
                alert("Notification preferences saved! ✓");
            } else {
                alert("Failed to save notification preferences.");
            }
        } catch (err) {
            alert("Network error saving notifications.");
        }
    });

    /* ===============================
       🔒 8. SECURITY (CHANGE PASSWORD)
    =============================== */
    $("securityForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const oldPass = $("secOldPassword")?.value;
        const newPass = $("secNewPassword")?.value;
        const confirmPass = $("secConfirmPassword")?.value;

        if (newPass !== confirmPass) {
            alert("New passwords do not match.");
            return;
        }

        if (newPass.length < 6) {
            alert("New password must be at least 6 characters.");
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/api/profile/change-password`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ old_password: oldPass, new_password: newPass })
            });

            if (res.ok) {
                alert("Password changed successfully! ✓");
                $("securityForm").reset();
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(errData.msg || "Failed to change password.");
            }
        } catch (err) {
            alert("Network error changing password.");
        }
    });

    // Initial load
    loadProfile();
});
