import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';

export interface SignaturePadHandle {
  /** The signature as a PNG on white, or null when nothing has been drawn. */
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

/** Sign with a finger (or mouse). Pointer events, so it works the same on phones and laptops. */
export const SignaturePad = forwardRef<SignaturePadHandle, { label: string; onChange?: (signed: boolean) => void }>(
  function SignaturePad({ label, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [signed, setSigned] = useState(false);

    // Crisp on high-density screens: draw at device pixels, display at CSS pixels.
    const setup = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
    }, []);

    useEffect(() => {
      setup();
    }, [setup]);

    const mark = (value: boolean) => {
      setSigned(value);
      onChange?.(value);
    };

    useImperativeHandle(ref, () => ({
      toBlob: () =>
        new Promise((resolve) => {
          if (!signed || !canvasRef.current) return resolve(null);
          canvasRef.current.toBlob((b) => resolve(b), 'image/png');
        }),
      clear: () => {
        setup();
        mark(false);
      },
    }));

    function point(e: PointerEvent<HTMLCanvasElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    return (
      <div>
        <div className="relative rounded-lg border-2 border-dashed border-slate-300 bg-white">
          <canvas
            ref={canvasRef}
            aria-label={label}
            className="block h-40 w-full touch-none rounded-lg"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              const ctx = e.currentTarget.getContext('2d')!;
              const { x, y } = point(e);
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + 0.1, y + 0.1);
              ctx.stroke();
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = e.currentTarget.getContext('2d')!;
              const { x, y } = point(e);
              ctx.lineTo(x, y);
              ctx.stroke();
            }}
            onPointerUp={() => {
              if (drawing.current) mark(true);
              drawing.current = false;
            }}
            onPointerCancel={() => {
              drawing.current = false;
            }}
          />
          {!signed && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-slate-400">
              {label}
            </span>
          )}
        </div>
        {signed && (
          <button
            type="button"
            onClick={() => {
              setup();
              mark(false);
            }}
            className="mt-1 text-[12px] font-medium text-brand-700 hover:text-brand-900"
          >
            Clear and sign again
          </button>
        )}
      </div>
    );
  }
);
