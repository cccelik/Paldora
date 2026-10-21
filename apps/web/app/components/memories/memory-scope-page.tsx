import { PageHeader, Stack } from '@/components/ui';
import { type ReactNode } from 'react';
/** Shared page frame; each scope keeps its own authorization and absent codes. */
export function MemoryScopePage({
  title,
  description,
  back,
  children,
}: {
  title: string;
  description: string;
  back?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack>
      {back}
      <PageHeader title={title} description={description} />
      {children}
    </Stack>
  );
}
