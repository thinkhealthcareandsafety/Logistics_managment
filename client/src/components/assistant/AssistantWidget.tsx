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

const STORE = 'th.assistant.chat';
const WELCOME: Message = {
  from: 'bot',
  text: 'Hi! Ask me about shipments, stock, reorders, couriers or freight - I answer from your live data.',
  suggestions: ['How many shipments are in transit?', 'Which shipments are late?', 'Delivered this week', 'What is out of stock?', 'Who is due to reorder?', 'Best courier'],
};

function load(): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || 'null');
    return Array.isArray(saved) && saved.length ? saved : [WELCOME];
  } catch {
    return [WELCOME];
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

/**
 * The assistant pop-up on every signed-in page. Answers come from the app's own rules
 * reading the live database (server: services/assistant.service.js) - no AI service,
 * no key, nothing that costs money. The chat is kept for this browser session only.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(load);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-40)));
    } catch {
      // not kept - fine
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion('');
    setMessages((m) => [...m, { from: 'me', text: q }]);
    setBusy(true);
    try {
      const { data } = await apiClient.post<{ answer: string; items?: AnswerItem[]; suggestions?: string[] }>('/assistant/ask', { question: q });
      setMessages((m) => [...m, { from: 'bot', text: data.answer, items: data.items, suggestions: data.suggestions }]);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'I couldn’t reach the server - check the connection and try again.';
      setMessages((m) => [...m, { from: 'bot', text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(question);
  }

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Assistant"
          className="assistant-panel fixed inset-x-3 bottom-20 z-40 flex max-h-[min(640px,calc(100vh-7rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.18)] sm:inset-x-auto sm:right-5 sm:w-[400px]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-brand-900 px-4 py-3 text-white">
            <div>
              <p className="text-[14px] font-semibold">Assistant</p>
              <p className="text-[11px] text-white/70">Answers from your live data · no AI service, no cost</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([WELCOME])}
                className="rounded-md px-2 py-1 text-[12px] text-white/80 hover:bg-white/10 hover:text-white"
              >
                Clear
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-3" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={clsx('flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-snug',
                    m.from === 'me' ? 'rounded-br-sm bg-brand-800 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700'
                  )}
                >
                  {m.from === 'me' ? m.text : <Formatted text={m.text} />}
                  {!!m.items?.length && (
                    <ul className="mt-2 space-y-1">
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
                              <Link to={it.href} className="block rounded-lg border border-slate-100 px-2 py-1.5 transition hover:border-brand-200 hover:bg-brand-50/40">
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
                          className="rounded-full border border-brand-200 bg-brand-50/50 px-2.5 py-1 text-[12px] font-medium text-brand-800 hover:bg-brand-50"
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
              placeholder="Ask about shipments, stock, couriers…"
              aria-label="Your question"
              className="input h-10 flex-1"
            />
            <button type="submit" disabled={busy || !question.trim()} className="btn-primary h-10 px-4 py-0" aria-label="Ask">
              Ask
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        className="assistant-fab fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-900 text-white shadow-[0_6px_20px_rgba(15,23,42,0.25)] transition hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
            <path d="M8 10h8M8 13h5" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </>
  );
}
