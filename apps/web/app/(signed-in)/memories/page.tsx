import { MemoryScopePage } from '../../components/memory-scope-page';
import { MemoryYearNav } from '../../components/memory-timeline';
import { EmptyState } from '../../components/ui';
import { memoriesDescription } from '../../lib/memories';
import { apiClient, completedUser } from '../../lib/session';
export const metadata = { title: 'Memories' };

/** The years that hold something the viewer can still see. */
export default async function MemoriesPage() {
  await completedUser();
  const summary = await (await apiClient()).myMemorySummary();
  return (
    <MemoryScopePage title="Memories" description={memoriesDescription}>
      {summary.years.length === 0 ? (
        <EmptyState>
          No memories yet. Posts and Life Updates from your Boxes, and the ones
          you keep to yourself, collect here as time goes by.
        </EmptyState>
      ) : (
        <MemoryYearNav scope={{ kind: 'personal' }} years={summary.years} />
      )}
    </MemoryScopePage>
  );
}
