import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';

export interface ChannelPost {
  id: string;
  author: string;
  avatar: string;
  date: string;
  subject: string;
  content: string;
  replies: { id: string; author: string; text: string }[];
}

export interface TeamChannel {
  id: string;
  name: string;
  unreadCount?: number;
}

export interface TeamItem {
  id: string;
  name: string;
  avatar: string;
  color: string;
  channels: TeamChannel[];
}

const INITIAL_TEAMS: TeamItem[] = [
  {
    id: 'eng',
    name: 'Engineering Core',
    avatar: 'EC',
    color: '#5B5FC7',
    channels: [
      { id: 'eng-general', name: 'General' },
      { id: 'eng-arch', name: 'Architecture & Design', unreadCount: 2 },
      { id: 'eng-releases', name: 'Releases & CI/CD' },
    ],
  },
  {
    id: 'prod',
    name: 'Product & Design',
    avatar: 'PD',
    color: '#008272',
    channels: [
      { id: 'prod-general', name: 'General' },
      { id: 'prod-tokens', name: 'Fluent Design System' },
    ],
  },
  {
    id: 'org',
    name: 'All Company',
    avatar: 'AC',
    color: '#C4314B',
    channels: [
      { id: 'org-announcements', name: 'Announcements' },
      { id: 'org-watercooler', name: 'Watercooler' },
    ],
  },
];

const INITIAL_POSTS: Record<string, ChannelPost[]> = {
  'eng-general': [
    {
      id: 'p1',
      author: 'David Kim',
      avatar: 'DK',
      date: 'Today at 9:30 AM',
      subject: 'TypeScript 5.6 & Node 22 Upgrade Complete',
      content:
        'All packages in the monorepo now compile cleanly with TS 5.6. Zero direct database access from Electron renderer, full IPC isolation enforced.',
      replies: [
        { id: 'r1', author: 'Sarah Chen', text: 'Verified frontend packages build smoothly!' },
        { id: 'r2', author: 'Alex Morgan', text: 'Confirmed desktop test suite passes 100%.' },
      ],
    },
    {
      id: 'p2',
      author: 'Alex Rivera',
      avatar: 'AR',
      date: 'Yesterday at 3:00 PM',
      subject: 'Sprint 14 Kickoff',
      content:
        'Focus areas this week: Microsoft Teams native experience, mobile bottom bar navigation, and complete test validation.',
      replies: [],
    },
  ],
};

