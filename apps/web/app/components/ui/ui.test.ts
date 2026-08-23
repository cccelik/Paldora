import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeedbackMessage } from './feedback';
import { UsernameField } from './form-fields';
import { initials } from './identity';

describe('shared UI primitives', () => {
  it('keeps username constraints in the reusable field', () => {
    const markup = renderToStaticMarkup(
      createElement(UsernameField, {
        required: true,
        prefixed: true,
        help: 'Shared help',
      }),
    );
    expect(markup).toContain('name="username"');
    expect(markup).toContain('minLength="3"');
    expect(markup).toContain('maxLength="30"');
    expect(markup).toContain('pattern="[\\p{L}\\p{N}_]+"');
    expect(markup).toContain('Shared help');
  });

  it('uses accessible roles for feedback', () => {
    expect(
      renderToStaticMarkup(
        createElement(FeedbackMessage, { tone: 'error' }, 'Try again.'),
      ),
    ).toContain('role="alert"');
    expect(
      renderToStaticMarkup(
        createElement(FeedbackMessage, { tone: 'success' }, 'Saved.'),
      ),
    ).toContain('role="status"');
  });

  it('creates stable one- and two-character avatar fallbacks', () => {
    expect(initials('Alice Moreno')).toBe('A');
    expect(initials('Alice Moreno', 2)).toBe('AM');
    expect(initials('')).toBe('?');
  });
});
