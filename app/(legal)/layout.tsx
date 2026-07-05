import Link from "next/link";
import { WebAppLogo } from "@/components/ui/logo";

/**
 * Standalone shell for the public legal pages (/privacy, /terms) — no app
 * frame, no auth. Provides the header, a readable column, shared typographic
 * styling for the article content, and a footer. Pages supply raw semantic
 * HTML (h1/h2/p/ul); the [&_…] child selectors style it from here.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Cetele — home">
            <WebAppLogo className="h-7 w-auto" />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to Cetele
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <article className="text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_h1]:mb-1 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Cetele</span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
