import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { captureRef } from '@/utils/cameraCapture';

function CameraTabButton({ onPress }: BottomTabBarButtonProps) {
  function handlePress() {
    if (captureRef.current) {
      captureRef.current();
    } else {
      onPress?.({} as any);
    }
  }

  return (
    <View style={styles.cameraButtonPlaceholder}>
      <TouchableOpacity
        style={styles.cameraButtonWrapper}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.shutterOuter}>
          <View style={styles.shutterInner} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraButtonPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButtonWrapper: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.accent,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: '',
          tabBarButton: CameraTabButton,
        }}
      />
      <Tabs.Screen
        name="registry"
        options={{
          title: 'Registry',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'library' : 'library-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
