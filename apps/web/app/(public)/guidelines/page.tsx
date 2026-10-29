import { LegalPage, LegalSection } from '@/components/legal/legal-page';
import Link from 'next/link';
export const metadata = { title: 'Community guidelines' };

export default function GuidelinesPage() {
  return (
    <LegalPage
      title="Community guidelines"
      summary="Paldora is a box for your people. These guidelines keep it safe for them."
    >
      <LegalSection id="expect" title="What we ask of everyone">
        <ul>
          <li>Be kind to the people in your Boxes.</li>
          <li>
            Respect privacy. Do not share other people&rsquo;s private
            information or photos without their say.
          </li>
          <li>
            Do not harass, threaten or target anyone, and do not send spam.
          </li>
          <li>Do not post content that is illegal.</li>
          <li>Do not try to get around blocks or other protections.</li>
        </ul>
      </LegalSection>

      <LegalSection id="blocking" title="Blocking">
        <p>
          You can block a person. A block works in both directions: you stop
          seeing each other&rsquo;s content, including in shared Boxes, where a
          neutral placeholder is shown, and the block overrides friendship,
          invitations and interactions. The placeholder never reveals who
          blocked whom.
        </p>
      </LegalSection>

      <LegalSection id="reporting" title="Reporting">
        <p>
          You can report a person, a Box, a post or a comment, choosing
          harassment, spam, privacy or something else. Reporting does not remove
          anything by itself. Your report is private: the person you reported
          cannot see who reported them. You can follow the status of your
          reports in Settings under Your reports.
        </p>
      </LegalSection>

      <LegalSection id="review" title="How reports are reviewed">
        <p>
          Moderators review each report. To act, they must record a concrete
          reason, and every action is written to an audit log. They can hide a
          post or comment, restore it, or suspend an account. They can also
          reverse their decisions. Box owners and admins can remove members from
          their own Box.
        </p>
      </LegalSection>

      <LegalSection id="notices" title="If your content is hidden">
        <p>
          Hidden posts and comments appear in Settings under Content notices,
          with a reference ID and the date you shared them. The notice does not
          reveal who reported it. To ask for a second look, use{' '}
          <Link href="/contact">Contact and appeals</Link> and include the
          reference ID.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
