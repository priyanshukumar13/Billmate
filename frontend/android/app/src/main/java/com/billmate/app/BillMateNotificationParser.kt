package com.billmate.app

import java.security.MessageDigest
import java.util.Locale
import java.util.regex.Pattern

data class ParsedExpense(
    val amount: Double?,
    val merchant: String?,
    val sourceApp: String,
    val packageName: String,
    val timestamp: Long,
    val fingerprint: String,
    val isAmbiguous: Boolean
)

object BillMateNotificationParser {

    const val PKG_GOOGLE_PAY = "com.google.android.apps.nbu.paisa.user"
    const val PKG_PHONEPE = "com.phonepe.app"
    const val PKG_PAYTM = "net.one97.paytm"

    val SUPPORTED_PACKAGES = setOf(PKG_GOOGLE_PAY, PKG_PHONEPE, PKG_PAYTM)

    // Global negative keywords indicating non-outgoing, failed, or sensitive notifications
    private val NEGATIVE_PATTERNS = listOf(
        "failed", "declined", "unsuccessful", "cancelled", "canceled",
        "pending", "processing", "requested", "request from",
        "received", "credited", "sent you", "refund", "cashback",
        "otp", "pin", "verification code", "security code", "password"
    )

    fun isSupportedPackage(packageName: String?): Boolean {
        return packageName != null && SUPPORTED_PACKAGES.contains(packageName)
    }

    /**
     * Parse notification text in a strictly local, privacy-preserving manner.
     * Raw text is never stored or transmitted.
     */
    fun parse(packageName: String, title: String?, text: String?, postTime: Long): ParsedExpense? {
        if (!isSupportedPackage(packageName)) return null

        val combinedText = "${title ?: ""} ${text ?: ""}".trim()
        if (combinedText.isEmpty()) return null

        val lowerText = combinedText.lowercase(Locale.ROOT)

        // 1. Strict Negative Keyword Check: Drop failed, incoming, pending, and sensitive notifications
        for (neg in NEGATIVE_PATTERNS) {
            if (lowerText.contains(neg)) {
                return null
            }
        }

        // 2. Package-Specific Outgoing Parsing
        return when (packageName) {
            PKG_GOOGLE_PAY -> parseGooglePay(title, text, lowerText, postTime)
            PKG_PHONEPE -> parsePhonePe(title, text, lowerText, postTime)
            PKG_PAYTM -> parsePaytm(title, text, lowerText, postTime)
            else -> null
        }
    }

    // --- GOOGLE PAY PARSER ---
    private fun parseGooglePay(title: String?, text: String?, lowerText: String, postTime: Long): ParsedExpense? {
        // Positive outgoing indicators
        val isOutgoing = lowerText.contains("paid") || lowerText.contains("sent") ||
                lowerText.contains("payment to") || lowerText.contains("debited")

        if (!isOutgoing) return null

        val rawAmount = extractAmount(title, text)
        val merchant = extractMerchant(title, text, "Google Pay")
        val fingerprint = generateFingerprint("Google Pay", rawAmount, merchant, postTime)

        return ParsedExpense(
            amount = rawAmount,
            merchant = merchant,
            sourceApp = "Google Pay",
            packageName = PKG_GOOGLE_PAY,
            timestamp = postTime,
            fingerprint = fingerprint,
            isAmbiguous = (rawAmount == null || rawAmount <= 0.0)
        )
    }

    // --- PHONEPE PARSER ---
    private fun parsePhonePe(title: String?, text: String?, lowerText: String, postTime: Long): ParsedExpense? {
        val isOutgoing = lowerText.contains("paid") || lowerText.contains("payment of") ||
                lowerText.contains("debited") || lowerText.contains("successful at")

        if (!isOutgoing) return null

        val rawAmount = extractAmount(title, text)
        val merchant = extractMerchant(title, text, "PhonePe")
        val fingerprint = generateFingerprint("PhonePe", rawAmount, merchant, postTime)

        return ParsedExpense(
            amount = rawAmount,
            merchant = merchant,
            sourceApp = "PhonePe",
            packageName = PKG_PHONEPE,
            timestamp = postTime,
            fingerprint = fingerprint,
            isAmbiguous = (rawAmount == null || rawAmount <= 0.0)
        )
    }

