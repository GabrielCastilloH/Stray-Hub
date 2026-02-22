import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="match-results" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vet-intake" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}
