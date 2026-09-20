import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TextInput,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

export interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  time: string;
  inOut: 'in' | 'out';
  text: string;
}

export interface ChatConversation {
  id: string;
  name: string;
  avatar: string;
  role: string;
  status: 'available' | 'busy' | 'away' | 'offline';
  isGroup?: boolean;
  time: string;
  preview: string;
  unreadCount: number;
  messages: ChatMessage[];
}

export interface MobileChatScreenProps {
  onStartCall?: (contactName: string, video: boolean) => void;
}

const INITIAL_CHATS: ChatConversation[] = [
  {
    id: 'sarah',
    name: 'Sarah Chen',
    avatar: 'SC',
    role: 'Design Lead',
    status: 'available',
    time: '10:42 AM',
    preview: 'I just uploaded the updated Fluent 2 tokens.',
    unreadCount: 0,
    messages: [
      { id: 'm1', sender: 'Sarah Chen', avatar: 'SC', time: '10:38 AM', inOut: 'in', text: 'Hey Alex! Did you get a chance to check the new desktop layouts?' },
      { id: 'm2', sender: 'Alex Morgan', avatar: 'AM', time: '10:40 AM', inOut: 'out', text: 'Yes, looking sharp! The Fluent styling and custom titlebar are spot on.' },
      { id: 'm3', sender: 'Sarah Chen', avatar: 'SC', time: '10:42 AM', inOut: 'in', text: 'Awesome! I just uploaded the updated Fluent 2 tokens. Let me know if you need anything else.' },
    ],
  },
  {
    id: 'david',
    name: 'David Kim',
    avatar: 'DK',
    role: 'Backend Architect',
    status: 'busy',
    time: '9:15 AM',
    preview: 'Redis cluster failover tests passed with zero drops.',
    unreadCount: 1,
    messages: [
      { id: 'm4', sender: 'David Kim', avatar: 'DK', time: '9:10 AM', inOut: 'in', text: 'Good morning! Running the Phase 12 & 13 security suites.' },
      { id: 'm5', sender: 'David Kim', avatar: 'DK', time: '9:15 AM', inOut: 'in', text: 'Redis cluster failover tests passed with zero drops.' },
    ],
  },
  {
    id: 'engineering',
    name: 'Core Engineering',
    avatar: 'CE',
    role: '5 members',
    status: 'available',
    isGroup: true,
    time: 'Yesterday',
    preview: 'Pushed the new Electron 33 secureStorage integration.',
    unreadCount: 0,
    messages: [
      { id: 'm6', sender: 'Alex Rivera', avatar: 'AR', time: 'Yesterday 4:15 PM', inOut: 'in', text: 'Reminder: Code freeze is at 6 PM today.' },
      { id: 'm7', sender: 'Alex Morgan', avatar: 'AM', time: 'Yesterday 4:30 PM', inOut: 'out', text: 'Pushed the new Electron 33 secureStorage integration.' },
      { id: 'm8', sender: 'Sarah Chen', avatar: 'SC', time: 'Yesterday 4:32 PM', inOut: 'in', text: 'LGTM! Tested on Windows and Mac.' },
    ],
  },
  {
    id: 'alex-r',
    name: 'Alex Rivera',
    avatar: 'AR',
    role: 'VP Product',
    status: 'away',
    time: 'Sep 18',
    preview: 'Great work on the enterprise governance compliance.',
    unreadCount: 0,
    messages: [
      { id: 'm9', sender: 'Alex Rivera', avatar: 'AR', time: 'Sep 18', inOut: 'in', text: 'Great work on the enterprise governance compliance.' },
    ],
  },
];

