import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeedbackMessage } from './feedback';
import { UsernameField } from './form-fields';
import { initials, PersonRow } from './identity';
import { Toast } from './toast';

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

  it('renders a reusable, dismissible status toast', () => {
    const markup = renderToStaticMarkup(
      createElement(Toast, {
        message: 'Post shared.',
        onDismiss: () => undefined,
      }),
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('toast-success');
    expect(markup).toContain('Post shared.');
    expect(markup).toContain('aria-label="Dismiss message"');
    expect(markup).toContain('toast-countdown-progress');
    expect(markup).toContain('--toast-duration:5000ms');
    expect(
      renderToStaticMarkup(
        createElement(Toast, {
          message: 'Check this.',
          tone: 'warning',
          onDismiss: () => undefined,
        }),
      ),
    ).toContain('toast-warning');
    expect(
      renderToStaticMarkup(
        createElement(Toast, {
          message: 'Failed.',
          tone: 'error',
          onDismiss: () => undefined,
        }),
      ),
    ).toContain('toast-error');
  });

  it('creates stable one- and two-character avatar fallbacks', () => {
    expect(initials('Alice Moreno')).toBe('A');
    expect(initials('Alice Moreno', 2)).toBe('AM');
    expect(initials('')).toBe('?');
  });

  it('passes current profile pictures through shared person rows', () => {
    const markup = renderToStaticMarkup(
      createElement(PersonRow, {
        name: 'Alice Moreno',
        username: 'alice',
        avatarUrl: 'https://images.example/alice.webp',
      }),
    );
    expect(markup).toContain('src="https://images.example/alice.webp"');
    expect(markup).not.toContain('>A</span>');
  });
});
