import { Stack } from 'expo-router';

/**
 * The root-stack screens that only exist for the web3 feature. Called (not rendered as a
 * component) from `app/_layout.tsx` — expo-router reads a navigator's children as
 * `Screen`/`Protected` elements, and calling this returns exactly one `Stack.Protected`.
 *
 * With the flag off (always, in prod) the guard drops the routes entirely, so a stale or
 * hand-typed `oneplan://` link cannot open vault UI or fire its API calls (final-review M2).
 */
export function web3RootScreens(enabled: boolean) {
  return (
    <Stack.Protected guard={enabled}>
      {/* HowMoneyIsHeldView.swift: `.presentationDetents([.large])
          .presentationCornerRadius(38).presentationDragIndicator(.hidden)`. */}
      <Stack.Screen
        name="how-money-is-held"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [1],
          sheetCornerRadius: 38,
          sheetGrabberVisible: false,
        }}
      />
      {/* WelcomeTripWalletView.swift preview: `.presentationDetents([.large])
          .presentationCornerRadius(38)` (grabber shown — no `.hidden` modifier). */}
      <Stack.Screen
        name="web3-welcome"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [1],
          sheetCornerRadius: 38,
          gestureEnabled: false,
        }}
      />
      {/* DepositToOnePlanWalletView.swift's ContributeToVaultView call site:
          `.presentationDetents([.fraction(0.8)]).presentationCornerRadius(48)`. */}
      <Stack.Screen
        name="wallet/deposit"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.8],
          sheetCornerRadius: 48,
        }}
      />
    </Stack.Protected>
  );
}
