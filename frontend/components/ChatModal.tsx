'use client';

import { X, Send, Copy, Check, Languages, Loader2, ChevronDown, RotateCcw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

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
  const [originalMessages, setOriginalMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('english');
  const [translating, setTranslating] = useState(false);
  const [translatedMessages, setTranslatedMessages] = useState<Map<number, string>>(new Map());
  
  const languageOptions = [
    { value: 'english', label: 'English', code: 'en' },
    { value: 'kannada', label: 'Kannada', code: 'kn' },
    { value: 'telugu', label: 'Telugu', code: 'te' },
    { value: 'tamil', label: 'Tamil', code: 'ta' },
    { value: 'hindi', label: 'Hindi', code: 'hi' },
    { value: 'malayalam', label: 'Malayalam', code: 'ml' },
  ];

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
    setOriginalMessages(parsedMessages);
    setTranslatedMessages(new Map()); // Reset translations when chat changes
    setSelectedLanguage('english'); // Reset to English when chat changes
  }, [chat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Helper function to decode HTML entities
  const decodeHtmlEntities = (text: string): string => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const formatMessage = (message: ChatMessage): { role: string; content: string; time: string } => {
    const role = message.role || message.sender || 'user';
    let content =
      message.content || message.message || message.text || JSON.stringify(message);
    
    // Decode HTML entities in content
    content = decodeHtmlEntities(content);
    
    const time = message.timestamp || message.time || '';

    return {
      role: role.toLowerCase().includes('agent') || role.toLowerCase().includes('assistant')
        ? 'agent'
        : 'user',
      content,
      time,
    };
  };

  const handleTranslate = async () => {
    console.log('=== TRANSLATE BUTTON CLICKED ===');
    console.log('[TRANSLATE] handleTranslate called with language:', selectedLanguage);
    console.log('[TRANSLATE] originalMessages count:', originalMessages.length);
    console.log('[TRANSLATE] messages count:', messages.length);

    if (originalMessages.length === 0) {
      console.error('[TRANSLATE] No original messages to translate');
      alert('No messages to translate');
      return;
    }

    setTranslating(true);
    console.log('[TRANSLATE] Starting translation process...');

    try {
      const newTranslatedMessages = new Map<number, string>();

      // Translate each message
      for (let i = 0; i < originalMessages.length; i++) {
        const message = originalMessages[i];
        console.log(`[TRANSLATE] Processing message ${i}:`, message);
        const formatted = formatMessage(message);
        const textToTranslate = formatted.content;
        console.log(`[TRANSLATE] Text to translate (message ${i}):`, textToTranslate?.substring(0, 50) + '...');

        if (!textToTranslate || textToTranslate.trim() === '') {
          console.log(`[TRANSLATE] Skipping message ${i} - empty text`);
          continue;
        }

        try {
          console.log(`[TRANSLATE] Sending API request for message ${i}...`);
          const response = await api.post('/translate', {
            text: textToTranslate,
            target_language: selectedLanguage,
          });

          console.log(`[TRANSLATE] Response status for message ${i}:`, response.status, response.statusText);

          if (response.ok) {
            const result = await response.json();
            console.log(`[TRANSLATE] Response data for message ${i}:`, result);
            if (result.success && result.translated_text) {
              // Decode HTML entities in translated text
              const decodedText = decodeHtmlEntities(result.translated_text);
              newTranslatedMessages.set(i, decodedText);
              console.log(`[TRANSLATE] Successfully translated message ${i}`);
            } else {
              console.error(`[TRANSLATE] Translation API returned error for message ${i}:`, result.message || result);
            }
          } else {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            console.error(`[TRANSLATE] Failed to translate message ${i}:`, response.status, errorData);
          }
        } catch (error: any) {
          console.error(`[TRANSLATE] Error translating message ${i}:`, error);
        }
      }

      console.log(`[TRANSLATE] Translation complete. Translated ${newTranslatedMessages.size} out of ${originalMessages.length} messages`);
      setTranslatedMessages(newTranslatedMessages);

      // Update messages with translations
      const updatedMessages = originalMessages.map((msg, idx) => {
        const translatedText = newTranslatedMessages.get(idx);
        if (translatedText) {
          const formatted = formatMessage(msg);
          return {
            ...msg,
            content: translatedText,
            message: translatedText,
            text: translatedText,
          };
        }
        return msg;
      });

      console.log('[TRANSLATE] Updated messages:', updatedMessages);

      // Only update messages if we got at least some translations
      if (newTranslatedMessages.size > 0) {
        console.log(`[TRANSLATE] Updating messages with translations. Translated ${newTranslatedMessages.size} out of ${originalMessages.length} messages`);
        setMessages([...updatedMessages]); // Create new array to trigger re-render
        console.log('[TRANSLATE] Messages updated in state. New messages:', updatedMessages.slice(0, 2)); // Log first 2 for debugging
      } else {
        console.error('[TRANSLATE] No messages were translated!');
        alert('No messages were translated. Please check the console for errors and ensure TRANSLATE_API_KEY is configured in backend.');
      }
    } catch (error: any) {
      console.error('[TRANSLATE] Error during translation:', error);
      alert(`Failed to translate messages: ${error.message || 'Unknown error'}. Please check the console for details.`);
    } finally {
      setTranslating(false);
      console.log('[TRANSLATE] Translation process completed');
    }
  };

  const handleReset = () => {
    console.log('[RESET] Resetting messages to original');
    // Reset messages to original messages
    const resetMessages = originalMessages.map((msg) => {
      const formatted = formatMessage(msg);
      return {
        ...msg,
        content: formatted.content,
        message: formatted.content,
        text: formatted.content,
      };
    });
    
    // Clear translations and reset messages (keep selected language unchanged)
    setTranslatedMessages(new Map());
    setMessages([...resetMessages]);
    console.log('[RESET] Messages reset to original. Count:', resetMessages.length);
  };

  const handleCopyJSON = async () => {
    try {
      // Convert the original chat data to a nicely formatted JSON string
      const jsonString = typeof chat === 'string' 
        ? chat 
        : JSON.stringify(chat, null, 2);
      
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy JSON:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      const jsonString = typeof chat === 'string' 
        ? chat 
        : JSON.stringify(chat, null, 2);
      textArea.value = jsonString;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('Failed to copy JSON. Please try manually selecting and copying the data.');
      }
      document.body.removeChild(textArea);
    }
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
          <div className="flex items-center gap-2">
            {/* Reset Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleReset();
              }}
              disabled={translating || originalMessages.length === 0}
              className="p-1.5 rounded-md hover:bg-[var(--table-row-hover)] transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reset to original messages"
            >
              <RotateCcw className="w-4 h-4 text-[var(--foreground)]" />
            </button>
            {/* Translation Button and Dropdown */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('=== BUTTON CLICKED ===');
                console.log('Button clicked!', { translating, messagesLength: messages.length, originalMessagesLength: originalMessages.length, selectedLanguage });
                handleTranslate();
              }}
              disabled={translating || originalMessages.length === 0}
              className="p-1.5 rounded-md hover:bg-[var(--table-row-hover)] transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Translate to selected language (${messages.length} messages, ${originalMessages.length} original)`}
            >
              {translating ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
              ) : (
                <Languages className="w-4 h-4 text-[var(--foreground)]" />
              )}
            </button>
            <div className="relative">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                disabled={translating || messages.length === 0}
                className="px-3 py-1.5 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {languageOptions.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
            </div>
            <button
              onClick={handleCopyJSON}
              className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors flex items-center gap-1"
              title="Copy JSON data"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5 text-green-600" />
                  <span className="text-xs text-green-600">Copied!</span>
                </>
              ) : (
                <Copy className="w-5 h-5 text-[var(--foreground)]" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
            >
              <X className="w-5 h-5 text-[var(--foreground)]" />
            </button>
          </div>
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

