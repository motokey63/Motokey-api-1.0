import { Redirect } from 'expo-router';

// Gives "/" an unambiguous target; RootNav's effect (app/_layout.tsx) corrects onward if already authenticated.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
