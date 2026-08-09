"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/** Matches the bucket's own `allowed_mime_types` (0031). */
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
/** Matches the bucket's `file_size_limit` — 2 MB. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Upload a cover for a roadmap item (0031, amends D57).
 *
 * DIRECT TO STORAGE FROM THE BROWSER, not through a Server Action. A Server
 * Action would have to receive the whole file as form data, buffer it in the
 * function, and forward it — paying for the bytes twice and putting a 2 MB
 * upload inside a request whose timeout is tuned for database calls. The
 * storage client posts it straight to the bucket with the ORGANISER'S OWN
 * session, which is also what makes the policy the real gate: the insert is
 * refused by `roadmap_covers_insert` for anyone who is not an organiser, not by
 * a check in front of it.
 *
 * THE CHECKS HERE ARE COURTESY, and the bucket repeats every one of them. Type
 * and size are validated before the request only so a mistake costs no upload
 * and reads as a sentence rather than as a 400.
 *
 * The path is keyed on the ITEM, so re-uploading replaces the same object
 * rather than accumulating one file per attempt — with `upsert`, a cover that
 * is wrong three times leaves one file behind instead of three. A cache-busting
 * query string comes back with the URL because the object name did not change
 * and the CDN would otherwise keep serving the old picture.
 */
export function CoverUpload({
  itemId,
  onUploaded,
  disabled,
}: {
  itemId: string;
  /** Hands the public URL back to the form field that owns the value. */
  onUploaded: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Pictures must be PNG, JPEG or WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        "That picture is over 2 MB — a cover renders small, so a smaller file is plenty.",
      );
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `items/${itemId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("roadmap")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        // The policy's refusal reads as a storage error here. Say what it means
        // rather than passing through "new row violates row-level security".
        setError(
          /row-level security|Unauthorized/i.test(uploadError.message)
            ? "Only organisers can upload a picture."
            : uploadError.message,
        );
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("roadmap").getPublicUrl(path);
      onUploaded(`${publicUrl}?v=${Date.now()}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That didn't upload — try again.",
      );
    } finally {
      setBusy(false);
      // Clear the input so choosing the SAME file again still fires `change`.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={busy || disabled}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading…" : "Upload a picture"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
