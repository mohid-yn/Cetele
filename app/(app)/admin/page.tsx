"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Card, Stat } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { isoDate } from "@/lib/mock/data";
import { ShieldIcon } from "@/components/demo/icons";

export default function AdminPage() {
  const router = useRouter();
  const { state, actions } = useMock();
  const isAdmin = state.session.viewRole === "admin";
  const today = isoDate(0);

  if (!isAdmin) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-muted-foreground">
            Switch to <strong>App admin</strong> in Demo Controls to open the
            console.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => router.push("/today")}
          >
            Back to today
          </Button>
        </div>
      </div>
    );
  }

  const totalMembers = state.memberships.length;
  const countsToday = state.logs
    .filter((l) => l.date === today)
    .reduce((s, l) => s + l.count, 0);

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      <header className="flex items-center gap-2">
        <div className="grid size-9 place-items-center rounded-full bg-accent-100 text-accent-700">
          <ShieldIcon className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Admin console
          </h1>
          <p className="text-sm text-muted-foreground">App-level management</p>
        </div>
      </header>

      <Card className="grid grid-cols-3 gap-2 p-4">
        <Stat label="Groups" value={state.groups.length} />
        <Stat label="Members" value={totalMembers} />
        <Stat label="Counts·today" value={countsToday.toLocaleString()} />
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          All groups
        </h2>
        <ul className="flex flex-col gap-2">
          {state.groups.map((g) => {
            const members = sel.groupMembers(state, g.id);
            const admins = members.filter((m) => m.role === "group_admin");
            const isActive = g.id === state.session.activeGroupId;
            return (
              <li key={g.id}>
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-foreground">
                        {g.name}
                        {isActive && (
                          <Badge variant="success" size="sm">
                            active
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {members.length} members · code{" "}
                        <span className="font-mono">{g.inviteCode}</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        actions.setActiveGroup(g.id);
                        router.push("/group");
                      }}
                    >
                      Open
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Group admins:
                    </span>
                    {admins.map((a) => (
                      <span key={a.userId} className="flex items-center gap-1">
                        <Avatar
                          name={a.user.name}
                          size="sm"
                          className="size-6 text-[0.625rem]"
                        />
                        <span className="text-xs text-foreground">
                          {a.user.name}
                        </span>
                      </span>
                    ))}
                    {admins.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        none
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          All members
        </h2>
        <Card className="divide-y divide-border">
          {state.users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={u.name} size="sm" />
              <span className="flex-1 text-sm text-foreground">{u.name}</span>
              {u.isAdmin && (
                <Badge variant="accent" size="sm">
                  app admin
                </Badge>
              )}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