    // --- PAYTM PARSER ---
    private fun parsePaytm(title: String?, text: String?, lowerText: String, postTime: Long): ParsedExpense? {
        val isOutgoing = lowerText.contains("paid") || lowerText.contains("payment of") ||
                lowerText.contains("money sent") || lowerText.contains("sent to")

        if (!isOutgoing) return null

        val rawAmount = extractAmount(title, text)
        val merchant = extractMerchant(title, text, "Paytm")
        val fingerprint = generateFingerprint("Paytm", rawAmount, merchant, postTime)

        return ParsedExpense(
            amount = rawAmount,
            merchant = merchant,
            sourceApp = "Paytm",
            packageName = PKG_PAYTM,
            timestamp = postTime,
            fingerprint = fingerprint,
            isAmbiguous = (rawAmount == null || rawAmount <= 0.0)
        )
    }

    // --- AMOUNT EXTRACTION HELPER ---
    private fun extractAmount(title: String?, text: String?): Double? {
        val candidates = listOfNotNull(title, text)
        // Matches ₹ 500, Rs. 1,250.50, INR 300, etc.
        val pattern = Pattern.compile("(?:[₹₹]|rs\\.?|inr)\\s*([\\d,]+(?:\\.\\d{1,2})?)", Pattern.CASE_INSENSITIVE)

        for (str in candidates) {
            val matcher = pattern.matcher(str)
            if (matcher.find()) {
                val clean = matcher.group(1)?.replace(",", "") ?: continue
                clean.toDoubleOrNull()?.let { if (it > 0) return it }
            }
        }

        // Secondary pattern: 500.00 paid / sent
        val secondary = Pattern.compile("([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:[₹]|rs\\.?|inr)", Pattern.CASE_INSENSITIVE)
        for (str in candidates) {
            val matcher = secondary.matcher(str)
            if (matcher.find()) {
                val clean = matcher.group(1)?.replace(",", "") ?: continue
                clean.toDoubleOrNull()?.let { if (it > 0) return it }
            }
        }

        return null
    }

    // --- MERCHANT EXTRACTION HELPER ---
    private fun extractMerchant(title: String?, text: String?, defaultApp: String): String? {
        val candidates = listOfNotNull(title, text)
        // Matches "to [Merchant Name]" or "at [Merchant Name]"
        val toPattern = Pattern.compile("(?:to|at)\\s+([A-Za-z0-9 &.'-]{2,40})", Pattern.CASE_INSENSITIVE)

        for (str in candidates) {
            val matcher = toPattern.matcher(str)
            if (matcher.find()) {
                val raw = matcher.group(1)?.trim() ?: continue
                // Clean trailing punctuation or common sentence endings
                val cleaned = raw.replace(Regex("(?i)\\s+(was|for|using|via|on|ref).*"), "").trim()
                if (cleaned.length in 2..50) {
                    return cleaned
                }
            }
        }

        // Fallback: Check if title is a merchant name (e.g., "Starbucks")
        if (!title.isNullOrBlank() && !title.contains("Paid", ignoreCase = true) && !title.contains("Payment", ignoreCase = true)) {
            val cleanTitle = title.trim()
            if (cleanTitle.length in 2..40) return cleanTitle
        }

        return null
    }

    // --- STABLE FINGERPRINT FOR DEDUPLICATION ---
    private fun generateFingerprint(sourceApp: String, amount: Double?, merchant: String?, timestamp: Long): String {
        // Bucket timestamp to 1-minute window to avoid duplicate OS notification delivery
        val timeBucket = timestamp / 60000L
        val raw = "$sourceApp|${amount ?: 0.0}|${merchant ?: "unknown"}|$timeBucket"
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(raw.toByteArray(Charsets.UTF_8))
            hash.joinToString("") { "%02x".format(it) }
        } catch (_: Exception) {
            raw.hashCode().toString()
        }
    }
}
