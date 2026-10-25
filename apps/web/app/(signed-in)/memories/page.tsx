import { MemoryScopePage } from '@/components/memories/memory-scope-page';

import { FirebaseMemoryYearNav } from '@/components/memories/memory-navigation';

import { memoriesDescription } from '@/lib/life-updates/memories';
import { completedUser } from '@/lib/server/session';

export const metadata = { title: 'Memories' };

/** The years that hold something the viewer can still see. */
export default async function MemoriesPage() {
  await completedUser();
  return (
    <MemoryScopePage title="Memories" description={memoriesDescription}>
      {<FirebaseMemoryYearNav scope={{ kind: 'personal' }} />}
    </MemoryScopePage>
  );
}
