import React from 'react';
import { View, StyleSheet } from 'react-native';

interface IconProps {
  color?: string;
  size?: number;
  focused?: boolean;
}

/**
 * 1. Activity / Notification Bell Icon
 */
export function ActivityIcon({ color = '#616161', size = 24, focused = false }: IconProps) {
  const activeColor = focused ? '#5B5FC7' : color;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      {/* Top hanger */}
      <View
        style={{
          width: size * 0.18,
          height: size * 0.12,
          borderTopLeftRadius: size * 0.08,
          borderTopRightRadius: size * 0.08,
          backgroundColor: activeColor,
          marginBottom: 1,
        }}
      />
      {/* Bell body */}
      <View
        style={{
          width: size * 0.72,
          height: size * 0.58,
          borderTopLeftRadius: size * 0.36,
          borderTopRightRadius: size * 0.36,
          borderBottomLeftRadius: size * 0.12,
          borderBottomRightRadius: size * 0.12,
          backgroundColor: focused ? activeColor : 'transparent',
          borderColor: activeColor,
          borderWidth: focused ? 0 : 2,
        }}
      />
      {/* Bell rim */}
      <View
        style={{
          width: size * 0.88,
          height: 2.5,
          borderRadius: 1.5,
          backgroundColor: activeColor,
          marginTop: -1,
        }}
      />
      {/* Clapper */}
      <View
        style={{
          width: size * 0.22,
          height: size * 0.14,
          borderBottomLeftRadius: size * 0.11,
          borderBottomRightRadius: size * 0.11,
          backgroundColor: activeColor,
          marginTop: 1,
        }}
      />
    </View>
  );
}

/**
 * 2. Official Microsoft Teams Chat Bubble Icon
 */
export function ChatIcon({ color = '#616161', size = 24, focused = false }: IconProps) {
  const primaryBg = focused ? '#5B5FC7' : color;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.85,
          height: size * 0.7,
          borderRadius: size * 0.24,
          backgroundColor: focused ? primaryBg : 'transparent',
          borderColor: primaryBg,
          borderWidth: focused ? 0 : 2,
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {/* Chat line 1 */}
        <View
          style={{
            width: size * 0.44,
            height: 2,
            borderRadius: 1,
            backgroundColor: focused ? '#FFFFFF' : primaryBg,
            marginBottom: 3,
          }}
        />
        {/* Chat line 2 */}
        <View
          style={{
            width: size * 0.28,
            height: 2,
            borderRadius: 1,
            backgroundColor: focused ? '#FFFFFF' : primaryBg,
            alignSelf: 'flex-start',
            marginLeft: size * 0.14,
          }}
        />
        {/* Small speech tail */}
        <View
          style={{
            position: 'absolute',
            bottom: -3,
            left: size * 0.18,
            width: 5,
            height: 5,
            backgroundColor: primaryBg,
            transform: [{ rotate: '45deg' }],
          }}
        />
      </View>
    </View>
  );
}

/**
 * 3. Teams People Collaboration Icon
 */
export function TeamsIcon({ color = '#616161', size = 24, focused = false }: IconProps) {
  const activeColor = focused ? '#5B5FC7' : color;
  return (
    <View style={[styles.center, { width: size, height: size, position: 'relative' }]}>
      {/* Background left person */}
      <View
        style={{
          position: 'absolute',
          left: 2,
          top: 3,
          alignItems: 'center',
          opacity: 0.75,
        }}
      >
        <View
          style={{
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: activeColor,
          }}
        />
        <View
          style={{
            width: size * 0.42,
            height: size * 0.25,
            borderTopLeftRadius: size * 0.21,
            borderTopRightRadius: size * 0.21,
            backgroundColor: activeColor,
            marginTop: 1.5,
          }}
        />
      </View>

      {/* Center primary person */}
      <View
        style={{
          alignItems: 'center',
          zIndex: 2,
          marginLeft: 6,
        }}
      >
        <View
          style={{
            width: size * 0.36,
            height: size * 0.36,
            borderRadius: size * 0.18,
            backgroundColor: focused ? '#4F52B2' : activeColor,
            borderWidth: 1.5,
            borderColor: '#FFFFFF',
          }}
        />
        <View
          style={{
            width: size * 0.52,
            height: size * 0.3,
            borderTopLeftRadius: size * 0.26,
            borderTopRightRadius: size * 0.26,
            backgroundColor: focused ? '#4F52B2' : activeColor,
            marginTop: 1,
            borderWidth: 1.5,
            borderColor: '#FFFFFF',
          }}
        />
      </View>
    </View>
  );
}

