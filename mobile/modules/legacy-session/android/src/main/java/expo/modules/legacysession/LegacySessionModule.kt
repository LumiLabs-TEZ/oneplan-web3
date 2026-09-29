package expo.modules.legacysession

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class LegacySessionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LegacySession")
    AsyncFunction("read") {
      val context = requireNotNull(appContext.reactContext)
      // Do not create a key or an empty preferences file on fresh installations.
      val file = File(context.applicationInfo.dataDir, "shared_prefs/oneplan_auth_tokens.xml")
      if (!file.exists()) return@AsyncFunction null
      // Same alias and encryption schemes as the shipped Kotlin client. Unlike its
      // recovery helper, this reader must NEVER delete or recreate unreadable data.
      val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
      val prefs = EncryptedSharedPreferences.create(
        context, "oneplan_auth_tokens", masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      )
      val access = prefs.getString("access_token", null)
      val refresh = prefs.getString("refresh_token", null)
      if (access.isNullOrBlank() || refresh.isNullOrBlank()) null
      else mapOf("accessToken" to access, "refreshToken" to refresh)
    }

    AsyncFunction("readPreferences") {
      val context = requireNotNull(appContext.reactContext)
      val result = mutableMapOf<String, Any>()

      // Avoid creating SharedPreferences files during migration on a fresh install. The native
      // clients use these exact plain preference files and keys.
      val onboardingFile = File(context.applicationInfo.dataDir, "shared_prefs/onboarding.xml")
      if (onboardingFile.exists()) {
        val prefs = context.getSharedPreferences("onboarding", Context.MODE_PRIVATE)
        if (prefs.contains("shown")) {
          result["hasSeenOnboarding"] = prefs.getBoolean("shown", false)
        }
      }

      val trialFile = File(context.applicationInfo.dataDir, "shared_prefs/trial_offer.xml")
      if (trialFile.exists()) {
        val prefs = context.getSharedPreferences("trial_offer", Context.MODE_PRIVATE)
        if (prefs.contains("deadline")) {
          result["trialOfferDeadline"] = prefs.getLong("deadline", -1L)
        }
      }

      result
    }
  }
}
