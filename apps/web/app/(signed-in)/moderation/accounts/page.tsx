import styles from '@/(signed-in)/moderation/accounts/page.module.css';
import { BackLink, PageHeader } from '@/components/ui';
import { completedUser } from '@/lib/server/session';
import { ApiClientError } from '@/lib/server/web-data-error';
import { uuidSchema } from '@paldora/validation';
import { notFound } from 'next/navigation';

import { firebaseWebData } from '@/lib/server/firebase/data';

export const metadata = { title: 'Account lookup' };

export default async function ModerationAccountLookupPage({
  searchParams,
}: PageProps<'/moderation/accounts'>) {
  await completedUser();
  const raw = (await searchParams).id;
  const parsed = typeof raw === 'string' ? uuidSchema.safeParse(raw) : null;
  let result: { id: string; username: string | null; status: string } | null =
    null;
  let absent = false;
  if (parsed?.success) {
    try {
      result = await (await firebaseWebData()).moderationAccount(parsed.data);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'MODERATION_FORBIDDEN') notFound();
        if (error.code === 'USER_NOT_FOUND') absent = true;
        else throw error;
      } else throw error;
    }
  }
  return (
    <div className={styles.page}>
      <BackLink href="/moderation">Moderation queue</BackLink>
      <PageHeader
        title="Account lookup"
        description="Administrators can look up an exact internal account ID. Every lookup, including a miss, is audited."
      />
      <form className={styles.form} method="get">
        <label htmlFor="account-id">Internal account ID</label>
        <input
          id="account-id"
          name="id"
          type="text"
          pattern="[0-9a-fA-F-]{36}"
          minLength={36}
          maxLength={36}
          defaultValue={typeof raw === 'string' ? raw : ''}
          autoComplete="off"
          required
        />
        <button type="submit">Look up account</button>
      </form>
      {raw && !parsed?.success ? <p>Enter a valid account ID.</p> : null}
      {absent ? <p>No account was found.</p> : null}
      {result ? (
        <dl className={styles.details}>
          <div>
            <dt>ID</dt>
            <dd>{result.id}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{result.username ?? 'None'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{result.status}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
