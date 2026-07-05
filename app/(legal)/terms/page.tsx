import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Cetele",
  description: "The terms for using Cetele.",
};

const SUPPORT_EMAIL = "muhammad.khanzada@sirius.vic.edu.au";

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="!mt-1 text-xs text-muted-foreground">
        Last updated: 5 July 2026
      </p>

      <p>
        By using Cetele (&ldquo;the app&rdquo;) you agree to these terms. Please
        read them.
      </p>

      <h2>The service</h2>
      <p>
        Cetele is a group dhikr and habit tracker provided free of charge. It
        lets you and your group log and track shared daily goals.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>
          You sign in with Google. You are responsible for keeping access to
          your account secure.
        </li>
        <li>
          You are responsible for the content you log and for how you run any
          groups you own or administer.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Please don&rsquo;t use Cetele to:</p>
      <ul>
        <li>harass, abuse, or harm other people;</li>
        <li>upload unlawful content;</li>
        <li>
          attempt to break, overload, or gain unauthorised access to the service
          or other users&rsquo; data.
        </li>
      </ul>

      <h2>Groups and content</h2>
      <ul>
        <li>
          Content you log is visible to members of the groups you belong to.
        </li>
        <li>
          Group owners and admins can manage tasks and members, and may log or
          correct counts on a member&rsquo;s behalf. Such actions are attributed
          and visible to that member.
        </li>
      </ul>

      <h2>Availability and disclaimer</h2>
      <p>
        The app is provided &ldquo;as is&rdquo;, without warranties of any kind.
        We may change, suspend, or discontinue features at any time. To the
        extent permitted by law, we are not liable for any loss arising from
        your use of the app.
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using Cetele and delete your account at any time. We may
        suspend or terminate accounts that violate these terms.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms; continued use of the app after a change means
        you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </>
  );
}
