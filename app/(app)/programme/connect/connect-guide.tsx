import { buttonVariants, Card } from "@/components/ui";
import { CopyField } from "@/components/app/copy-field";
import { ExternalLinkIcon } from "@/components/app/icons";

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground">
          {number}. {title}
        </h2>
        {children}
      </Card>
    </li>
  );
}

function Setting({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{name}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

/** How an organiser connects Claude. Holds no secret: both values are public. */
export function ConnectGuide({
  serverUrl,
  clientId,
}: {
  serverUrl: string;
  clientId: string;
}) {
  return (
    <>
      <p className="text-foreground">
        Connect Claude once, then ask it to build a roadmap. Everything it makes
        stays a draft until you publish it here.
      </p>

      <ol className="flex flex-col gap-3">
        <Step number={1} title="Open Claude's connectors">
          <p className="text-sm text-foreground">
            Use Claude in your browser, then choose{" "}
            <strong>Add custom connector</strong>. On a Team or Enterprise plan,
            an organisation owner adds it first, under Organization settings,
            and you only need step 3.
          </p>
          <a
            href="https://claude.ai/customize/connectors"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "tonal", size: "md" })}
          >
            Open connectors
            <ExternalLinkIcon aria-hidden className="size-4" />
          </a>
        </Step>

        <Step number={2} title="Fill in the connector">
          <CopyField label="Server URL" value={serverUrl} wrap />
          <CopyField label="OAuth client ID" value={clientId} wrap />
          <dl className="flex flex-col gap-2">
            <Setting name="Name" value="Cetele" />
            <Setting name="Authentication" value="Sign in now" />
            <Setting name="OAuth client" value="Use your own OAuth client" />
            <Setting name="Client secret" value="Leave blank" />
          </dl>
          <p className="text-sm text-muted-foreground">
            If you only see a name and a URL, the client ID is under Advanced
            settings.
          </p>
        </Step>

        <Step number={3} title="Connect and allow">
          <p className="text-sm text-foreground">
            Choose <strong>Connect</strong>. Cetele opens and shows which
            account you&apos;re using. It must be your organiser account. Check
            it, then choose <strong>Allow</strong>.
          </p>
        </Step>

        <Step number={4} title="Ask Claude to build">
          <p className="text-sm text-foreground">
            Start a new chat and describe the roadmap, or give Claude your
            source material. Then open the draft here to review and publish it.
          </p>
        </Step>
      </ol>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground">Before you publish</h2>
        <p className="text-sm text-foreground">
          AI can invent sources, quotes and links that look real. Check every
          title, source and link in a draft yourself. Your name appears on what
          Claude changes.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground">
          If something goes wrong
        </h2>
        <dl className="flex flex-col gap-2">
          <Setting
            name="Claude asks you to connect again"
            value="This is expected. Connections end after seven days, so choose Connect and Allow again."
          />
          <Setting
            name="“Account mismatch”"
            value="Claude is signed in to different accounts in your browser and its desktop app. Connect from the browser, or use the same account in both."
          />
          <Setting
            name="“Only organisers can connect”"
            value="You're signed in to another Cetele account. Choose Use a different account."
          />
        </dl>
      </section>
    </>
  );
}
