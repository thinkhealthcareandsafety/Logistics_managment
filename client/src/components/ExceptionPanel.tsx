import { useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import type { Shipment } from '../types/shipment';
import { useAddShipmentNote, useUpdateShipment } from '../hooks/useShipments';
import { attentionReason } from '../utils/urgency';
import { Spinner } from './ui/Loading';

/**
 * The working surface for a stuck shipment: what went wrong, who's on it, and a log of
 * what's been tried. Claiming it ("I'm on it") drops it out of the dashboard's
 * attention count, so the rest of the team knows it's handled.
 */
export function ExceptionPanel({ shipment }: { shipment: Shipment }) {
  const [note, setNote] = useState('');
  const updateShipment = useUpdateShipment();
  const addNote = useAddShipmentNote();
  const followUp = shipment.exceptionFollowUp || { isBeingFollowedUp: false, notes: [] };
  const claimed = followUp.isBeingFollowedUp;
  const latest = shipment.checkpoints?.[shipment.checkpoints.length - 1];

  async function toggleFollowUp() {
    await updateShipment.mutateAsync({ id: shipment._id, data: { isBeingFollowedUp: !claimed } });
  }

  async function submitNote() {
    if (!note.trim()) return;
    await addNote.mutateAsync({ id: shipment._id, text: note.trim() });
    setNote('');
  }

  return (
    <section
      className={clsx(
        'overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        claimed ? 'border-slate-200' : 'border-red-200'
      )}
    >
      <div
        className={clsx(
          'flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between',
          claimed ? 'border-slate-100 bg-slate-50/70' : 'border-red-100 bg-red-50/70'
        )}
      >
        <div className="min-w-0">
          <h2 className={clsx('flex items-center gap-2 text-[15px] font-semibold', claimed ? 'text-slate-900' : 'text-red-800')}>
            <span aria-hidden className={clsx('h-2 w-2 rounded-full', claimed ? 'bg-emerald-500' : 'bg-red-500')} />
            {claimed ? 'Exception - being followed up' : 'Exception - needs follow-up'}
          </h2>
          <p className={clsx('mt-1 text-[13px]', claimed ? 'text-slate-600' : 'text-red-800/80')}>
            {latest?.description || attentionReason(shipment)}
            {latest?.location ? ` · ${latest.location}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleFollowUp}
          disabled={updateShipment.isPending} aria-busy={updateShipment.isPending}
          aria-pressed={claimed}
          className={clsx(
            'inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg px-3 text-[13px] font-medium transition disabled:opacity-60',
            claimed
              ? 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
              : 'bg-red-600 text-white shadow-sm hover:bg-red-700'
          )}
        >
          {updateShipment.isPending ? (
            <>
              <Spinner className="h-3.5 w-3.5" />
              Saving…
            </>
          ) : claimed ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="text-emerald-600">
                <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Being followed up
            </>
          ) : (
            "I'm on it"
          )}
        </button>
      </div>

      <div className="space-y-4 p-5">
        {followUp.notes.length === 0 ? (
          <p className="text-[13px] text-slate-500">
            No notes yet. Log each call or email so whoever picks this up next knows where it stands.
          </p>
        ) : (
          <ol className="space-y-3">
            {followUp.notes.map((n, idx) => (
              <li key={idx} className="rounded-lg bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-100">
                <p className="text-[13px] leading-relaxed text-slate-800">{n.text}</p>
                <p className="mt-1.5 text-[12px] text-slate-400">
                  {n.authorName || 'Team member'} · {format(new Date(n.createdAt), 'd MMM yyyy · h:mm a')}
                </p>
              </li>
            ))}
          </ol>
        )}

        <div>
          <label htmlFor="exception-note" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            Add a note
          </label>
          <textarea
            id="exception-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote();
            }}
            placeholder="e.g. Called the courier’s Delhi hub - paperwork resubmitted, release expected tomorrow"
            className="input min-h-[76px] resize-y"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="hidden text-[12px] text-slate-400 sm:inline">Ctrl + Enter to save</span>
            <button
              type="button"
              onClick={submitNote}
              disabled={!note.trim() || addNote.isPending} aria-busy={addNote.isPending}
              className="btn-primary ml-auto h-8 px-3 py-0 text-[13px]"
            >
              {addNote.isPending && <Spinner />}
              {addNote.isPending ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