export function MobileTeamsScreen() {
  const [teams, setTeams] = useState<TeamItem[]>(INITIAL_TEAMS);
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({
    eng: true,
    prod: true,
    org: false,
  });
  const [activeChannel, setActiveChannel] = useState<{
    teamName: string;
    channel: TeamChannel;
  } | null>(null);
  const [postsMap, setPostsMap] = useState<Record<string, ChannelPost[]>>(INITIAL_POSTS);
  const [newReplyText, setNewReplyText] = useState('');

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const handleAddReply = (postId: string) => {
    if (!newReplyText.trim() || !activeChannel) return;

    setPostsMap((prev) => {
      const channelPosts = prev[activeChannel.channel.id] || [];
      return {
        ...prev,
        [activeChannel.channel.id]: channelPosts.map((p) =>
          p.id === postId
            ? {
                ...p,
                replies: [
                  ...p.replies,
                  { id: `r-${Date.now()}`, author: 'Alex Morgan', text: newReplyText.trim() },
                ],
              }
            : p
        ),
      };
    });

    setNewReplyText('');
  };

  // If a channel is selected, show its feed
  if (activeChannel) {
    const posts = postsMap[activeChannel.channel.id] || [
      {
        id: 'p-default',
        author: 'Alex Morgan',
        avatar: 'AM',
        date: 'Today',
        subject: `Welcome to #${activeChannel.channel.name}`,
        content: `Start conversations, post updates, and share files in #${activeChannel.channel.name}.`,
        replies: [],
      },
    ];

    return (
      <SafeAreaView style={styles.container}>
        {/* Channel Header */}
        <View style={styles.channelHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setActiveChannel(null)}
          >
            <Text style={styles.backBtnText}>‹ Teams</Text>
          </TouchableOpacity>
          <View style={styles.channelHeaderInfo}>
            <Text style={styles.channelHeaderTitle} numberOfLines={1}>
              #{activeChannel.channel.name}
            </Text>
            <Text style={styles.channelHeaderSubtitle} numberOfLines={1}>
              {activeChannel.teamName}
            </Text>
          </View>
        </View>

        {/* Channel Posts Feed */}
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.postsList}
          renderItem={({ item }) => (
            <View style={styles.postCard}>
              <View style={styles.postAuthorRow}>
                <View style={styles.authorAvatar}>
                  <Text style={styles.authorAvatarText}>{item.avatar}</Text>
                </View>
                <View style={styles.authorInfo}>
                  <Text style={styles.authorName}>{item.author}</Text>
                  <Text style={styles.postDate}>{item.date}</Text>
                </View>
              </View>

              <Text style={styles.postSubject}>{item.subject}</Text>
              <Text style={styles.postContent}>{item.content}</Text>

              {/* Replies */}
              {item.replies.length > 0 && (
                <View style={styles.repliesList}>
                  {item.replies.map((r) => (
                    <View key={r.id} style={styles.replyBubble}>
                      <Text style={styles.replyAuthor}>{r.author}: </Text>
                      <Text style={styles.replyText}>{r.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Reply Box */}
              <View style={styles.replyInputWrap}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Reply to this conversation..."
                  placeholderTextColor="#8A8886"
                  onSubmitEditing={() => handleAddReply(item.id)}
                  onChangeText={setNewReplyText}
                />
              </View>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // Otherwise, render list of Teams and Channels
  return (
    <View style={styles.container}>
      <FlatList
        data={teams}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isExpanded = expandedTeams[item.id] ?? true;
          return (
            <View style={styles.teamSection}>
              {/* Team Accordion Header */}
              <TouchableOpacity
                style={styles.teamHeader}
                onPress={() => toggleTeam(item.id)}
              >
                <View
                  style={[styles.teamAvatar, { backgroundColor: item.color }]}
                >
                  <Text style={styles.teamAvatarText}>{item.avatar}</Text>
                </View>
                <Text style={styles.teamName}>{item.name}</Text>
                <Text style={styles.chevronIcon}>{isExpanded ? '▼' : '▶'}</Text>
              </TouchableOpacity>

              {/* Channels List */}
              {isExpanded && (
                <View style={styles.channelsContainer}>
                  {item.channels.map((ch) => (
                    <TouchableOpacity
                      key={ch.id}
                      style={styles.channelRow}
                      onPress={() =>
                        setActiveChannel({ teamName: item.name, channel: ch })
                      }
                    >
                      <Text style={styles.hashIcon}>#</Text>
                      <Text style={styles.channelName}>{ch.name}</Text>
                      {!!ch.unreadCount && ch.unreadCount > 0 && (
                        <View style={styles.channelBadge}>
                          <Text style={styles.channelBadgeText}>
                            {ch.unreadCount}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F8',
  },
  teamSection: {
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E1DFDD',
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  teamAvatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  teamAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#242424',
    flex: 1,
  },
  chevronIcon: {
    fontSize: 11,
    color: '#8A8886',
  },
  channelsContainer: {
    paddingLeft: 44,
    paddingBottom: 6,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F2F1',
  },
  hashIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8A8886',
    marginRight: 10,
    width: 14,
  },
  channelName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#242424',
    flex: 1,
  },
  channelBadge: {
    backgroundColor: '#5B5FC7',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  channelBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Channel View
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1DFDD',
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
  channelHeaderInfo: {
    flex: 1,
  },
  channelHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#242424',
  },
  channelHeaderSubtitle: {
    fontSize: 11,
    color: '#616161',
  },
  postsList: {
    padding: 16,
    gap: 14,
  },
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E1DFDD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#5B5FC7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  authorAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#242424',
  },
  postDate: {
    fontSize: 11,
    color: '#8A8886',
  },
  postSubject: {
    fontSize: 15,
    fontWeight: '700',
    color: '#242424',
    marginBottom: 6,
  },
  postContent: {
    fontSize: 13,
    lineHeight: 18,
    color: '#323130',
    marginBottom: 10,
  },
  repliesList: {
    borderTopWidth: 1,
    borderTopColor: '#F3F2F1',
    paddingTop: 8,
    gap: 6,
    marginBottom: 10,
  },
  replyBubble: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    padding: 8,
    borderRadius: 6,
  },
  replyAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B5FC7',
  },
  replyText: {
    fontSize: 12,
    color: '#242424',
    flex: 1,
  },
  replyInputWrap: {
    borderTopWidth: 1,
    borderTopColor: '#F3F2F1',
    paddingTop: 8,
  },
  replyInput: {
    backgroundColor: '#FAF9F8',
    borderWidth: 1,
    borderColor: '#E1DFDD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#242424',
  },
});
