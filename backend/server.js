const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const billRoutes = require('./routes/bills');
const profileRoutes = require('./routes/profile');
const aiRoutes = require('./routes/ai');
const receiptsRoutes = require('./routes/receipts');
const reportsRoutes = require('./routes/reports');
const notificationsRoutes = require('./routes/notifications');
const startCronJob = require('./cronJob');
const authMiddleware = require('./middleware/auth');
const User = require('./models/User');
const { createNotification } = require('./utils/notificationHelper');
const emailService = require('./utils/emailService');

const app = express();

// Trust reverse proxy (Render Cloudflare/Envoy) so express-rate-limit reads real client IP
app.set('trust proxy', 1);

// ===============================
// CORS — restrict to known origins
// ===============================
const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.NETLIFY_URL,
]
  .filter(Boolean)
  .flatMap(u => String(u).split(','))
  .map(u => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  'https://billmatex.netlify.app',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  ...configuredOrigins,
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile, server-to-server)
    if (!origin) return callback(null, true);
    const normalized = origin.trim().replace(/\/+$/, '');
    if (ALLOWED_ORIGINS.includes(normalized)) return callback(null, true);
    // Allow any localhost / 127.0.0.1 port in development
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    // Allow Netlify preview deployments
    if (/^https:\/\/[a-z0-9-]+--billmatex\.netlify\.app$/.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

// Express 5: app.use(cors(corsOptions)) automatically handles CORS preflight (OPTIONS)
// for all routes before downstream middleware. The Express 4 `app.options('*', ...)`
// pattern throws PathError in Express 5 due to path-to-regexp v8 wildcard syntax changes.
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));

let lastDbError = null;

// ===============================
// HEALTH CHECK (no DB required)
// Responds even during cold start so monitoring tools work
// ===============================
app.get('/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = mongoose.connection.readyState;
  res.json({
    status: dbState === 1 ? 'ok' : 'starting',
    db: states[dbState] || 'unknown',
    dbError: lastDbError ? String(lastDbError).replace(/mongodb(\+srv)?:\/\/[^@]+@/i, 'mongodb+srv://<auth>@') : null,
    time: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = mongoose.connection.readyState;
  res.json({
    status: dbState === 1 ? 'ok' : 'starting',
    db: states[dbState] || 'unknown',
    dbError: lastDbError ? String(lastDbError).replace(/mongodb(\+srv)?:\/\/[^@]+@/i, 'mongodb+srv://<auth>@') : null,
    time: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.json({ message: 'BillMate backend running', time: new Date().toISOString() });
});

// ===============================
// DB READINESS GATE
// Prevents Mongoose 10-second buffer timeout on cold start.
// With bufferCommands:false (set below in mongoose.connect), queries throw
// immediately if not connected. This middleware converts that to a clean 503.
// Never blocks OPTIONS preflight requests.
// ===============================
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  if (mongoose.connection.readyState !== 1) {
    const msg = 'Database service is starting up. Please try again in a few seconds.';
    return res.status(503).json({
      success: false,
      error: msg,
      message: msg,
      msg: msg,
    });
  }
  next();
});

// ===============================
// RATE LIMITING — auth endpoints
// Prevents brute-force and credential stuffing per client IP
// ===============================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please wait 15 minutes and try again.',
    msg: 'Too many authentication attempts from this IP. Please wait 15 minutes and try again.',
  },
  skip: (req) => req.method === 'OPTIONS',
});

// ===============================
// SECURED: Immediate alert email
// FIXED: Previously had NO auth — any internet user could trigger emails.
// Now: requires JWT; sends ONLY to the authenticated user's own email
// from the database (client-supplied email is ignored / not trusted).
// ===============================
app.post('/api/bills/send-immediate-alert', authMiddleware, async (req, res) => {
  try {
    const { alerts } = req.body || {};

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return res.status(400).json({ success: false, message: 'No alerts provided.' });
    }

    // Fetch recipient from DB — never trust client-supplied email address
    const user = await User.findById(req.user.id).select('email full_name');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Sanitize alert text — truncate to prevent abuse
    const sanitizedAlerts = alerts
      .slice(0, 20) // max 20 alerts per email
      .map(a => String(a).trim().slice(0, 200));

    await emailService.sendEmail({
      to: user.email,
      subject: '⚠️ BillMate: Important Bill Reminders',
      text: `Hello ${user.full_name || 'Valued User'},\n\nYou have the following bill reminders:\n\n${sanitizedAlerts.join('\n')}\n\nLog in to BillMate to manage your payments.\n\nBillMate Team`,
    });

    try {
      await createNotification({
        userId: user._id,
        title: 'Reminder Email Sent',
        message: `Reminder email sent for ${sanitizedAlerts.length} bill reminder(s).`,
        type: 'REMINDER_EMAIL'
      });
    } catch (notifErr) {
      console.warn('Could not persist notification for immediate alert:', notifErr.message);
    }

    return res.status(200).json({ success: true, message: 'Alert email sent.' });
  } catch (error) {
    console.error('Send alert error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to send alert email. Please try again.' });
  }
});

// ===============================
// CONTACT FORM (no auth required)
// ===============================
app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body || {};

  if (!message || String(message).trim() === '') {
    return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
  }

  const emailConfig = emailService.getEmailConfigurationStatus();
  if (!emailConfig.configured) {
    return res.status(503).json({ success: false, message: 'Email service is not configured.' });
  }

  try {
    const to = process.env.CONTACT_TO;
    if (!to) return res.status(503).json({ success: false, message: 'Contact recipient is not configured.' });
    await emailService.sendEmail({
      to,
      subject: 'New BillMate contact request',
      text: `Name: ${String(name || 'Visitor').trim()}\nEmail: ${String(email || 'not provided').trim()}\n\nMessage:\n${String(message).trim()}`,
    });
    return res.status(200).json({ success: true, message: 'Your message has been sent.' });
  } catch (err) {
    console.error('Contact error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send message. Please try again.' });
  }
});

// ===============================
// API ROUTES
// authLimiter applied to all /api/auth routes
// ===============================
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/receipts', receiptsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Static folders for local file fallback (receipts/reports if S3 not configured)
app.use('/receipts', express.static(path.join(__dirname, 'receipts')));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// ===============================
// DATABASE & SERVER START
// ===============================
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ FATAL: MONGO_URI environment variable is not set.');
  console.error('   Set MONGO_URI in your .env file (local) or Render environment variables (production).');
  process.exit(1);
}

let cronStarted = false;

function connectWithRetry() {
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    maxPoolSize: 10,
    bufferCommands: false,
  })
    .then(() => {
      lastDbError = null;
      console.log('✅ MongoDB Connected');
      if (!cronStarted) {
        try {
          startCronJob();
          cronStarted = true;
          console.log('✅ Bill Reminder Scheduler Running');
        } catch (cronError) {
          console.error('⚠️ Cron Job Error:', cronError.message);
        }
      }
    })
    .catch(err => {
      lastDbError = err.message;
      console.error('❌ DB Connection Error:', err.message);
      // Automatically retry in 5 seconds
      setTimeout(connectWithRetry, 5000);
    });
}

connectWithRetry();

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Retrying in 5 seconds...');
  setTimeout(connectWithRetry, 5000);
});

const { verifyResendConnection } = require('./utils/emailService');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  verifyResendConnection().then(result => {
    if (!result.ok) {
      console.warn(`Resend configuration incomplete: ${result.missing?.join(', ') || 'unknown'}`);
    } else {
      console.log(`Resend email service ready (Mode: ${result.mode})`);
    }
  });
});