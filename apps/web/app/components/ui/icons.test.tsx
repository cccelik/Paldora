import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon, iconNames } from '@/components/ui/icons';

describe('Icon', () => {
  it.each(iconNames)('%s resolves to an svg', (name) => {
    const html = renderToStaticMarkup(<Icon name={name} />);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
  });

  it('is labelled when it carries a title', () => {
    const html = renderToStaticMarkup(<Icon name="lock" title="Private" />);
    expect(html).toContain('aria-label="Private"');
    expect(html).not.toContain('aria-hidden');
  });

  it('uses 1.6 stroke, 1.8 when active', () => {
    expect(renderToStaticMarkup(<Icon name="home" />)).toContain(
      'stroke-width="1.6"',
    );
    expect(renderToStaticMarkup(<Icon name="home" active />)).toContain(
      'stroke-width="1.8"',
    );
  });
});
