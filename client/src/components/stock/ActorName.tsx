import { useState, type FormEvent } from 'react';
import { getActorName, setActorName } from '../../api/client';

/**
 * Whose name stock changes on this device are recorded under. Asked once per browser
 * (several people share one sign-in); shown as a quiet line after that, with Change.
 */
export function ActorName() {
  const [name, setName] = useState(getActorName);
  const [editing, setEditing] = useState(!getActorName());
  const [draft, setDraft] = useState(name);

  function save(e: FormEvent) {
    e.preventDefault();
    const saved = setActorName(draft);
    if (!saved) return;
    setName(saved);
    setEditing(false);
  }

  if (!editing) {
    return (
      <p className="text-[13px] text-slate-500">
        Changes on this device are recorded as <span className="font-semibold text-slate-800">{name}</span>{' '}
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className="font-medium text-brand-700 hover:text-brand-900"
        >
          Change
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <label htmlFor="actor-name" className="text-[13px] font-medium text-amber-900">
        Who’s making changes on this device?
      </label>
      <input
        id="actor-name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Your name"
        maxLength={40}
        autoComplete="name"
        className="input h-8 w-48 py-0"
      />
      <button type="submit" disabled={!draft.trim()} className="btn-primary h-8 px-3 py-0 text-[13px]">
        Save
      </button>
      {name && (
        <button type="button" onClick={() => setEditing(false)} className="text-[13px] font-medium text-amber-800 hover:text-amber-950">
          Cancel
        </button>
      )}
      <span className="w-full text-[12px] text-amber-800">Every count, stock out, new item, edit and removal you make is saved with this name.</span>
    </form>
  );
}
