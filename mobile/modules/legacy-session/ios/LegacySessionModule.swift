import ExpoModulesCore
import Security

public class LegacySessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LegacySession")
    AsyncFunction("read") { () throws -> [String: String]? in
      guard let access = try self.readAccount("com.oneplan.accessToken"),
            let refresh = try self.readAccount("com.oneplan.refreshToken"),
            !access.isEmpty, !refresh.isEmpty else { return nil }
      var result = ["accessToken": access, "refreshToken": refresh]
      result["appleUserId"] = try self.readAccount("com.oneplan.appleUserID")
      return result
    }

    AsyncFunction("readPreferences") { () throws -> [String: Any] in
      let defaults = UserDefaults.standard
      var result: [String: Any] = [:]
      // `bool(forKey:)` returns false for both a missing key and a stored false, so check
      // `object(forKey:)` first to preserve an explicit native false during migration.
      if defaults.object(forKey: "hasSeenOnboarding") != nil {
        result["hasSeenOnboarding"] = defaults.bool(forKey: "hasSeenOnboarding")
      }
      if let deadline = defaults.object(forKey: "trialOfferDeadline") as? Date {
        result["trialOfferDeadline"] = deadline.timeIntervalSince1970 * 1000
      }
      return result
    }
  }

  // Match AuthTokenStore.swift: generic password, account, default app access group,
  // no service attribute. Never search other access groups or change the old entry.
  private func readAccount(_ account: String) throws -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &value)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else {
      // No token or platform diagnostic is passed into JS logs.
      throw NSError(domain: "OnePlanLegacySession", code: 1)
    }
    return (value as? Data).flatMap { String(data: $0, encoding: .utf8) }
  }
}
