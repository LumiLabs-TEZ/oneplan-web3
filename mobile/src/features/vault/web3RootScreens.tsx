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
          .presentationCornerRadius(38)`. Swift hid the drag indicator and drew an X; here the
          grabber is the only dismiss affordance (owner call, 2026-10-03). */}
      <Stack.Screen
        name="how-money-is-held"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [1],
          sheetCornerRadius: 38,
          sheetGrabberVisible: true,
        }}
      />
      {/* WelcomeTripWalletView.swift: `.presentationDetents([.large])
          .presentationCornerRadius(38)`. No X (owner call, 2026-10-03): the grabber + swipe is the
          dismiss path, so the sheet marks itself seen on unmount. */}
      <Stack.Screen
        name="web3-welcome"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [1],
          sheetCornerRadius: 38,
          sheetGrabberVisible: true,
        }}
      />
      {/* DepositToOnePlanWalletView.swift's ContributeToVaultView call site:
          `.presentationDetents([.fraction(0.8)]).presentationCornerRadius(48)`. */}
      <Stack.Screen
        name="wallet/deposit"
        options={{
          presentation: 'formSheet',
          // Swift used `.fraction(0.8)`; fitting the content avoids a dead gap above Go back.
          sheetAllowedDetents: 'fitToContents',
          sheetCornerRadius: 48,
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen name="wallet/withdraw-result" options={{ presentation: 'fullScreenModal' }} />
    </Stack.Protected>
  );
}
