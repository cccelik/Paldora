import styles from '@/(signed-in)/boxes/page.module.css';
import { CreateBoxForm } from '@/components/boxes/box-forms';
import { BoxCardList, MyInvitationList } from '@/components/boxes/box-lists';
import { MoreLink } from '@/components/common/more-link';
import { PageHeader, Section } from '@/components/ui';
import { apiClient, completedUser, cursorParam } from '@/lib/server/session';
export const metadata = { title: 'Boxes' };

export default async function BoxesPage({ searchParams }: PageProps<'/boxes'>) {
  await completedUser();
  const cursor = cursorParam((await searchParams).boxes);
  const api = await apiClient();
  const [boxes, invitations] = await Promise.all([
    api.boxes({ limit: 25, cursor }),
    api.myBoxInvitations({ limit: 50 }),
  ]);
  return (
    <div className={styles.stack}>
      <PageHeader
        title="Boxes"
        description="Private circles for the people you share with. Only members can see a Box."
      />
      {invitations.items.length > 0 ? (
        <Section id="invitations" title="Invitations">
          <MyInvitationList items={invitations.items} />
        </Section>
      ) : null}
      <Section id="boxes" title="Your Boxes">
        <BoxCardList boxes={boxes.items} />
        {boxes.nextCursor ? (
          <MoreLink
            href={`/boxes?boxes=${encodeURIComponent(boxes.nextCursor)}`}
            label="Show more Boxes"
          />
        ) : null}
      </Section>
      <Section id="create" title="Create a Box">
        <CreateBoxForm />
      </Section>
    </div>
  );
}
