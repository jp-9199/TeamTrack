'use client';

import React, { useRef, useEffect } from 'react';
import { Avatar } from '@fluentui/react-components';
import { ChatMultipleRegular, ImageRegular } from '@fluentui/react-icons';
import { ChatMessage } from '../../types/chat';
import { BankHolidaysCard } from './BankHolidaysCard';

interface MessageListProps {
  messages: ChatMessage[];
  chatName?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, chatName }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSelfChat = chatName?.includes('(You)');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col bg-white custom-scrollbar">
      {/* Date Header matching Image 2 */}
      <div className="flex items-center justify-center my-4 select-none">
        <span className="text-[12px] text-[#616161] font-normal">
          Yesterday 1:12 PM
        </span>
      </div>

      {/* If this is the self chat as in Image 2, display the default image and bank holidays attachments */}
      {isSelfChat && (
        <div className="flex flex-col items-end gap-3 w-full mb-3">
          {/* Top placeholder attachment box */}
          <div className="w-[340px] h-[160px] border border-[#D1D5DB] rounded-md bg-[#FAFAFA] flex items-center justify-center text-[#8A8886] shadow-xs">
            <ImageRegular fontSize={40} strokeWidth={1} />
          </div>

          {/* Bank Holidays Table Card */}
          <div className="flex items-end gap-1.5 justify-end">
            <BankHolidaysCard />
            {/* Blue double checkmark seen indicator */}
            <span className="text-[#3B82F6] font-bold text-[14px] ml-0.5 select-none" title="Delivered & Seen">
              &#10003;&#10003;
            </span>
          </div>
        </div>
      )}

      {/* Render Dynamic Messages */}
      {messages.map((msg, index, arr) => {
        const isLast = index === arr.length - 1;
        const prevMsg = arr[index - 1];
        const isFirstInGroup = !prevMsg || prevMsg.sender !== msg.sender;

        if (msg.isMe) {
          return (
            <div key={msg.id} className="flex flex-col items-end w-full my-1">
              {isFirstInGroup && (
                <div className="text-[11px] text-[#8A8A8A] mb-0.5 pr-2 select-none">
                  {msg.time}
                </div>
              )}
              <div className="flex items-center gap-1.5 max-w-[70%] justify-end">
                {msg.text && (
                  <div className="bg-[#5B5FC7] text-white text-[13.5px] px-4 py-2 rounded-[18px] shadow-xs select-text">
                    {msg.text}
                  </div>
                )}
                {isLast && (
                  <span className="text-[#3B82F6] font-bold text-[13px] ml-0.5 select-none" title="Delivered">
                    &#10003;&#10003;
                  </span>
                )}
              </div>
            </div>
          );
        }

        // Incoming message
        return (
          <div key={msg.id} className="flex flex-col items-start w-full my-1">
            {isFirstInGroup && (
              <div className="flex items-center gap-2 mb-0.5 pl-1 select-none">
                <Avatar name={msg.sender} size={20} />
                <span className="text-[12px] font-semibold text-[#242424]">{msg.sender}</span>
                <span className="text-[11px] text-[#8A8A8A]">{msg.time}</span>
              </div>
            )}
            <div className="flex items-end gap-2 max-w-[70%]">
              <div className="bg-[#F0F2F5] text-[#242424] text-[13.5px] px-4 py-2 rounded-[18px] border border-[#E2E4E8] shadow-xs select-text">
                {msg.text}
              </div>
            </div>
          </div>
        );
      })}

      <div ref={messagesEndRef} />
    </div>
  );
};
