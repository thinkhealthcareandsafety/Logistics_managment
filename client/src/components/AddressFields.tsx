import { useEffect, useRef, useState } from 'react';
import { geoApi } from '../api/geo';
import { FormField } from './Modal';
import type { DeliveryAddress } from '../types/shipment';

export const EMPTY_ADDRESS: DeliveryAddress = { line: '', city: '', state: '', pincode: '' };

/**
 * Client delivery address. Typing a 6-digit pincode looks it up (India Post) and fills
 * city + state, only into boxes the user hasn't typed in themselves - and it stays
 * fully editable, because a lookup is a convenience, not the source of truth.
 */
export function AddressFields({
  value,
  onChange,
  idPrefix = 'addr',
}: {
  value: DeliveryAddress;
  onChange: (next: DeliveryAddress) => void;
  idPrefix?: string;
}) {
  const [lookup, setLookup] = useState<{ state: 'idle' | 'loading' | 'found' | 'error'; message?: string; areas?: string[] }>({
    state: 'idle',
  });
  // Which of city/state were filled by the lookup (safe to overwrite on the next one).
  const autoFilled = useRef({ city: false, state: false });
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const pin = value.pincode;
    if (!/^\d{6}$/.test(pin)) {
      setLookup({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setLookup({ state: 'loading' });
    geoApi
      .pincode(pin)
      .then((info) => {
        if (cancelled) return;
        const cur = latest.current;
        const next = { ...cur };
        if (!cur.city || autoFilled.current.city) {
          next.city = info.city;
          autoFilled.current.city = true;
        }
        if (!cur.state || autoFilled.current.state) {
          next.state = info.state;
          autoFilled.current.state = true;
        }
        onChange(next);
        setLookup({ state: 'found', message: `${info.city}, ${info.state}`, areas: info.areas });
      })
      .catch((err) => {
        if (!cancelled) {
          setLookup({ state: 'error', message: err?.response?.data?.message || 'Couldn’t look up that pincode' });
        }
      });
    return () => {
      cancelled = true;
    };
    // Only the pincode drives a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.pincode]);

  function set(key: keyof DeliveryAddress, v: string) {
    // Typed by hand = theirs; a later pincode lookup won't overwrite it.
    if (key === 'city') autoFilled.current.city = false;
    if (key === 'state') autoFilled.current.state = false;
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-3">
      <FormField label="Address" htmlFor={`${idPrefix}-line`} optional>
        <input
          id={`${idPrefix}-line`}
          value={value.line}
          onChange={(e) => set('line', e.target.value)}
          placeholder="Building, street, area"
          autoComplete="street-address"
          className="input"
        />
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[130px_1fr_1fr]">
        <FormField
          label="Pincode"
          htmlFor={`${idPrefix}-pincode`}
          hint={
            lookup.state === 'loading'
              ? 'Looking up…'
              : lookup.state === 'found'
                ? 'City and state filled in'
                : lookup.state === 'error'
                  ? lookup.message
                  : 'Fills city and state'
          }
        >
          <input
            id={`${idPrefix}-pincode`}
            inputMode="numeric"
            maxLength={6}
            value={value.pincode}
            onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="411005"
            autoComplete="postal-code"
            aria-invalid={lookup.state === 'error'}
            className="input tabular-nums"
          />
        </FormField>
        <FormField label="City / district" htmlFor={`${idPrefix}-city`}>
          <input
            id={`${idPrefix}-city`}
            value={value.city}
            onChange={(e) => set('city', e.target.value)}
            list={lookup.areas?.length ? `${idPrefix}-areas` : undefined}
            autoComplete="address-level2"
            className="input"
          />
          {lookup.areas?.length ? (
            <datalist id={`${idPrefix}-areas`}>
              {lookup.areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          ) : null}
        </FormField>
        <FormField label="State" htmlFor={`${idPrefix}-state`}>
          <input
            id={`${idPrefix}-state`}
            value={value.state}
            onChange={(e) => set('state', e.target.value)}
            autoComplete="address-level1"
            className="input"
          />
        </FormField>
      </div>
    </div>
  );
}
