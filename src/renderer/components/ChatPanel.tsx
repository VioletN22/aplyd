import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface ChatPanelProps {
  applicationId: string;
  company: string;
  jobTitle: string;
}

const SUGGESTIONS = [
  'How should I prep for this stage?',
  'Write a short follow-up email',
  'What should I highlight in my resume?',
  'Likely interview questions?',
];

export const ChatPanel: React.FC<ChatPanelProps> = ({ applicationId, company, jobTitle }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (window as any).electronAPI.chat
      .getMessages(applicationId)
      .then((msgs: ChatMessage[]) => setMessages(msgs))
      .catch(() => {});
  }, [applicationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;

    setError(null);
    setSending(true);
    setInput('');

    // Optimistic user message
    const tempUser: ChatMessage = {
      id: `temp-${messages.length}`,
      role: 'user',
      content: message,
      created_at: '',
    };
    setMessages((prev) => [...prev, tempUser]);

    try {
      const result = await (window as any).electronAPI.chat.send(applicationId, message);
      if (!result.success) throw new Error(result.error || 'Chat failed');
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUser.id),
        result.userMessage,
        result.assistantMessage,
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
      setInput(message);
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--line)', backgroundColor: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
        <p style={{ fontSize: '11px', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Assistant
        </p>
        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
          Knows this {jobTitle} application at {company}. Ask anything.
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: '340px',
          minHeight: '120px',
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 && !sending && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  backgroundColor: 'var(--panel)',
                  border: '1px solid var(--line)',
                  fontSize: '13px',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--ink)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '10px 12px',
              fontSize: '13px',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              backgroundColor: m.role === 'user' ? 'var(--ink)' : 'var(--panel)',
              color: m.role === 'user' ? 'var(--bg)' : 'var(--ink)',
            }}
          >
            {m.content}
          </div>
        ))}

        {sending && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '10px 12px',
              backgroundColor: 'var(--panel)',
              fontSize: '13px',
              color: 'var(--muted)',
            }}
          >
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <p style={{ padding: '0 16px 8px', fontSize: '12px', color: 'var(--accent)' }}>{error}</p>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--line)' }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this application…"
          disabled={sending}
          style={{
            flex: 1,
            padding: '8px 0',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--line)',
            fontSize: '13px',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            padding: '8px 12px',
            backgroundColor: input.trim() && !sending ? 'var(--accent)' : 'var(--panel)',
            color: input.trim() && !sending ? '#fff' : 'var(--muted)',
            border: 'none',
            cursor: input.trim() && !sending ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Send"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
