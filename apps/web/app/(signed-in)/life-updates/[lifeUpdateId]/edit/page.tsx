import formStyles from '@/(signed-in)/life-updates/[lifeUpdateId]/edit/page-layout.module.css';
import styles from '@/(signed-in)/life-updates/[lifeUpdateId]/edit/page.module.css';
import { LifeUpdateEditor } from '@/components/life-updates/life-update-editor';
import { BackLink, Badge, PageHeader } from '@/components/ui';
import { lifeUpdateHref } from '@/lib/life-updates/life-update-form';
import {
  LIFE_UPDATE_ABSENT,
  optionalUuid,
  uuidParam,
} from '@/lib/server/route-params';
import { apiClient, completedUser, orNotFound } from '@/lib/server/session';
import { type Route } from 'next';
import { notFound } from 'next/navigation';
export const metadata = { title: 'Edit Life Update' };

/**
 * The author's editor. Someone else gets the not-found page, as for any
 * Life Update they cannot change. Where it went is shown, never editable.
 */
export default async function EditLifeUpdatePage({
  params,
  searchParams,
}: PageProps<'/life-updates/[lifeUpdateId]/edit'>) {
  const me = await completedUser();
  const id = uuidParam((await params).lifeUpdateId);
  const lifeUpdate = await orNotFound(
    (await apiClient()).lifeUpdate(id),
    LIFE_UPDATE_ABSENT,
  );
  if (lifeUpdate.author.id !== me.user.id) notFound();
  const box = optionalUuid((await searchParams).box)?.toLowerCase();
  const returnBoxId = lifeUpdate.contexts.find(
    (context) => box !== undefined && context.box.id === box,
  )?.box.id;
  const back = lifeUpdateHref(lifeUpdate.id, { boxId: returnBoxId });
  return (
    <div className={styles.stack}>
      <BackLink href={back as Route}>Back to the Life Update</BackLink>
      <PageHeader title="Edit Life Update" />
      <section className={formStyles.audience} aria-labelledby="audience-title">
        <h2 id="audience-title" className={formStyles.subLegend}>
          Who it’s for
        </h2>
        {lifeUpdate.audience === 'only_me' ? (
          <p>Only you.</p>
        ) : (
          <ul className={formStyles.audienceList} aria-label="Shared to">
            {lifeUpdate.contexts.map((context) => (
              <li key={context.box.id}>
                <Badge>{context.box.name}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className={formStyles.hint}>
          Where a Life Update goes can’t be changed after it’s shared. Edits
          show everywhere it went
          {lifeUpdate.audience === 'boxes'
            ? ', including Boxes you’ve since left, which aren’t listed.'
            : '.'}
        </p>
      </section>
      {lifeUpdate.canEdit ? (
        <LifeUpdateEditor lifeUpdate={lifeUpdate} returnBoxId={returnBoxId} />
      ) : (
        <p>
          Every Box this was shared to is archived, so it can’t be edited now.
          You can still delete it from its page.
        </p>
      )}
    </div>
  );
}
