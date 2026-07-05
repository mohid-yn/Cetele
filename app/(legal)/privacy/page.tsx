import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Cetele",
  description: "How Cetele collects, uses, and protects your data.",
};

const SUPPORT_EMAIL = "muhammad.khanzada@sirius.vic.edu.au";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="!mt-1 text-xs text-muted-foreground">
        Last updated: 5 July 2026
      </p>

      <p>
        Cetele (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the app&rdquo;) is a
        group dhikr tracker. This policy explains what we collect, why, and the
        choices you have. Cetele is built to be private by default — we
        don&rsquo;t run ads and we don&rsquo;t sell your data.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details from Google sign-in:</strong> your name, email
          address, and profile picture.
        </li>
        <li>
          <strong>Content you create:</strong> the tasks and counts you log, the
          groups you create or join, your streaks, reminders, and timezone.
        </li>
        <li>
          <strong>Basic technical data</strong> needed to run the service, such
          as the session cookies that keep you signed in.
        </li>
      </ul>
      <p>
        We do not collect your contacts or location, and we do not use
        third-party advertising or tracking.
      </p>

      <h2>How we use your data</h2>
      <ul>
        <li>
          To provide the service — your progress, your group&rsquo;s shared
          tally, streaks, and reminders.
        </li>
        <li>To keep your account secure and signed in.</li>
        <li>
          The counts you log are visible to members of the groups you belong to.
          That shared visibility is the point of a group cetele.
        </li>
      </ul>

      <h2>Where your data is stored</h2>
      <p>We rely on these infrastructure providers to run Cetele:</p>
      <ul>
        <li>
          <strong>Supabase</strong> — database and authentication.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting.
        </li>
        <li>
          <strong>Google</strong> — sign-in only.
        </li>
      </ul>
      <p>
        Your data may be processed in the regions these providers operate in.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Raw daily counts are kept for about 14 days.</li>
        <li>
          Aggregated daily completion is kept for about 90 days to power streaks
          and consistency views.
        </li>
        <li>
          Your account and group data are kept until you delete them or ask us
          to.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>You can view and correct your own logged counts in the app.</li>
        <li>You can leave a group at any time.</li>
        <li>
          You can request access to, or deletion of, your account and data by
          emailing us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          .
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Cetele is not directed at children under 13, and we do not knowingly
        collect their personal data.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time; when we do, we&rsquo;ll
        update the &ldquo;last updated&rdquo; date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about your privacy? Email us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </>
  );
}
