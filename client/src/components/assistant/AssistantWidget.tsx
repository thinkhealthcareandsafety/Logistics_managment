import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { apiClient } from '../../api/client';
import { Spinner } from '../ui/Loading';

interface AnswerItem {
  label: string;
  sub?: string;
  href?: string;
}
interface Message {
  from: 'me' | 'bot';
  text: string;
  items?: AnswerItem[];
  suggestions?: string[];
}

const WELCOME: Message = {
  from: 'bot',
  text: 'Hi! Ask me about shipments, stock, reorders, couriers or freight - in English or Hinglish. I answer from your live data, and you can follow up on my answers ("how many of them are from Gujarat?").',
  suggestions: ['How many shipments are in transit?', 'Which shipments are late?', 'Delivered this week', 'Shipments by state', 'What is out of stock?', 'Aaj kitne deliver hue?'],
};

/** This browser's id - chats are kept per device (several people share one sign-in). */
function deviceId(): string {
  const KEY = 'th.device';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 32);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'd-no-storage-device';
  }
}

/** **bold** and line breaks / bullets - the only formatting answers use. */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const parts: ReactNode[] = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? (
            <strong key={j} className="font-semibold text-slate-950">
              {p.slice(2, -2)}
            </strong>
          ) : (
            p
          )
        );
        return (
          <p key={i} className={clsx(i > 0 && 'mt-1')}>
            {parts}
          </p>
        );
      })}
    </>
  );
}

function SparkIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
      <path d="M12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * The assistant pop-up on every signed-in page. Answers come from the app's own rules
 * reading the live database (server: services/assistant.service.js) - no AI service,
 * no key, nothing that costs money. The conversation is kept on the server for this
 * device, so it survives refreshes and remembers what a follow-up refers to.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const device = useRef(deviceId()).current;

  // The saved conversation, the first time the panel opens.
  useEffect(() => {
    if (!open || loaded) return;
    apiClient
      .get<{ messages: Message[] }>('/assistant/chat', { params: { device } })
      .then(({ data }) => {
        if (data.messages.length) setMessages([WELCOME, ...data.messages]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open, loaded, device]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, maximized]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, maximized]);

  // Esc shrinks a maximised chat, then closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (maximized) setMaximized(false);
      else setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, maximized]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion('');
    setMessages((m) => [...m, { from: 'me', text: q }]);
    setBusy(true);
    try {
      const { data } = await apiClient.post<{ answer: string; items?: AnswerItem[]; suggestions?: string[] }>('/assistant/ask', { question: q, device });
      setMessages((m) => [...m, { from: 'bot', text: data.answer, items: data.items, suggestions: data.suggestions }]);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'I couldn’t reach the server - check the connection and try again.';
      setMessages((m) => [...m, { from: 'bot', text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  async function newChat() {
    setMessages([WELCOME]);
    await apiClient.post('/assistant/chat/new', { device }).catch(() => {});
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(question);
  }

  const headerButton = 'rounded-md p-1.5 text-white/85 transition hover:bg-white/15 hover:text-white';

  return (
    <>
      {open && maximized && <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px]" onClick={() => setMaximized(false)} aria-hidden />}
      {open && (
        <section
          role="dialog"
          aria-label="Assistant"
          className={clsx(
            'assistant-panel fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.22)]',
            maximized
              ? 'is-max inset-3 sm:inset-x-[max(1.5rem,calc((100vw-60rem)/2))] sm:inset-y-6'
              : 'inset-x-3 bottom-20 max-h-[min(640px,calc(100vh-7rem))] sm:inset-x-auto sm:right-5 sm:w-[400px]'
          )}
        >
          <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <SparkIcon size={18} />
              </span>
              <div>
                <p className="text-[14px] font-semibold">Assistant</p>
                <p className="text-[11px] text-white/85">Live data · English & Hinglish · no AI service, no cost</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={newChat} className="rounded-md px-2 py-1 text-[12px] text-white/90 hover:bg-white/15 hover:text-white" title="Start a new chat (this one is kept)">
                New chat
              </button>
              <button
                type="button"
                onClick={() => setMaximized((m) => !m)}
                aria-label={maximized ? 'Make the chat smaller' : 'Maximise the chat'}
                title={maximized ? 'Smaller' : 'Maximise'}
                className={headerButton}
              >
                {maximized ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className={headerButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={listRef} className={clsx('flex-1 space-y-3 overflow-y-auto bg-orange-50/40 px-3 py-3', maximized && 'sm:px-6')} aria-live="polite">
            {!loaded && (
              <div className="space-y-2" aria-busy="true">
                <div className="shimmer h-10 w-3/4 rounded-2xl" />
                <div className="shimmer ml-auto h-8 w-1/2 rounded-2xl" />
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={clsx('flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'rounded-2xl px-3 py-2 text-[13px] leading-snug',
                    maximized ? 'max-w-[75%]' : 'max-w-[88%]',
                    m.from === 'me' ? 'rounded-br-sm bg-gradient-to-br from-orange-500 to-rose-500 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700'
                  )}
                >
                  {m.from === 'me' ? m.text : <Formatted text={m.text} />}
                  {!!m.items?.length && (
                    <ul className={clsx('mt-2 gap-1', maximized ? 'grid grid-cols-1 lg:grid-cols-2' : 'space-y-1')}>
                      {m.items.map((it, j) => {
                        const body = (
                          <>
                            <span className="block truncate font-medium text-slate-900">{it.label}</span>
                            {it.sub && <span className="block truncate text-[11px] text-slate-500">{it.sub}</span>}
                          </>
                        );
                        return (
                          <li key={j}>
                            {it.href ? (
                              <Link to={it.href} className="block rounded-lg border border-slate-100 px-2 py-1.5 transition hover:border-orange-200 hover:bg-orange-50">
                                {body}
                              </Link>
                            ) : (
                              <div className="rounded-lg border border-slate-100 px-2 py-1.5">{body}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {!!m.suggestions?.length && i === messages.length - 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => ask(s)}
                          className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[12px] font-medium text-orange-800 hover:bg-orange-100"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2">
                  <Spinner />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-2">
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder="Ask anything - e.g. kitne shipments raste mein hain?"
              aria-label="Your question"
              className="input h-10 flex-1"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              aria-label="Ask"
              className="h-10 rounded-lg bg-gradient-to-r from-orange-500 to-rose-500 px-4 text-[14px] font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </section>
      )}

      {!(open && maximized) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close assistant' : 'Open assistant'}
          aria-expanded={open}
          className="assistant-fab fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-[0_8px_24px_rgba(244,63,94,0.45)] ring-4 ring-white transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <SparkIcon />
          )}
        </button>
      )}
    </>
  );
}
