import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { stockApi } from '../../api/stock';
import type { StockItem } from '../../types/stock';

/** "Also in Zoho as …" under a merged line, with each name's stock and a Split link. */
export function AliasLine({ item }: { item: StockItem }) {
  const queryClient = useQueryClient();
  const split = useMutation({
    mutationFn: (zohoItemId: string) => stockApi.unmerge(item._id, zohoItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Split - the other name is its own line again');
    },
    onError: () => toast.error('Could not split'),
  });
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
      <span className="font-medium text-slate-600">Merged:</span>
      <span>
        {item.zohoItemName || item.name} <span className="tabular-nums">({item.zohoOwnQuantity ?? '…'})</span>
      </span>
      {item.zohoAliases!.map((a) => (
        <span key={a.zohoItemId} className="inline-flex items-center gap-1">
          + {a.name} <span className="tabular-nums">({a.quantity})</span>
          <button
            type="button"
            disabled={split.isPending}
            onClick={() => {
              if (confirm(`Split "${a.name}" back into its own line?`)) split.mutate(a.zohoItemId);
            }}
            className="rounded px-1 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            Split
          </button>
        </span>
      ))}
    </p>
  );
}
