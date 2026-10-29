import { LegalPage, LegalSection } from '@/components/legal/legal-page';
import { contactEmail } from '@/lib/server/environment';
import Link from 'next/link';
export const metadata = { title: 'Contact and appeals' };

export default function ContactPage() {
  const email = contactEmail();
  return (
    <LegalPage
      title="Contact and appeals"
      summary="How to report a problem, ask about your data, or appeal a moderation decision."
    >
      <LegalSection id="email" title="Email">
        {email ? (
          <p>
            Write to <a href={`mailto:${email}`}>{email}</a> for appeals and
            questions about your data or a moderation decision. No response time
            is promised yet.
          </p>
        ) : (
          <p>
            No contact address is configured for this installation, so none is
            shown. During private testing, contact the person who invited you.
          </p>
        )}
      </LegalSection>

      <LegalSection id="report" title="Report something">
        <p>
          To report a person, Box, post or comment, use the report option on it
          while signed in. See the{' '}
          <Link href="/guidelines">community guidelines</Link> for what happens
          next.
        </p>
      </LegalSection>

      <LegalSection id="appeal" title="Appeal a decision">
        <p>
          If your content was hidden, open Settings, then Content notices, and
          copy the reference ID. Include it when you get in touch so the
          decision can be found and reviewed.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
