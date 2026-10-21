import styles from '@/(signed-in)/moderation/cases/[caseId]/page.module.css';
import { CaseActionForm } from '@/components/moderation/case-action-form';
import { BackLink, PageHeader, Section } from '@/components/ui';
import { uuidParam } from '@/lib/server/route-params';
import { apiClient, completedUser, orNotFound } from '@/lib/server/session';
import { randomUUID } from 'node:crypto';

export const metadata = { title: 'Moderation case' };

export default async function ModerationCasePage({
  params,
}: PageProps<'/moderation/cases/[caseId]'>) {
  await completedUser();
  const caseId = uuidParam((await params).caseId);
  const report = await orNotFound((await apiClient()).moderationCase(caseId), [
    'MODERATION_FORBIDDEN',
    'REPORT_NOT_FOUND',
  ]);
  return (
    <div className={styles.page}>
      <BackLink href="/moderation">Moderation queue</BackLink>
      <PageHeader
        title={`${report.targetKind === 'user' ? 'Person' : report.targetKind} report`}
        description={`Case ${report.id}`}
      />
      <Section id="evidence" title="Report">
        <dl className={styles.details}>
          <div>
            <dt>Status</dt>
            <dd>{report.status}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{report.category}</dd>
          </div>
          <div>
            <dt>Target ID</dt>
            <dd>{report.targetId}</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>
              <time dateTime={report.createdAt}>
                {new Date(report.createdAt).toLocaleString()}
              </time>
            </dd>
          </div>
          {report.closedAt ? (
            <div>
              <dt>Closed</dt>
              <dd>
                <time dateTime={report.closedAt}>
                  {new Date(report.closedAt).toLocaleString()}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
        {report.detail ? (
          <p className={styles.detail}>{report.detail}</p>
        ) : (
          <p>No additional details supplied.</p>
        )}
      </Section>
      <Section id="action" title="Action">
        <CaseActionForm
          caseId={report.id}
          targetKind={report.targetKind}
          status={report.status}
          idempotencyKey={randomUUID()}
        />
      </Section>
    </div>
  );
}
