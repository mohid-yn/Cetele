"use client";

import * as React from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { PencilIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import { setRoadmapItemContent } from "./actions";
import { CoverUpload } from "./cover-upload";

export type EditableItem = {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
  imageUrl: string | null;
};

/**
 * The organiser's editor for ONE item (D57).
 *
 * WHY ONLY THREE FIELDS. `level`, `category`, `title`, `unit`, `target` and
 * `compulsory` are absent on purpose and the RPC refuses them regardless:
 * together they decide what FINISHING means, and changing them re-judges
 * progress members have already earned against a rule that moved afterwards.
 * The three here are presentation and destination — nothing in them can change
 * whether anyone has completed anything.
 *
 * The link is the reason this screen exists at all. The booklet ships
 * placeholder URLs (`www.youtube.com/playlist1`), so every item began with none,
 * and before this the only way to enter a real one was a migration and a deploy.
 *
 * BLANK MEANS CLEAR, not "leave alone". The form always submits all three, so a
 * partial-update convention would make removing a wrong URL impossible to
 * express — the single most likely thing anyone will want to do here.
 */
export function ItemEditor({ item }: { item: EditableItem }) {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState(item.url ?? "");
  const [description, setDescription] = React.useState(item.description ?? "");
  const [imageUrl, setImageUrl] = React.useState(item.imageUrl ?? "");
  const act = useAction();

  // Re-seed from the server whenever the dialog is opened, so a form left
  // half-edited and dismissed does not reopen holding stale text — and so a
  // second organiser's change is picked up rather than silently overwritten.
  const openEditor = () => {
    setUrl(item.url ?? "");
    setDescription(item.description ?? "");
    setImageUrl(item.imageUrl ?? "");
    setOpen(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openEditor}
        aria-label={`Edit ${item.title}`}
      >
        <PencilIcon aria-hidden className="size-4" />
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit item"
        description={item.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={act.pending}
              onClick={() =>
                void act.run(
                  () =>
                    setRoadmapItemContent(item.id, url, description, imageUrl),
                  () => setOpen(false),
                )
              }
            >
              {act.pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Link"
            htmlFor={`url-${item.id}`}
            hint="Where the member goes to do this. Leave blank for no link."
          >
            <Input
              id={`url-${item.id}`}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://youtube.com/playlist?list=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>

          <Field
            label="Description"
            htmlFor={`desc-${item.id}`}
            hint="What it is, in a sentence or two."
          >
            {/* A textarea, not an Input: these run to a full paragraph and a
                single-line box makes reviewing one impossible. Styled off the
                same tokens as Input rather than forking the primitive. */}
            <textarea
              id={`desc-${item.id}`}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </Field>

          <Field
            label="Picture"
            htmlFor={`img-${item.id}`}
            hint="Upload one, or paste a link / a path like /roadmap/cover.png. Blank shows the category's icon."
          >
            <Input
              id={`img-${item.id}`}
              autoComplete="off"
              placeholder="/roadmap/cover.png"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </Field>

          {/* THE UPLOAD (0031). Until now a cover had to already exist
              somewhere — in the repo, behind a deploy, or on a host the
              organiser happened to control — which made the picture the one
              part of an item they could not actually provide. The file goes to
              the `roadmap` bucket and its public URL lands in the field above,
              so paste and upload end in exactly the same place and the field
              stays the single source of what will be rendered. */}
          <CoverUpload
            itemId={item.id}
            onUploaded={setImageUrl}
            disabled={act.pending}
          />

          {/* Shown as it will appear, because a pasted URL that 404s is
              otherwise indistinguishable from one that works until a member
              opens the roadmap. `onError` hides it rather than leaving a broken
              image, which is the same rule the card itself follows. */}
          {imageUrl.trim() !== "" && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- previewing an arbitrary pasted URL is the whole point of this element */}
              <img
                src={imageUrl}
                alt=""
                className="h-20 w-14 rounded-md border border-border object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = "";
                }}
              />
              <p className="text-xs text-muted-foreground">
                Preview. Nothing here means the picture could not be loaded.
              </p>
            </div>
          )}

          {act.error && (
            <p role="alert" className="text-xs text-danger">
              {act.error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
