const token = localStorage.getItem('billmateToken');

const globalMessage = document.getElementById('globalMessage');
const profileForm = document.getElementById('profileForm');
const notificationForm = document.getElementById('notificationForm');
const passwordForm = document.getElementById('passwordForm');

const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const phoneNumberInput = document.getElementById('phoneNumber');
const profilePictureFileInput = document.getElementById('profilePictureFile');
const profilePicturePreview = document.getElementById('profilePicturePreview');
const emailNotificationsInput = document.getElementById('emailNotifications');
const smsNotificationsInput = document.getElementById('smsNotifications');
const reminderDaysInput = document.getElementById('reminderDays');
const oldPasswordInput = document.getElementById('oldPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const pendingBillsCount = document.getElementById('pendingBillsCount');
const paidThisMonthCount = document.getElementById('paidThisMonthCount');
const upcomingBillsCount = document.getElementById('upcomingBillsCount');

let selectedProfilePicture = '';

function showMessage(type, message) {
  globalMessage.className = `message ${type}`;
  globalMessage.textContent = message;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

function resolveApiBaseUrl() {
  if (window.BILLMATE_API_BASE_URL) return window.BILLMATE_API_BASE_URL;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  return 'https://billmate-backend.onrender.com';
}

function isValidPhone(phone) {
  if (!phone) return true;
  return /^\+?[0-9\s\-()]{7,20}$/.test(phone);
}

function parseReminderDays(reminderText) {
  return reminderText
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((num) => Number.isInteger(num) && num >= 0 && num <= 30);
}

function updatePicturePreview(url) {
  if (url && url.trim() !== '') {
    profilePicturePreview.src = url.trim();
  } else {
    profilePicturePreview.src = 'icons/user-avatar.png';
  }
}

async function fetchProfile() {
  const response = await fetch(`${resolveApiBaseUrl()}/api/profile`, {
    method: 'GET',
    headers: authHeaders()
  });

  if (!response.ok) {
    throw new Error('Unable to fetch profile');
  }

  const user = await response.json();
  fullNameInput.value = user.full_name || user.username || '';
  emailInput.value = user.email || '';
  phoneNumberInput.value = user.phone_number || '';
  selectedProfilePicture = user.profile_picture || '';
  updatePicturePreview(selectedProfilePicture);
}

async function fetchNotifications() {
  const response = await fetch(`${resolveApiBaseUrl()}/api/profile/notifications`, {
    method: 'GET',
    headers: authHeaders()
  });

  if (!response.ok) {
    throw new Error('Unable to fetch notifications');
  }

  const data = await response.json();
  emailNotificationsInput.checked = Boolean(data.email_notifications);
  smsNotificationsInput.checked = Boolean(data.sms_notifications);
  reminderDaysInput.value = Array.isArray(data.reminder_days_before)
    ? data.reminder_days_before.join(',')
    : '1,3';
}

async function fetchBillsAndStats() {
  const response = await fetch(`${resolveApiBaseUrl()}/api/bills`, {
    method: 'GET',
    headers: authHeaders()
  });

  if (!response.ok) {
    throw new Error('Unable to fetch bill stats');
  }

  const bills = await response.json();
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const pending = bills.filter((bill) => bill.status !== 'Paid').length;
  const paidThisMonth = bills.filter((bill) => {
    if (bill.status !== 'Paid' || !bill.date) return false;
    const d = new Date(bill.date);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
  const upcoming = bills.filter((bill) => {
    if (bill.status === 'Paid' || !bill.date) return false;
    const d = new Date(bill.date);
    return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }).length;

  pendingBillsCount.textContent = String(pending);
  paidThisMonthCount.textContent = String(paidThisMonth);
  upcomingBillsCount.textContent = String(upcoming);
}

async function initProfilePage() {
  if (!token) {
    showMessage('error', 'Please log in to view your profile.');
    return;
  }

  try {
    await Promise.all([fetchProfile(), fetchNotifications(), fetchBillsAndStats()]);
    showMessage('success', 'Profile loaded successfully.');
  } catch (error) {
    showMessage('error', error.message || 'Failed to load profile.');
  }
}

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fullName = fullNameInput.value.trim();
  const email = emailInput.value.trim();
  const phoneNumber = phoneNumberInput.value.trim();
  const profilePicture = selectedProfilePicture;

  if (!fullName) {
    showMessage('error', 'Full name cannot be empty.');
    return;
  }

  if (!email) {
    showMessage('error', 'Email cannot be empty.');
    return;
  }

  if (!isValidPhone(phoneNumber)) {
    showMessage('error', 'Enter a valid phone number.');
    return;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/profile/update`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        full_name: fullName,
        email,
        phone_number: phoneNumber,
        profile_picture: profilePicture
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Failed to update profile');

    localStorage.setItem('billmateUser', fullName);
    localStorage.setItem('billmateEmail', email);
    localStorage.setItem('billmateProfilePicture', profilePicture || '');
    updatePicturePreview(profilePicture || '');
    showMessage('success', data.msg || 'Profile updated successfully.');
  } catch (error) {
    showMessage('error', error.message || 'Profile update failed.');
  }
});

notificationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const parsedDays = parseReminderDays(reminderDaysInput.value.trim());

  if (parsedDays.length === 0) {
    showMessage('error', 'Reminder days must contain valid numbers between 0 and 30.');
    return;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/profile/notifications`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        email_notifications: emailNotificationsInput.checked,
        sms_notifications: smsNotificationsInput.checked,
        reminder_days_before: parsedDays
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Failed to update notifications');

    reminderDaysInput.value = parsedDays.join(',');
    showMessage('success', data.msg || 'Notification preferences updated.');
  } catch (error) {
    showMessage('error', error.message || 'Notification update failed.');
  }
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const oldPassword = oldPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    showMessage('error', 'All password fields are required.');
    return;
  }

  if (newPassword.length < 6) {
    showMessage('error', 'New password must be at least 6 characters.');
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage('error', 'New password and confirm password must match.');
    return;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/profile/change-password`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Failed to change password');

    oldPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    showMessage('success', data.msg || 'Password changed successfully.');
  } catch (error) {
    showMessage('error', error.message || 'Password change failed.');
  }
});

profilePictureFileInput.addEventListener('change', () => {
  const file = profilePictureFileInput.files && profilePictureFileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    selectedProfilePicture = String(reader.result || '');
    updatePicturePreview(selectedProfilePicture);
  };
  reader.onerror = () => {
    showMessage('error', 'Failed to read selected image.');
  };
  reader.readAsDataURL(file);
});

initProfilePage();
