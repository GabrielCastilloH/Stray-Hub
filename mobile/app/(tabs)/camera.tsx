import { View } from 'react-native';
import { Colors } from '@/constants/colors';

// This route is never navigated to directly — CameraTabButton pushes to /camera
// (the stack screen). This file must exist so Expo Router doesn't warn about a
// missing route, but it renders nothing visible.
export default function CameraTabPlaceholder() {
  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
