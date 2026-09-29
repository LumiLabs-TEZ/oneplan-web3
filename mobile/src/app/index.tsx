import { Redirect } from 'expo-router';

// The root layout's `Stack.Protected` guards decide between onboarding / login / tabs.
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
