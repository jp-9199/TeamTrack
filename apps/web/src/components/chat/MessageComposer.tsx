'use client';

import React, { useState } from 'react';
import { Tooltip } from '@fluentui/react-components';
import {
  EmojiRegular,
  AttachRegular,
  ImageRegular,
  AddRegular,
  SendRegular,
  SendFilled,
} from '@fluentui/react-icons';

interface MessageComposerProps {
  onSendMessage: (text: string) => void;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ onSendMessage }) => {
  const [inputText, setInputText] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim()) {
        onSendMessage(inputText.trim());
        setInputText('');
      }
    }
  };

  const handleSendClick = () => {
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <footer className="px-5 pb-4 pt-1 bg-white">
      <div className="border border-[#D1D5DB] rounded-lg bg-white p-2.5 shadow-xs focus-within:border-[#5B5FC7] focus-within:ring-1 focus-within:ring-[#5B5FC7] transition-all">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          className="w-full resize-none border-none outline-none text-[13.5px] text-[#242424] bg-transparent placeholder-[#707070] min-h-[32px] max-h-[120px] font-sans px-1"
          rows={1}
        />
        
        <div className="flex items-center justify-end gap-1 mt-1 text-[#616161]">
          <Tooltip content="Add emoji" relationship="label">
            <button 
              className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer" 
              aria-label="Add emoji"
            >
              <EmojiRegular fontSize={18} />
            </button>
          </Tooltip>

          <Tooltip content="Attach file" relationship="label">
            <button 
              className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer" 
              aria-label="Attach file"
            >
              <AttachRegular fontSize={18} />
            </button>
          </Tooltip>

          <Tooltip content="Insert image" relationship="label">
            <button 
              className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer" 
              aria-label="Insert image"
            >
              <ImageRegular fontSize={18} />
            </button>
          </Tooltip>

          <Tooltip content="More actions" relationship="label">
            <button 
              className="p-1.5 hover:bg-black/5 hover:text-[#242424] rounded-md transition-colors cursor-pointer" 
              aria-label="More actions"
            >
              <AddRegular fontSize={18} />
            </button>
          </Tooltip>

          <Tooltip content="Send message" relationship="label">
            <button
              onClick={handleSendClick}
              disabled={!inputText.trim()}
              className={`p-1.5 rounded-md transition-all ml-1 cursor-pointer ${
                inputText.trim() 
                  ? 'text-[#5B5FC7] hover:bg-[#5B5FC7]/10' 
                  : 'text-[#B0B5BA] cursor-not-allowed'
              }`}
              aria-label="Send message"
            >
              {inputText.trim() ? (
                <SendFilled fontSize={18} />
              ) : (
                <SendRegular fontSize={18} />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </footer>
  );
};
