"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * The app-level admin console was retired with the move to Drive-style group
 * ownership (D26) — there is no global "see everything" surface any more.
 * `/admin` now just forwards to the Groups home (My groups / Shared with me).
 */
export default function AdminRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/groups");
  }, [router]);
  return null;
}