/**
 * 4. Calendar Fluent Grid Icon
 */
export function CalendarIcon({ color = '#616161', size = 24, focused = false }: IconProps) {
  const activeColor = focused ? '#5B5FC7' : color;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      {/* Top hanging rings */}
      <View style={{ flexDirection: 'row', width: size * 0.6, justifyContent: 'space-between', marginBottom: 1 }}>
        <View style={{ width: 2.5, height: 3.5, borderRadius: 1, backgroundColor: activeColor }} />
        <View style={{ width: 2.5, height: 3.5, borderRadius: 1, backgroundColor: activeColor }} />
      </View>
      {/* Calendar Card */}
      <View
        style={{
          width: size * 0.82,
          height: size * 0.72,
          borderRadius: size * 0.16,
          backgroundColor: '#FFFFFF',
          borderColor: activeColor,
          borderWidth: 2,
          overflow: 'hidden',
        }}
      >
        {/* Calendar Top Color Bar */}
        <View style={{ width: '100%', height: size * 0.2, backgroundColor: activeColor }} />
        {/* 4 date dots */}
        <View style={{ flex: 1, padding: 3, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', alignItems: 'center' }}>
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: activeColor }} />
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: activeColor }} />
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: activeColor }} />
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: activeColor }} />
        </View>
      </View>
    </View>
  );
}

/**
 * 5. Calls / Telephony & Video Icon
 */
export function CallsIcon({ color = '#616161', size = 24, focused = false }: IconProps) {
  const activeColor = focused ? '#5B5FC7' : color;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      {/* Phone Handset shape */}
      <View
        style={{
          width: size * 0.78,
          height: size * 0.68,
          borderRadius: size * 0.22,
          borderWidth: focused ? 0 : 2,
          borderColor: activeColor,
          backgroundColor: focused ? activeColor : 'transparent',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Inside receiver curve */}
        <View
          style={{
            width: size * 0.44,
            height: size * 0.32,
            borderTopLeftRadius: size * 0.16,
            borderTopRightRadius: size * 0.16,
            borderColor: focused ? '#FFFFFF' : activeColor,
            borderWidth: 2,
            borderBottomWidth: 0,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 6. Official Copilot Ribbon & Sparkle Icon
 */
export function CopilotIcon({ size = 24, focused = false }: IconProps) {
  return (
    <View style={[styles.center, { width: size, height: size, position: 'relative' }]}>
      {/* Interlocking Ribbon Cyan Loop */}
      <View
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: size * 0.45,
          height: size * 0.65,
          borderRadius: size * 0.22,
          borderWidth: 2.5,
          borderColor: '#00B7C3',
          borderRightWidth: 0,
          transform: [{ rotate: '-18deg' }],
        }}
      />
      {/* Interlocking Ribbon Magenta/Violet Loop */}
      <View
        style={{
          position: 'absolute',
          bottom: 3,
          right: 3,
          width: size * 0.45,
          height: size * 0.65,
          borderRadius: size * 0.22,
          borderWidth: 2.5,
          borderColor: '#E3008C',
          borderLeftWidth: 0,
          transform: [{ rotate: '-18deg' }],
        }}
      />
      {/* Center Sparkle Dot */}
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: '#5B5FC7',
        }}
      />
    </View>
  );
}

/**
 * 7. Search Magnifying Glass
 */
export function SearchIcon({ color = '#616161', size = 20 }: IconProps) {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: (size * 0.62) / 2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 2,
          right: 2,
          width: size * 0.32,
          height: 2.5,
          borderRadius: 1.5,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/**
 * 8. Plus Icon for Floating Action Button
 */
export function PlusIcon({ color = '#FFFFFF', size = 24 }: IconProps) {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View style={{ position: 'absolute', width: size * 0.6, height: 3, borderRadius: 1.5, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: 3, height: size * 0.6, borderRadius: 1.5, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
