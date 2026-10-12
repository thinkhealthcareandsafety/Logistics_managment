import { useState } from 'react';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../Modal';
import { Skeleton, SkeletonRegion, Spinner } from '../ui/Loading';
import { stockApi } from '../../api/stock';

/**
 * Same product entered more than once under different names. Gemini proposes groups
 * (variants like sizes and colours are never grouped); merging keeps one name and adds
 * the stock of every name together. A merge can be split again from the stock line.
 */
export function DuplicatesDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: groups, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['stock', 'duplicates'],
    queryFn: stockApi.suggestDuplicates,
    staleTime: 5 * 60_000,
  });
  const [keep, setKeep] = useState<Record<number, string>>({});
  const [merged, setMerged] = useState<Set<number>>(new Set());
  const merge = useMutation({
    mutationFn: ({ keepId, otherIds }: { keepId: string; otherIds: string[]; index: number }) => stockApi.merge(keepId, otherIds),
    onSuccess: (_, v) => {
      setMerged((s) => new Set(s).add(v.index));
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Merged - one line now shows the stock of every name');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not merge'),
  });

  return (
    <Modal
      size="lg"
      title="Duplicate items"
      description="The same product entered under different names in Zoho. Merging keeps one name and totals the stock. Sizes, colours and models are never grouped."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="mr-auto inline-flex items-center gap-2 text-[13px] font-medium text-brand-700 hover:text-brand-900 disabled:opacity-60">
            {isFetching && <Spinner className="h-3.5 w-3.5" />}
            Check again
          </button>
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Done
          </button>
        </>
      }
    >
      {isLoading ? (
        <SkeletonRegion label="Looking for duplicates" className="space-y-3">
          <p className="text-[13px] text-slate-500">Reading all items to find the same product under different names…</p>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </SkeletonRegion>
      ) : isError ? (
        <p className="text-[13px] text-red-600">Couldn’t check for duplicates right now - try again.</p>
      ) : !groups?.length ? (
        <p className="py-6 text-center text-[13px] text-slate-500">No duplicates found - every product appears under one name.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g, gi) => {
            const keepId = keep[gi] ?? g.ids[g.names.indexOf(g.keepName)] ?? g.ids[0];
            const done = merged.has(gi);
            return (
              <li key={g.ids.join()} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1.5">
                    {g.ids.map((id, i) => (
                      <label key={id} className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-800">
                        <input type="radio" name={`keep-${gi}`} checked={keepId === id} disabled={done} onChange={() => setKeep((k) => ({ ...k, [gi]: id }))} className="accent-brand-800" />
                        {g.names[i]}
                        {keepId === id && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-800">keep this name</span>}
                      </label>
                    ))}
                    <p className="text-[12px] text-slate-500">{g.reason}</p>
                  </div>
                  {done ? (
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-medium text-emerald-700">Merged</span>
                  ) : (
                    <button
                      type="button"
                      disabled={merge.isPending}
                      onClick={() => merge.mutate({ keepId, otherIds: g.ids.filter((id) => id !== keepId), index: gi })}
                      className="btn-primary h-8 px-3 py-0 text-[13px]"
                    >
                      {merge.isPending && merge.variables?.index === gi && <Spinner className="h-3.5 w-3.5" />}
                      Merge
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
