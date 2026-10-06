import { useRef, useState } from 'react';
import { useBulkImportShipments } from '../hooks/useShipments';
import type { BulkImportResult } from '../types/shipment';

const SAMPLE_CSV = `tracking_number,carrier_code,product_name,sku,quantity,category,customer_name,customer_email,customer_phone,customer_address,delivery_city,delivery_state,delivery_pincode,weight_kg,freight,shipping_date,estimated_delivery
26043200316922,shreemaruticourier,N95 Respirator Masks,PPE-N95-050,20,PPE,Apollo Diagnostics,procurement@apollodx.example,+91 98765 43210,"12, Residency Road",Bengaluru,Karnataka,560025,6.5,420,2026-09-20,2026-09-25
50212345678,bluedart,Surgical Gloves (Case),PPE-GLV-CASE,10,PPE,Fortis Hospital,stores@fortis.example,+91 98111 22334,"Okhla Road",New Delhi,Delhi,110025,4.2,310,2026-09-21,2026-09-24
`;

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shree-maruti-shipments-sample.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportDialog({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const bulkImport = useBulkImportShipments();

  async function handleImport() {
    if (!selectedFile) return;
    const res = await bulkImport.mutateAsync(selectedFile);
    setResult(res);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Bulk Import Shipments</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">
          Upload a CSV of shipments from any courier. Columns: <code className="text-xs">tracking_number</code> (required),{' '}
          <code className="text-xs">carrier_code</code> (TrackingMore code, e.g. shreemaruticourier, delhivery, bluedart, dtdc,
          india-post - Shree Maruti if empty), product_name, sku, quantity, category, customer_name, customer_email,
          customer_phone, customer_address
          (street), delivery_city, delivery_state, delivery_pincode, weight_kg, freight (₹), shipping_date,
          estimated_delivery. Everything except the AWB is optional.
        </p>
        <button type="button" onClick={downloadSampleCsv} className="mb-4 text-xs font-medium text-brand-700 hover:underline">
          Download sample CSV
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setSelectedFile(e.target.files?.[0] || null);
            setResult(null);
          }}
          className="input"
        />

        {result && (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-emerald-700">{result.imported} of {result.totalRows} row(s) imported.</p>
            {result.failed.length > 0 && (
              <div>
                <p className="font-medium text-red-600">{result.failed.length} row(s) failed:</p>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {result.failed.map((f) => (
                    <li key={f.row}>
                      Row {f.row} ({f.trackingNumber}): {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!selectedFile || bulkImport.isPending}
              className="btn-primary"
            >
              {bulkImport.isPending ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
