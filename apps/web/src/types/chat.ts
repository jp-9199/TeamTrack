export type RailItem = 'activity' | 'chat' | 'teams' | 'calendar' | 'calls';

export interface MessageReaction {
  emoji: string;
  count: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  avatarText?: string;
  avatarBg?: string;
  time: string;
  isMe?: boolean;
  text?: string;
  imageUrl?: string;
  imageCaption?: string;
  reactions?: MessageReaction[];
}

export interface ChatItem {
  id: string;
  name: string;
  avatarText?: string;
  avatarBg?: string;
  lastMessage: string;
  time: string;
  isUnread?: boolean;
  isMeetingChat?: boolean;
  isMuted?: boolean;
  isFavorite?: boolean;
  memberCount?: number;
  messages: ChatMessage[];
}

export const mockChats: ChatItem[] = [];
