'use client';

import { OverflowMenu } from '@/components/ui';
/** The post card overflow menu as the gallery shows it (items do nothing). */
export function GalleryPostMenu() {
  const noop = () => undefined;
  return (
    <OverflowMenu
      label="Post options"
      items={[
        { key: 'edit', label: 'Edit post', onSelect: noop },
        {
          key: 'delete',
          label: 'Delete post',
          destructive: true,
          onSelect: noop,
        },
        { key: 'report', label: 'Report post', onSelect: noop },
      ]}
    />
  );
}
