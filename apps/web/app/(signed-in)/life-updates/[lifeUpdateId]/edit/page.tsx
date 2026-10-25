import formStyles from '@/(signed-in)/life-updates/[lifeUpdateId]/edit/page-layout.module.css';
import styles from '@/(signed-in)/life-updates/[lifeUpdateId]/edit/page.module.css';

import { FirebaseLifeUpdateEditor } from '@/components/life-updates/firebase-life-update-editor';
import { BackLink, Badge, PageHeader } from '@/components/ui';
import { lifeUpdateHref } from '@/lib/life-updates/life-update-form';
import {
  LIFE_UPDATE_ABSENT,
  optionalUuid,
  uuidParam,
} from '@/lib/server/route-params';
import { completedUser, orNotFound } from '@/lib/server/session';

import { firebaseWebData } from '@/lib/server/firebase/data';
import { type Route } from 'next';
import { notFound } from 'next/navigation';
export const metadata = { title: 'Edit Life Update' };

async function firebaseEditPage(id: string, box: string | undefined) {
  const update = await orNotFound(
    (await firebaseWebData()).lifeUpdate(id),
    LIFE_UPDATE_ABSENT,
  );
  if (!update.isOwner) notFound();
  const returnBoxId = update.contexts.find(
    (context) => context.boxId === box,
  )?.boxId;
  const back = lifeUpdateHref(id, { boxId: returnBoxId });
  return (
    <div className={styles.stack}>
      <BackLink href={back as Route}>Back to the Life Update</BackLink>
      <PageHeader title="Edit Life Update" />
      <section className={formStyles.audience} aria-labelledby="audience-title">
        <h2 id="audience-title" className={formStyles.subLegend}>
          Who it’s for
        </h2>
        {update.audience === 'only_me' ? (
          <p>Only you.</p>
        ) : (
          <ul className={formStyles.audienceList} aria-label="Shared to">
            {update.contexts.map((context) => (
              <li key={context.boxId}>
                <Badge>{context.boxName}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className={formStyles.hint}>
          Where a Life Update goes can’t be changed after it’s shared.
        </p>
      </section>
      {update.canEdit ? (
        <FirebaseLifeUpdateEditor update={update} returnBoxId={returnBoxId} />
      ) : (
        <p>
          Every Box this was shared to is archived, so it can’t be edited now.
          You can still delete it from its page.
        </p>
      )}
    </div>
  );
}

/**
 * The author's editor. Someone else gets the not-found page, as for any
 * Life Update they cannot change. Where it went is shown, never editable.
 */
export default async function EditLifeUpdatePage({
  params,
  searchParams,
}: PageProps<'/life-updates/[lifeUpdateId]/edit'>) {
  await completedUser();
  const id = uuidParam((await params).lifeUpdateId);
  return firebaseEditPage(
    id,
    optionalUuid((await searchParams).box)?.toLowerCase(),
  );
}
