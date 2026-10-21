import styles from '@/(signed-in)/life-updates/new/page.module.css';
import {
  LifeUpdateComposer,
  type AudienceBox,
} from '@/components/life-updates/life-update-composer';
import { BackLink, PageHeader } from '@/components/ui';
import { optionalUuid } from '@/lib/server/route-params';
import { apiClient, completedUser } from '@/lib/server/session';
import { type PaldoraApiClient } from '@paldora/api-client';
import { type BoxView } from '@paldora/validation';
export const metadata = { title: 'New Life Update' };

const PAGE_SIZE = 50;
const MAX_PAGES = 4;

/** The viewer's Boxes, at most four pages of 50, one page after another. */
async function boxesFor(
  api: PaldoraApiClient,
  cursor?: string,
  pagesLeft = MAX_PAGES,
): Promise<{ boxes: BoxView[]; truncated: boolean }> {
  const page = await api.boxes({ limit: PAGE_SIZE, cursor });
  if (!page.nextCursor) return { boxes: [...page.items], truncated: false };
  if (pagesLeft <= 1) return { boxes: [...page.items], truncated: true };
  const rest = await boxesFor(api, page.nextCursor, pagesLeft - 1);
  return { boxes: [...page.items, ...rest.boxes], truncated: rest.truncated };
}

const byName = (a: AudienceBox, b: AudienceBox) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
  a.id.localeCompare(b.id);

export default async function NewLifeUpdatePage({
  searchParams,
}: PageProps<'/life-updates/new'>) {
  await completedUser();
  const box = optionalUuid((await searchParams).box);
  const { boxes, truncated } = await boxesFor(await apiClient());
  const audience = boxes
    .map((item) => ({
      id: item.id,
      name: item.name,
      archived: item.status === 'archived',
    }))
    .sort(byName);
  return (
    <div className={styles.stack}>
      <BackLink href="/life-updates">Your Life Updates</BackLink>
      <PageHeader
        title="New Life Update"
        description="A catch-up on what’s been going on. Every section is optional."
      />
      <LifeUpdateComposer
        boxes={audience}
        preselectedBoxId={box}
        truncated={truncated}
      />
    </div>
  );
}
