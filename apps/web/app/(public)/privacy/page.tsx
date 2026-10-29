import { LegalPage, LegalSection } from '@/components/legal/legal-page';
import Link from 'next/link';
export const metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <LegalPage
      draft
      title="Privacy"
      summary="What Paldora collects, where it lives, who can see it, and how you can take it with you or delete it."
    >
      <LegalSection id="principles" title="How Paldora treats your data">
        <ul>
          <li>
            Paldora is private and invite-only. Accounts are created by
            invitation, and there are no public profiles or public posts.
          </li>
          <li>
            What you share is visible only to the people and Boxes you chose.
          </li>
          <li>
            There are no ads, no targeted advertising and no third-party
            analytics or tracking scripts on the site.
          </li>
          <li>
            Feeds are chronological. Nothing is ranked to keep you scrolling.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="collected" title="What is collected">
        <ul>
          <li>
            Account details: your email address and sign-in credentials. Your
            password is handled by Firebase Authentication.
          </li>
          <li>
            Profile details: username, display name, bio and profile photo.
          </li>
          <li>
            What you post: posts, comments, reactions (including camera
            reactions), Life Updates, photos, and your Room customization.
          </li>
          <li>
            Relationships and settings: friends, Box memberships, blocks,
            notifications, appearance and reaction preferences.
          </li>
          <li>Reports you submit about people, Boxes, posts or comments.</li>
          <li>
            Operational logs. They are designed to record request identifiers
            and errors, not the text of your posts, passwords, session tokens or
            photos.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies">
        <p>
          Paldora sets only what it needs to work: a session cookie that keeps
          you signed in (a seven-day, HttpOnly session), and an appearance
          cookie that remembers light, dark or system theme. There are no
          advertising or analytics cookies.
        </p>
      </LegalSection>

      <LegalSection id="where" title="Where data is stored">
        <p>
          Paldora runs on Google Firebase: Authentication, Firestore, Cloud
          Storage, Cloud Functions and App Hosting. The data services are
          configured for the europe-west4 region. Google acts as the
          infrastructure provider and its own terms apply to that
          infrastructure.
        </p>
        <p>
          Photos and other media are stored privately. They are not reachable by
          a public link: each request is checked against your session and your
          access to that content before anything is served.
        </p>
      </LegalSection>

      <LegalSection id="who" title="Who can see what">
        <ul>
          <li>
            Other members see your content only where you shared it, and not if
            a block applies in either direction.
          </li>
          <li>
            Moderators can see reported content and the details of a report in
            order to review it. Their actions are recorded in an audit log.
          </li>
          <li>
            Paldora does not sell your data and does not share it with
            advertisers.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="export" title="Export your data">
        <p>
          In Settings, under Account, you can request an export. It is a JSON
          archive (paldora-json-v1) of your account, profile and preferences,
          posts, comments and reactions, Life Updates, Room settings, and
          metadata about your media. It does not contain the photo files
          themselves. The archive is private, downloadable only by you, and
          expires seven days after it is ready.
        </p>
      </LegalSection>

      <LegalSection id="deletion" title="Delete your account">
        <p>
          In Settings, under Account, you can request deletion. You must confirm
          with your password and first transfer any Box you own. Your request
          starts a seven-day grace period, and you can cancel it with your
          password at any point before the deadline.
        </p>
        <p>
          When the deadline passes, your account is locked immediately and
          deletion proceeds in steps: your media and exports, your posts,
          comments, reactions and Life Updates, your relationships and
          notifications, and finally your sign-in account and profile. If a step
          fails it is retried until it completes.
        </p>
        <p>
          Reports are handled separately. If you filed a report, your identity
          and its details are erased from retained moderation cases. Evidence of
          a closed moderation case is removed 90 days after the case closes.
          Records of what staff did, such as account lookups, are kept as an
          audit trail.
        </p>
      </LegalSection>

      <LegalSection id="open-questions" title="Not yet defined">
        <p>
          Backup and restore arrangements, log retention periods and the wording
          of data rights under particular laws are still being worked out and
          are not described here. This page will be updated when they are
          decided and reviewed.
        </p>
        <p>
          Questions about your data: see{' '}
          <Link href="/contact">Contact and appeals</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
