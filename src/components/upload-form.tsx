"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET, isAcceptedMimeType, MAX_FILE_BYTES, MAX_FILES } from "@/lib/documents";
import { registerDocument } from "@/app/(app)/receiving/actions";
import { takeSharedFiles } from "@/lib/share-target";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};
// Any picture may be chosen: the ones storage does not take (an iPhone's HEIC, for one) are redrawn as JPEG.
const ACCEPT = "image/*,.heic,.heif,application/pdf,.pdf";
const OTHER_IMAGE = /\.(heic|heif|gif|bmp|tiff?|avif)$/i;
const MAX_REDRAW_SIDE = 4000;

type Item = { file: File; preview: string | null };

/** Redraws a picture as a JPEG, if this browser can open it. */
async function toJpeg(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_REDRAW_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

/** Returns the file in a type storage accepts, or null when it is not a picture or a PDF we can use. */
async function normalize(file: File): Promise<File | null> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  // Some phones and mail apps hand over files without a type.
  const type = file.type || TYPE_BY_EXTENSION[extension] || "";
  if (isAcceptedMimeType(type)) {
    if (type !== "application/pdf" && file.size > MAX_FILE_BYTES) {
      return toJpeg(file);
    }
    return type === file.type ? file : new File([file], file.name, { type });
  }
  if (type.startsWith("image/") || OTHER_IMAGE.test(file.name)) {
    return toJpeg(file);
  }
  return null;
}

export function UploadForm({
  businessId,
  warehouses,
}: {
  businessId: string;
  warehouses: { id: string; name: string; is_default: boolean }[];
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouseId, setWarehouseId] = useState(
    (warehouses.find((w) => w.is_default) ?? warehouses[0])?.id ?? "",
  );
  const [progress, setProgress] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  const busy = progress !== null;
  const ready = items.length > 0 && Boolean(warehouseId);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function addFiles(list: FileList | File[] | null) {
    const added = Array.from(list ?? []);
    if (added.length === 0 || busy) {
      return;
    }
    if (items.length + added.length > MAX_FILES) {
      setError(`אפשר להעלות עד ${MAX_FILES} קבצים למסמך אחד.`);
      return;
    }
    setError(null);
    setPreparing(true);
    const accepted: Item[] = [];
    for (const original of added) {
      const file = await normalize(original);
      if (!file) {
        setError(
          /\.(heic|heif)$/i.test(original.name)
            ? `הדפדפן הזה לא פותח תמונות HEIC של אייפון (${original.name}). שמרו אותה כ-JPG, או העלו אותה מהאייפון עצמו.`
            : `אי אפשר להעלות את ${original.name}. מתקבלים תמונות (JPG, PNG, WebP) וקובצי PDF.`,
        );
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`הקובץ ${original.name} גדול מ-20MB. נסו לצלם שוב או לפצל את הקובץ.`);
        continue;
      }
      const preview = file.type === "application/pdf" ? null : URL.createObjectURL(file);
      if (preview) {
        previews.current.add(preview);
      }
      accepted.push({ file, preview });
    }
    setPreparing(false);
    setItems((current) => [...current, ...accepted]);
  }

  // Files shared to the installed app (from WhatsApp, for one) are waiting when the screen opens.
  const sharedTaken = useRef(false);
  const addShared = useEffectEvent((files: File[], missed: boolean) => {
    if (files.length > 0) {
      void addFiles(files);
    } else if (missed) {
      setError("הקבצים ששיתפתם לא הגיעו. שתפו אותם שוב, או בחרו אותם כאן.");
    }
  });
  useEffect(() => {
    if (sharedTaken.current) {
      return;
    }
    sharedTaken.current = true;
    const missed = new URLSearchParams(window.location.search).get("shared") === "missed";
    takeSharedFiles().then(
      (files) => addShared(files, missed),
      () => addShared([], true),
    );
  }, []);

  function remove(index: number) {
    const preview = items[index]?.preview;
    if (preview) {
      URL.revokeObjectURL(preview);
      previews.current.delete(preview);
    }
    setItems((current) => current.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!ready) {
      return;
    }
    setError(null);
    const documentId = crypto.randomUUID();
    const supabase = createClient();
    const uploaded: { path: string; name: string }[] = [];

    for (const [index, { file }] of items.entries()) {
      setProgress(`מעלה קובץ ${index + 1} מתוך ${items.length}…`);
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

    setProgress("שומר ועובר לקריאה…");
    // On success the action redirects to the document page and never returns here.
    const result = await registerDocument({ documentId, warehouseId, files: uploaded });
    setProgress(null);
    setError(result.error);
  }

  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(event.target.files);
    event.target.value = "";
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="card">
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={onPicked} />
        <input ref={fileInput} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden data-testid="file-input" onChange={onPicked} />

        <div
          className={`flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft" : "border-line"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">
              {items.length === 0 ? "צלמו או העלו את תעודת המשלוח או החשבונית" : "יש עוד עמודים? הוסיפו אותם לפי הסדר"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              תמונה או PDF, עד {MAX_FILES} עמודים. <span className="hidden sm:inline">אפשר גם לגרור לכאן.</span>
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className={`sm:hidden ${items.length === 0 ? "btn" : "btn-quiet"}`} disabled={busy} onClick={() => cameraInput.current?.click()}>
              צילום עמוד
            </button>
            <button type="button" className={items.length === 0 ? "btn max-sm:hidden" : "btn-quiet max-sm:hidden"} disabled={busy} onClick={() => fileInput.current?.click()}>
              בחירת תמונה או PDF
            </button>
            <button type="button" className="btn-quiet sm:hidden" disabled={busy} onClick={() => fileInput.current?.click()}>
              בחירה מהמכשיר
            </button>
          </div>
          {preparing && <p className="text-sm text-muted" aria-live="polite">מכין את הקבצים…</p>}
        </div>

        {items.length > 0 && (
          <ol className="mt-4 divide-y divide-line">
            {items.map(({ file, preview }, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-3 py-2">
                <span className="w-5 text-sm text-muted tabular-nums">{index + 1}</span>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview of a file that is not uploaded yet
                  <img src={preview} alt="" className="size-12 shrink-0 rounded-md border border-line object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-md border border-line text-xs font-semibold text-muted">PDF</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm" dir="auto">{file.name}</span>
                  <span className="block text-xs text-muted tabular-nums" dir="ltr">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </span>
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm text-danger underline-offset-4 hover:underline"
                  disabled={busy}
                  onClick={() => remove(index)}
                >
                  הסרה
                </button>
              </li>
            ))}
          </ol>
        )}

        <p aria-live="polite" role="alert" className="mt-3 text-sm text-danger empty:hidden">
          {error}
        </p>
      </section>

      {warehouses.length > 1 && (
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
      )}

      <section className={`card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${ready ? "ring-2 ring-accent/40" : ""}`}>
        <div>
          <p className="text-xs font-semibold text-muted">השלב הבא</p>
          <p className="mt-0.5 font-semibold">קריאת המסמך</p>
          <p className="mt-1 text-sm text-muted">
            {ready
              ? "שום דבר לא נכנס למלאי בלי אישור שלכם."
              : warehouseId
                ? "כדי להמשיך, הוסיפו לפחות עמוד אחד של המסמך."
                : "כדי להמשיך צריך מחסן. מוסיפים מחסן בהגדרות."}
          </p>
        </div>
        <button type="button" className="btn btn-lg max-sm:w-full" disabled={busy || preparing || !ready} onClick={submit}>
          {busy ? progress : "המשך לקריאת המסמך ←"}
        </button>
      </section>
    </div>
  );
}
