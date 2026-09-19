import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  SafeAreaView,
} from 'react-native';

export interface CallLogItem {
  id: string;
  name: string;
  avatar: string;
  type: 'incoming' | 'outgoing' | 'missed';
  time: string;
  duration?: string;
}

export interface MobileCallsScreenProps {
  onStartCall?: (contactName: string, video: boolean) => void;
}

const SPEED_DIAL = [
  { id: '1', name: 'Sarah Chen', role: 'Design Lead', avatar: 'SC', color: '#5B5FC7' },
  { id: '2', name: 'David Kim', role: 'Backend Architect', avatar: 'DK', color: '#008272' },
  { id: '3', name: 'Alex Rivera', role: 'VP Product', avatar: 'AR', color: '#B146C2' },
];

const CALL_HISTORY: CallLogItem[] = [
  { id: 'c1', name: 'Sarah Chen', avatar: 'SC', type: 'incoming', time: '10:15 AM', duration: '14m 22s' },
  { id: 'c2', name: 'David Kim', avatar: 'DK', type: 'outgoing', time: '9:05 AM', duration: '4m 10s' },
  { id: 'c3', name: 'Alex Rivera', avatar: 'AR', type: 'missed', time: 'Yesterday' },
  { id: 'c4', name: 'Core Engineering', avatar: 'CE', type: 'incoming', time: 'Sep 17', duration: '32m 00s' },
];

export function MobileCallsScreen({ onStartCall }: MobileCallsScreenProps) {
  const [activeTab, setActiveTab] = useState<'speedDial' | 'history'>('speedDial');
  const [inCallModal, setInCallModal] = useState<{ name: string; video: boolean } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const startCall = (name: string, video: boolean) => {
    setInCallModal({ name, video });
    onStartCall?.(name, video);
  };

  const endCall = () => {
    setInCallModal(null);
  };

  return (
    <View style={styles.container}>
      {/* Top Filter Tabs */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'speedDial' && styles.tabBtnActive]}
          onPress={() => setActiveTab('speedDial')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'speedDial' && styles.tabBtnTextActive]}>
            Speed Dial
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Speed Dial View */}
      {activeTab === 'speedDial' && (
        <FlatList
          data={SPEED_DIAL}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.contactRow}>
              <View style={[styles.contactAvatar, { backgroundColor: item.color }]}>
                <Text style={styles.contactAvatarText}>{item.avatar}</Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{item.name}</Text>
                <Text style={styles.contactRole}>{item.role}</Text>
              </View>
              <View style={styles.actionBtns}>
                <TouchableOpacity
                  style={styles.callIconBtn}
                  onPress={() => startCall(item.name, false)}
                >
                  <Text style={styles.callIconText}>📞</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.callIconBtn}
                  onPress={() => startCall(item.name, true)}
                >
                  <Text style={styles.callIconText}>📹</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* History View */}
      {activeTab === 'history' && (
        <FlatList
          data={CALL_HISTORY}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.historyRow}
              onPress={() => startCall(item.name, false)}
            >
              <View style={styles.historyAvatar}>
                <Text style={styles.contactAvatarText}>{item.avatar}</Text>
              </View>
              <View style={styles.contactInfo}>
                <Text
                  style={[
                    styles.contactName,
                    item.type === 'missed' && { color: '#C4314B' },
                  ]}
                >
                  {item.name}
                </Text>
                <Text style={styles.historyMeta}>
                  {item.type === 'incoming' && '↙ Incoming'}
                  {item.type === 'outgoing' && '↗ Outgoing'}
                  {item.type === 'missed' && '✕ Missed'}
                  {item.duration ? ` • ${item.duration}` : ''}
                </Text>
              </View>
              <Text style={styles.historyTime}>{item.time}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Active Call Modal */}
      <Modal visible={!!inCallModal} animationType="slide">
        <SafeAreaView style={styles.callModalContainer}>
          <View style={styles.callModalHeader}>
            <Text style={styles.callModalStatus}>
              {inCallModal?.video ? 'Teams Video Call' : 'Teams Audio Call'}
            </Text>
            <Text style={styles.callModalTimer}>00:18 • Encrypted</Text>
          </View>

          <View style={styles.callModalCenter}>
            <View style={styles.callModalAvatarLarge}>
              <Text style={styles.callModalAvatarLargeText}>
                {inCallModal?.name.split(' ').map((n) => n[0]).join('')}
              </Text>
            </View>
            <Text style={styles.callModalName}>{inCallModal?.name}</Text>
            <Text style={styles.callModalConnected}>Connected</Text>
          </View>

          {/* Call Controls */}
          <View style={styles.callControlsRow}>
            <TouchableOpacity
              style={[styles.callControlBtn, isMuted && styles.callControlBtnActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Text style={styles.callControlText}>{isMuted ? '🔇' : '🎙️'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.callControlBtn, isCamOff && styles.callControlBtnActive]}
              onPress={() => setIsCamOff(!isCamOff)}
            >
              <Text style={styles.callControlText}>{isCamOff ? '🚫' : '📹'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.callControlBtn}>
              <Text style={styles.callControlText}>🔊</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.callControlBtn, styles.callEndBtn]}
              onPress={endCall}
            >
              <Text style={styles.callEndText}>✕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F8',
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1DFDD',
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingVertical: 12,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#5B5FC7',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#616161',
  },
  tabBtnTextActive: {
    color: '#5B5FC7',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E1DFDD',
  },
  contactAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#242424',
  },
  contactRole: {
    fontSize: 12,
    color: '#616161',
    marginTop: 2,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  callIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EBEAF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callIconText: {
    fontSize: 16,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E1DFDD',
  },
  historyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#5B5FC7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyMeta: {
    fontSize: 12,
    color: '#616161',
    marginTop: 2,
  },
  historyTime: {
    fontSize: 11,
    color: '#8A8886',
  },

  // Call Modal
  callModalContainer: {
    flex: 1,
    backgroundColor: '#1E1B4B',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  callModalHeader: {
    alignItems: 'center',
    marginTop: 16,
  },
  callModalStatus: {
    fontSize: 14,
    color: '#EBEAF9',
    fontWeight: '600',
  },
  callModalTimer: {
    fontSize: 12,
    color: '#A19F9D',
    marginTop: 4,
  },
  callModalCenter: {
    alignItems: 'center',
  },
  callModalAvatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#5B5FC7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#5B5FC7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  callModalAvatarLargeText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  callModalName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  callModalConnected: {
    fontSize: 13,
    color: '#4ADE80',
    marginTop: 6,
  },
  callControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  callControlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callControlBtnActive: {
    backgroundColor: '#5B5FC7',
  },
  callControlText: {
    fontSize: 20,
  },
  callEndBtn: {
    backgroundColor: '#C4314B',
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  callEndText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
});
