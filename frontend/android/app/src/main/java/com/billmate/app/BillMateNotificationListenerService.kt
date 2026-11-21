package com.billmate.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import java.util.Locale

class BillMateNotificationListenerService : NotificationListenerService() {

    companion object {
        const val PREFS_NAME = "billmate_prefs"
        const val KEY_ENABLED = "auto_expense_detection_enabled"
        const val KEY_FINGERPRINTS = "processed_fingerprints"
        const val CHANNEL_ID = "billmate_expense_detection_channel"
        const val NOTIFICATION_ID_BASE = 4001
        const val ACTION_ADD_EXPENSE = "com.billmate.app.ACTION_ADD_EXPENSE"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val isEnabled = prefs.getBoolean(KEY_ENABLED, true)
            if (!isEnabled) return

            val packageName = sbn.packageName ?: return
            if (!BillMateNotificationParser.isSupportedPackage(packageName)) return

            val extras = sbn.notification?.extras ?: return
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()

            val parsed = BillMateNotificationParser.parse(
                packageName = packageName,
                title = title,
                text = text,
                postTime = sbn.postTime
            ) ?: return

            // Deduplication Check
            if (isFingerprintProcessed(parsed.fingerprint)) {
                return
            }
            recordFingerprint(parsed.fingerprint)

            // Notify Foreground Plugin if App is open
            BillMateExpensePlugin.onExpenseDetected(parsed)

            // Show Local Notification to prompt user
            showBillMateExpenseNotification(parsed)
        } catch (e: Exception) {
            // Local error handling, never crash the listener service
        }
    }

    private fun isFingerprintProcessed(fingerprint: String): Boolean {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val set = prefs.getStringSet(KEY_FINGERPRINTS, null) ?: return false
        return set.contains(fingerprint)
    }

    private fun recordFingerprint(fingerprint: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val currentSet = prefs.getStringSet(KEY_FINGERPRINTS, null) ?: mutableSetOf()
        val updatedSet = HashSet(currentSet)
        if (updatedSet.size >= 200) {
            // Drop older entries to avoid unbounded growth
            val iterator = updatedSet.iterator()
            if (iterator.hasNext()) {
                iterator.next()
                iterator.remove()
            }
        }
        updatedSet.add(fingerprint)
        prefs.edit().putStringSet(KEY_FINGERPRINTS, updatedSet).apply()
    }

    private fun showBillMateExpenseNotification(expense: ParsedExpense) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Ensure Notification Channel on Android 8.0+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "BillMate Expense Detection",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts to confirm and record detected payments as expenses."
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Deep Link Intent to launch MainActivity and open Add Expense form
        val intent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_ADD_EXPENSE
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("isBillMateExpense", true)
            putExtra("amount", expense.amount ?: 0.0)
            putExtra("merchant", expense.merchant ?: "")
            putExtra("sourceApp", expense.sourceApp)
            putExtra("timestamp", expense.timestamp)
            putExtra("fingerprint", expense.fingerprint)
            putExtra("isAmbiguous", expense.isAmbiguous)
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            (System.currentTimeMillis() % 10000).toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val displayText = if (expense.amount != null && expense.amount > 0) {
            "Tap to record ₹${String.format(Locale.ROOT, "%.2f", expense.amount)} payment to ${expense.merchant ?: expense.sourceApp}"
        } else {
            "Tap to record payment to ${expense.merchant ?: expense.sourceApp}"
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("BillMate: Expense Detected")
            .setContentText(displayText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(displayText))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val notificationId = NOTIFICATION_ID_BASE + (System.currentTimeMillis() % 1000).toInt()
        notificationManager.notify(notificationId, notification)
    }
}
