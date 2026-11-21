package com.billmate.app

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BillMateExpense")
class BillMateExpensePlugin : Plugin() {

    companion object {
        private var instance: BillMateExpensePlugin? = null
        private var pendingExpenseObject: JSObject? = null

        fun onExpenseDetected(expense: ParsedExpense) {
            val js = JSObject().apply {
                put("amount", expense.amount ?: 0.0)
                put("merchant", expense.merchant ?: "")
                put("sourceApp", expense.sourceApp)
                put("timestamp", expense.timestamp)
                put("fingerprint", expense.fingerprint)
                put("isAmbiguous", expense.isAmbiguous)
            }
            pendingExpenseObject = js
            instance?.notifyListeners("onExpenseDetected", js, true)
        }

        fun setPendingExpenseFromIntent(intent: Intent?) {
            if (intent == null || !intent.hasExtra("isBillMateExpense")) return

            val amount = intent.getDoubleExtra("amount", 0.0)
            val merchant = intent.getStringExtra("merchant") ?: ""
            val sourceApp = intent.getStringExtra("sourceApp") ?: "Google Pay"
            val timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis())
            val fingerprint = intent.getStringExtra("fingerprint") ?: ""
            val isAmbiguous = intent.getBooleanExtra("isAmbiguous", false)

            val js = JSObject().apply {
                put("amount", amount)
                put("merchant", merchant)
                put("sourceApp", sourceApp)
                put("timestamp", timestamp)
                put("fingerprint", fingerprint)
                put("isAmbiguous", isAmbiguous)
            }
            pendingExpenseObject = js
            instance?.notifyListeners("onExpenseDetected", js, true)
        }
    }

    override fun load() {
        super.load()
        instance = this
    }

    @PluginMethod
    fun checkNotificationPermission(call: PluginCall) {
        val ctx = context
        val packageName = ctx.packageName
        val listeners = NotificationManagerCompat.getEnabledListenerPackages(ctx)
        val isGranted = listeners.contains(packageName)

        val ret = JSObject().apply {
            put("isGranted", isGranted)
            put("packageName", packageName)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            call.reject("Unable to open notification settings: ${e.message}")
        }
    }

    @PluginMethod
    fun getPendingExpense(call: PluginCall) {
        val ret = JSObject()
        if (pendingExpenseObject != null) {
            ret.put("hasPending", true)
            ret.put("expense", pendingExpenseObject)
        } else {
            ret.put("hasPending", false)
            ret.put("expense", null)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun clearPendingExpense(call: PluginCall) {
        pendingExpenseObject = null
        call.resolve(JSObject().apply { put("success", true) })
    }

    @PluginMethod
    fun getDetectionSetting(call: PluginCall) {
        val prefs = context.getSharedPreferences(BillMateNotificationListenerService.PREFS_NAME, Context.MODE_PRIVATE)
        val isEnabled = prefs.getBoolean(BillMateNotificationListenerService.KEY_ENABLED, true)
        val ret = JSObject().apply {
            put("enabled", isEnabled)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun setDetectionSetting(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val prefs = context.getSharedPreferences(BillMateNotificationListenerService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(BillMateNotificationListenerService.KEY_ENABLED, enabled).apply()

        val ret = JSObject().apply {
            put("success", true)
            put("enabled", enabled)
        }
        call.resolve(ret)
    }
}