export function MobileChatScreen({ onStartCall }: MobileChatScreenProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>(INITIAL_CHATS);
  const [activeChat, setActiveChat] = useState<ChatConversation | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#92C353';
      case 'busy':
        return '#C4314B';
      case 'away':
        return '#F8D22A';
      default:
        return '#8A8886';
    }
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !activeChat) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'Alex Morgan',
      avatar: 'AM',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      inOut: 'out',
      text: inputMessage.trim(),
    };

    const updated = {
      ...activeChat,
      preview: newMsg.text,
      time: newMsg.time,
      messages: [...activeChat.messages, newMsg],
    };

    setActiveChat(updated);
    setConversations((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    setInputMessage('');

    // Simulated reply
    setTimeout(() => {
      const replyMsg: ChatMessage = {
        id: `reply-${Date.now()}`,
        sender: activeChat.name,
        avatar: activeChat.avatar,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        inOut: 'in',
        text: 'Received! Looking forward to sync in the standup.',
      };
      const withReply = {
        ...updated,
        preview: replyMsg.text,
        time: replyMsg.time,
        messages: [...updated.messages, replyMsg],
      };
      setActiveChat((cur) => (cur?.id === withReply.id ? withReply : cur));
      setConversations((prev) =>
        prev.map((c) => (c.id === withReply.id ? withReply : c))
      );
    }, 1200);
  };

  // If a chat is open, show the full conversation view
  if (activeChat) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Conversation Header */}
        <View style={styles.convHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setActiveChat(null)}
          >
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>

          <View style={styles.convHeaderInfo}>
            <Text style={styles.convHeaderTitle} numberOfLines={1}>
              {activeChat.name}
            </Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDotSmall,
                  { backgroundColor: getStatusColor(activeChat.status) },
                ]}
              />
              <Text style={styles.convHeaderSubtitle}>
                {activeChat.isGroup ? activeChat.role : activeChat.status}
              </Text>
            </View>
          </View>

          <View style={styles.convHeaderActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => onStartCall?.(activeChat.name, false)}
            >
              <Text style={styles.headerActionIcon}>📞</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => onStartCall?.(activeChat.name, true)}
            >
              <Text style={styles.headerActionIcon}>📹</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Message History */}
        <FlatList
          data={activeChat.messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          renderItem={({ item }) => {
            const isMe = item.inOut === 'out';
            return (
              <View
                style={[
                  styles.msgRow,
                  isMe ? styles.msgRowMe : styles.msgRowOther,
                ]}
              >
                {!isMe && (
                  <View style={styles.msgAvatar}>
                    <Text style={styles.msgAvatarText}>{item.avatar}</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.msgBubble,
                    isMe ? styles.msgBubbleMe : styles.msgBubbleOther,
                  ]}
                >
                  {!isMe && (
                    <Text style={styles.msgSenderName}>{item.sender}</Text>
                  )}
                  <Text
                    style={[
                      styles.msgText,
                      isMe ? styles.msgTextMe : styles.msgTextOther,
                    ]}
                  >
                    {item.text}
                  </Text>
                  <Text
                    style={[
                      styles.msgTime,
                      isMe ? styles.msgTimeMe : styles.msgTimeOther,
                    ]}
                  >
                    {item.time}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {/* Message Input Bar */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.composerBar}>
            <TouchableOpacity style={styles.composerActionBtn}>
              <Text style={styles.composerActionIcon}>📎</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.composerInput}
              placeholder="Type a message..."
              placeholderTextColor="#8A8886"
              value={inputMessage}
              onChangeText={setInputMessage}
              onSubmitEditing={handleSendMessage}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                inputMessage.trim() ? styles.sendBtnActive : null,
              ]}
              onPress={handleSendMessage}
              disabled={!inputMessage.trim()}
            >
              <Text style={styles.sendBtnText}>➤</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Otherwise, show the list of chats
  const filteredChats = conversations.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Search & Filter Bar */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats and messages"
            placeholderTextColor="#8A8886"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Chat List */}
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chatRow}
            onPress={() => {
              // mark read
              setConversations((prev) =>
                prev.map((c) => (c.id === item.id ? { ...c, unreadCount: 0 } : c))
              );
              setActiveChat({ ...item, unreadCount: 0 });
            }}
          >
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{item.avatar}</Text>
              </View>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor(item.status) },
                ]}
              />
            </View>

            <View style={styles.chatInfo}>
              <View style={styles.chatTitleRow}>
                <Text style={styles.chatName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.chatTime}>{item.time}</Text>
              </View>

              <View style={styles.chatSubtitleRow}>
                <Text style={styles.chatPreview} numberOfLines={1}>
                  {item.preview}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {item.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FAF9F8',
    borderBottomWidth: 1,
    borderBottomColor: '#E1DFDD',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1DFDD',
    paddingHorizontal: 10,
    height: 36,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#242424',
    paddingVertical: 0,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#5B5FC7',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#5B5FC7',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statusDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  chatInfo: {
    flex: 1,
  },
  chatTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#242424',
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 11,
    color: '#8A8886',
  },
  chatSubtitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatPreview: {
    fontSize: 13,
    color: '#616161',
    flex: 1,
    marginRight: 8,
  },
  unreadBadge: {
    backgroundColor: '#5B5FC7',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Conversation Detail View
  convHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E1DFDD',
    backgroundColor: '#FAF9F8',
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5B5FC7',
  },
  convHeaderInfo: {
    flex: 1,
  },
  convHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#242424',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  convHeaderSubtitle: {
    fontSize: 11,
    color: '#616161',
    textTransform: 'capitalize',
  },
  convHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionBtn: {
    padding: 6,
  },
  headerActionIcon: {
    fontSize: 18,
  },
  messagesList: {
    padding: 16,
    gap: 12,
    backgroundColor: '#FAF9F8',
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  msgRowMe: {
    justifyContent: 'flex-end',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#5B5FC7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  msgAvatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  msgBubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  msgBubbleOther: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1DFDD',
    borderBottomLeftRadius: 2,
  },
  msgBubbleMe: {
    backgroundColor: '#EBEAF9',
    borderWidth: 1,
    borderColor: 'rgba(91,95,199,0.2)',
    borderBottomRightRadius: 2,
  },
  msgSenderName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B5FC7',
    marginBottom: 2,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 18,
  },
  msgTextOther: {
    color: '#242424',
  },
  msgTextMe: {
    color: '#242424',
  },
  msgTime: {
    fontSize: 10,
    marginTop: 4,
  },
  msgTimeOther: {
    color: '#8A8886',
    textAlign: 'left',
  },
  msgTimeMe: {
    color: '#5B5FC7',
    textAlign: 'right',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E1DFDD',
  },
  composerActionBtn: {
    padding: 6,
    marginRight: 6,
  },
  composerActionIcon: {
    fontSize: 18,
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#FAF9F8',
    borderWidth: 1,
    borderColor: '#E1DFDD',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 14,
    color: '#242424',
    maxHeight: 90,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E1DFDD',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnActive: {
    backgroundColor: '#5B5FC7',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
