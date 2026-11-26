"use client";

import { useRef, useState } from "react";
import { AlertCircle, Camera, FileText, Image as ImageIcon, Loader2, Trash2, UploadCloud, Warehouse } from "lucide-react";
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
  const [dragging, setDragging] = useState(false);
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
        <div className="mb-3 flex items-center gap-2">
          <Warehouse className="size-4.5 text-accent" aria-hidden />
          <label className="text-base font-bold text-ink" htmlFor="warehouse">לאן נכנסת הסחורה</label>
        </div>
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
        <h2 className="section-heading">
          <UploadCloud className="size-4.5 text-accent" aria-hidden />
          <span>קובצי המסמך</span>
        </h2>
        <p className="mt-1.5 mb-5 text-sm text-muted">
          תעודת משלוח או חשבונית: צילום או PDF (עד {MAX_FILES} קבצים). למסמך של כמה עמודים מוסיפים את כולם, לפי הסדר.
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

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) {
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) {
              addFiles(event.dataTransfer.files);
            }
          }}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragging
              ? "border-accent bg-accent-soft/60"
              : "border-line bg-surface-subtle/40 hover:border-line-strong"
          }`}
        >
          <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-surface text-accent shadow-xs">
            <UploadCloud className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">גררו לכאן קבצים או בחרו מהמכשיר</p>
          <p className="mt-1 text-xs text-muted">JPG, PNG, WebP או PDF · עד 20MB לקובץ</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn-quiet sm:hidden" disabled={busy} onClick={() => cameraInput.current?.click()}>
              <Camera className="size-4 text-accent" aria-hidden />
              <span>צילום עמוד</span>
            </button>
            <button type="button" className="btn-quiet" disabled={busy} onClick={() => fileInput.current?.click()}>
              <UploadCloud className="size-4 text-accent" aria-hidden />
              <span>בחירת קבצים</span>
            </button>
          </div>
        </div>

        {files.length > 0 && (
          <ol className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface-subtle/30 px-3">
            {files.map((file, index) => {
              const isPdf = file.type === "application/pdf";
              return (
                <li key={`${file.name}-${index}`} className="flex items-center gap-3 py-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-xs">
                    {isPdf ? <FileText className="size-4" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />}
                  </span>
                  <span className="w-5 text-xs font-bold text-muted tabular-nums">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" dir="auto">{file.name}</span>
                  <span className="badge bg-surface text-muted tabular-nums" dir="ltr">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-danger hover:bg-danger-soft"
                    disabled={busy}
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    <span>הסרה</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy || files.length === 0 || !warehouseId} onClick={submit}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UploadCloud className="size-4" aria-hidden />}
          <span>{busy ? progress : "העלאה וקריאת המסמך"}</span>
        </button>
        <div aria-live="polite" className="empty:hidden">
          {error && (
            <p className="inline-flex items-center gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
