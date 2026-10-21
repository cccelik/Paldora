import { type ReactNode } from 'react';
import { PageHeader, Stack } from './ui';
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
