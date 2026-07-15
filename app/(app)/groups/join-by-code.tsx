"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

/**
 * Join a circle from an invite the user was given (D34/D35 — per-invite codes).
 * Accepts either a full invite link (…/join/<code>) or a bare code, and hands
 * off to the real /join/<code> screen which validates + accepts it.
 */
export function JoinByCode() {
  const router = useRouter();
  const [value, setValue] = React.useState("");

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const code = v.includes("/join/")
      ? v.split("/join/")[1].split(/[/?#]/)[0]
      : v;
    if (code) router.push(`/join/${encodeURIComponent(code)}`);
  };

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Paste an invite link or code"
        aria-label="Invite link or code"
        className="flex-1"
      />
      <Button variant="outline" onClick={submit} disabled={!value.trim()}>
        Join
      </Button>
    </div>
  );
}
