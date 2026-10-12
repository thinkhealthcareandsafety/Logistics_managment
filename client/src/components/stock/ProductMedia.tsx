import { useState } from 'react';
import clsx from 'clsx';
import { Modal } from '../Modal';
import { displayName } from '../../utils/stock';
import type { StockItem } from '../../types/stock';

/** buyaedindia.com photo first (fast CDN), else Zoho Books' own photo, else nothing. */
export function primaryImage(item: StockItem): string | null {
  if (item.media?.images?.length) return item.media.images[0];
  if (item.zohoHasImage) return `${import.meta.env.VITE_API_URL || '/api'}/stock/items/${item._id}/zoho-image`;
  return null;
}

const mediaCount = (item: StockItem) =>
  (item.media?.images.length ?? 0) + (item.media?.videos.length ?? 0) + (item.media?.brochures.length ?? 0) + (item.zohoHasImage ? 1 : 0);

/** Small square photo at the start of a stock line; opens the media gallery. */
export function ItemThumb({ item, onOpen }: { item: StockItem; onOpen: () => void }) {
  const src = primaryImage(item);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const has = mediaCount(item) > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!has}
      title={has ? 'Photos, videos and brochures' : 'No photos or brochures found for this item yet'}
      aria-label={has ? `Photos, videos and brochures for ${displayName(item)}` : undefined}
      className={clsx(
        'relative h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200 transition',
        has ? 'cursor-pointer hover:ring-brand-400' : 'cursor-default',
        src && !loaded && !broken && 'animate-pulse bg-slate-200/70',
        (!src || broken) && 'bg-slate-50'
      )}
    >
      {src && !broken ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={clsx('h-full w-full bg-white object-contain transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
        />
      ) : (
        <svg className="m-auto h-4 w-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="m3 16 5-5 4 4 3-3 6 6M15 9h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {(item.media?.videos.length ?? 0) > 0 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/80 px-0.5 text-[8px] font-bold text-white">▶</span>
      )}
    </button>
  );
}

const youtubeEmbed = (url: string) => {
  const id = url.match(/[?&]v=([\w-]{11})/)?.[1] || url.match(/youtu\.be\/([\w-]{11})/)?.[1];
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
};

/** Every photo, video and brochure found for a line. */
export function ProductMediaDialog({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const images = [...(item.media?.images ?? [])];
  const zoho = item.zohoHasImage ? primaryImage({ ...item, media: undefined }) : null;
  if (zoho) images.push(zoho);
  const [active, setActive] = useState(0);
  const videos = item.media?.videos ?? [];
  const brochures = item.media?.brochures ?? [];

  return (
    <Modal
      size="lg"
      title={displayName(item)}
      description={item.media?.sourceTitle ? `From buyaedindia.com - “${item.media.sourceTitle}”` : 'From Zoho Books'}
      onClose={onClose}
      footer={
        <>
          {item.media?.sourceUrl && (
            <a href={item.media.sourceUrl} target="_blank" rel="noreferrer" className="mr-auto text-[13px] font-medium text-brand-700 hover:underline">
              Open product page ↗
            </a>
          )}
          <button type="button" onClick={onClose} className="btn-secondary h-9 px-3 py-0 text-[13px]">
            Close
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {images.length > 0 && (
          <div>
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
              <img src={images[active]} referrerPolicy="no-referrer" alt={displayName(item)} className="max-h-full max-w-full object-contain" />
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActive(i)}
                    className={clsx(
                      'h-14 w-14 shrink-0 overflow-hidden rounded-md ring-2 transition',
                      i === active ? 'ring-brand-500' : 'ring-transparent hover:ring-slate-300'
                    )}
                  >
                    <img src={src} referrerPolicy="no-referrer" alt="" loading="lazy" className="h-full w-full bg-white object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {videos.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-slate-900">Videos</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {videos.map((v) => {
                const embed = youtubeEmbed(v);
                return embed ? (
                  <div key={v} className="aspect-video overflow-hidden rounded-lg bg-black">
                    <iframe
                      src={embed}
                      title={`${displayName(item)} video`}
                      loading="lazy"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                  </div>
                ) : (
                  <a key={v} href={v} target="_blank" rel="noreferrer" className="text-[13px] text-brand-700 hover:underline">
                    {v}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {brochures.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-slate-900">Brochures</p>
            <ul className="space-y-2">
              {brochures.map((b) => (
                <li key={b.url}>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">PDF</span>
                    {b.title} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
