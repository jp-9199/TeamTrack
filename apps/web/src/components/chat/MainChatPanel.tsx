import React from 'react';
import { ChatItem } from '../../types/chat';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface MainChatPanelProps {
  chat: ChatItem;
  onSendMessage: (text: string) => void;
}

export const MainChatPanel: React.FC<MainChatPanelProps> = ({ chat, onSendMessage }) => {
  return (
    <main className="flex-1 flex flex-col bg-white rounded-tl-2xl overflow-hidden shadow-sm relative">
      <ChatHeader chat={chat} />
      <MessageList messages={chat.messages} chatName={chat.name} />
      <MessageComposer onSendMessage={onSendMessage} />
    </main>
  );
};
