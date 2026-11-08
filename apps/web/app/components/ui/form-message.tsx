import { Banner, type BannerTone } from '@/components/ui/banner';
export type MessageTone = 'success' | 'attention' | 'failure';

const bannerTone: Record<MessageTone, BannerTone> = {
  success: 'success',
  attention: 'warning',
  failure: 'danger',
};

/**
 * Inline feedback for a form, drawn as a `Banner`. The live region always
 * exists, so screen readers announce messages that appear after submission.
 */
export function FormMessage({
  message,
  tone,
}: {
  message?: string | undefined;
  tone?: MessageTone | undefined;
}) {
  return (
    <div role={tone === 'failure' ? 'alert' : 'status'} aria-live="polite">
      {message ? (
        <Banner tone={bannerTone[tone ?? 'success']} title={message} />
      ) : null}
    </div>
  );
}
