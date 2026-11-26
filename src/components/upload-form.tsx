"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET, isAcceptedMimeType, MAX_FILE_BYTES, MAX_FILES } from "@/lib/documents";
import { registerDocument } from "@/app/(app)/receiving/actions";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function UploadForm({
  businessId,
  warehouses,
}: {
  businessId: string;
  warehouses: { id: string; name: string; is_default: boolean }[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [warehouseId, setWarehouseId] = useState(
    (warehouses.find((w) => w.is_default) ?? warehouses[0])?.id ?? "",
  );
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  function addFiles(list: FileList | null) {
    const added = Array.from(list ?? []);
    if (added.length === 0) {
      return;
    }
    const rejected = added.find((file) => !isAcceptedMimeType(file.type));
    if (rejected) {
      setError(`אי אפשר להעלות את ${rejected.name}. מתקבלים תמונות (JPG, PNG, WebP) וקובצי PDF.`);
      return;
    }
    const tooBig = added.find((file) => file.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`הקובץ ${tooBig.name} גדול מ-20MB. נסו לצלם שוב או לפצל את הקובץ.`);
      return;
    }
    if (files.length + added.length > MAX_FILES) {
      setError(`אפשר להעלות עד ${MAX_FILES} קבצים למסמך אחד.`);
      return;
    }
    setError(null);
    setFiles((current) => [...current, ...added]);
  }

  async function submit() {
    if (files.length === 0 || !warehouseId) {
      return;
    }
    setError(null);
    const documentId = crypto.randomUUID();
    const supabase = createClient();
    const uploaded: { path: string; name: string }[] = [];

    for (const [index, file] of files.entries()) {
      setProgress(`מעלה קובץ ${index + 1} מתוך ${files.length}…`);
      const path = `${businessId}/${documentId}/${index + 1}.${EXTENSIONS[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setProgress(null);
        setError(`העלאת ${file.name} נכשלה. בדקו את החיבור לאינטרנט ונסו שוב.`);
        return;
      }
      uploaded.push({ path, name: file.name });
    }

    setProgress("שומר את המסמך…");
    // On success the action redirects to the document page and never returns here.
    const result = await registerDocument({ documentId, warehouseId, files: uploaded });
    setProgress(null);
    setError(result.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card">
        <label className="label" htmlFor="warehouse">לאן נכנסת הסחורה</label>
        <select
          className="field min-h-11 sm:max-w-xs"
          id="warehouse"
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          disabled={busy}
        >
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
      </section>

      <section className="card">
        <h2 className="font-semibold">המסמך</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          תעודת משלוח או חשבונית: צילום או PDF. למסמך של כמה עמודים מוסיפים את כולם, לפי הסדר.
        </p>

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="file-input"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-quiet sm:hidden" disabled={busy} onClick={() => cameraInput.current?.click()}>
            צילום עמוד
          </button>
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => fileInput.current?.click()}>
            בחירת קבצים
          </button>
        </div>

        {files.length > 0 && (
          <ol className="mt-4 divide-y divide-line border-t border-line">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-3 py-2">
                <span className="w-6 text-sm text-muted tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm" dir="auto">{file.name}</span>
                <span className="text-xs text-muted tabular-nums" dir="ltr">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm text-danger underline-offset-4 hover:underline"
                  disabled={busy}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  הסרה
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy || files.length === 0 || !warehouseId} onClick={submit}>
          {busy ? progress : "העלאה וקריאת המסמך"}
        </button>
        <p aria-live="polite" className="text-sm text-danger empty:hidden">
          {error}
        </p>
      </div>
    </div>
  );
}
