'use client';

import { X, Send } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface ChatModalProps {
  chat: any;
  onClose: () => void;
}

interface ChatMessage {
  role?: string;
  content?: string;
  message?: string;
  sender?: string;
  text?: string;
  timestamp?: string;
  time?: string;
}

export function ChatModal({ chat, onClose }: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Parse chat data - handle different formats
    let parsedMessages: ChatMessage[] = [];

    if (Array.isArray(chat)) {
      parsedMessages = chat;
    } else if (typeof chat === 'object') {
      // Try to extract messages from object
      if (chat.messages && Array.isArray(chat.messages)) {
        parsedMessages = chat.messages;
      } else if (chat.chat && Array.isArray(chat.chat)) {
        parsedMessages = chat.chat;
      } else {
        // Convert object to array
        parsedMessages = Object.entries(chat).map(([key, value]) => ({
          role: key,
          content: typeof value === 'string' ? value : JSON.stringify(value),
        }));
      }
    } else if (typeof chat === 'string') {
      try {
        const parsed = JSON.parse(chat);
        if (Array.isArray(parsed)) {
          parsedMessages = parsed;
        } else if (parsed.messages) {
          parsedMessages = parsed.messages;
        }
      } catch {
        // If not JSON, treat as single message
        parsedMessages = [{ content: chat }];
      }
    }

    setMessages(parsedMessages);
  }, [chat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatMessage = (message: ChatMessage): { role: string; content: string; time: string } => {
    const role = message.role || message.sender || 'user';
    const content =
      message.content || message.message || message.text || JSON.stringify(message);
    const time = message.timestamp || message.time || '';

    return {
      role: role.toLowerCase().includes('agent') || role.toLowerCase().includes('assistant')
        ? 'agent'
        : 'user',
      content,
      time,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-2xl mx-4 h-[80vh] flex flex-col border border-[var(--card-border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Send className="w-5 h-5" />
            Chat Conversation
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--foreground)]" />
          </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#f0f2f5] dark:bg-[#1a1a1a]">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--secondary)]">No messages available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, idx) => {
                const formatted = formatMessage(message);
                const isAgent = formatted.role === 'agent';

                return (
                  <div
                    key={idx}
                    className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-4 py-2 shadow-sm ${
                        isAgent
                          ? 'bg-white dark:bg-[#2a2a2a] text-[var(--foreground)]'
                          : 'bg-[#dcf8c6] dark:bg-[#075e54] text-[var(--foreground)]'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {formatted.content}
                      </p>
                      {formatted.time && (
                        <p className="text-xs text-[var(--secondary)] mt-1 text-right">
                          {formatted.time}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--table-header-bg)]">
          <p className="text-xs text-[var(--secondary)] text-center">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
        </div>
      </div>
    </div>
  );
}

