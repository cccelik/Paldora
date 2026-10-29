import { LegalPage, LegalSection } from '@/components/legal/legal-page';
import Link from 'next/link';
export const metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <LegalPage
      draft
      title="Terms"
      summary="The ground rules for using Paldora during private testing."
    >
      <LegalSection id="access" title="Access">
        <p>
          Paldora is in private testing. Accounts are created by invitation and
          public registration is closed. You are responsible for keeping your
          sign-in details to yourself.
        </p>
      </LegalSection>

      <LegalSection id="content" title="Your content">
        <p>
          You decide who sees what you post. Paldora stores your content and
          shows it only to the audience you chose, and you can edit or delete
          your own posts and comments, export your data, or delete your account.
          Formal wording on ownership and permissions is part of the pending
          review.
        </p>
      </LegalSection>

      <LegalSection id="conduct" title="How to behave">
        <p>
          Use Paldora for real friendships and private communities, and follow
          the <Link href="/guidelines">community guidelines</Link>. Do not
          attempt to access other people&rsquo;s data, bypass Paldora&rsquo;s
          protections, or abuse the service.
        </p>
      </LegalSection>

      <LegalSection id="moderation" title="Moderation">
        <p>
          Moderators can hide content that breaks the guidelines and suspend
          accounts. If your content is hidden, you are notified in Settings
          under Content notices, and you can ask for a review through{' '}
          <Link href="/contact">Contact and appeals</Link>.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes and availability">
        <p>
          Features may change while Paldora is in testing, and the service may
          be interrupted. If these terms change materially, this page will show
          a new last-updated date.
        </p>
      </LegalSection>

      <LegalSection id="open-questions" title="Not yet defined">
        <p>
          Warranty and liability wording, governing law, the operator&rsquo;s
          legal identity and age requirements have not been decided and are not
          stated here. They will be added after owner and legal review.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
