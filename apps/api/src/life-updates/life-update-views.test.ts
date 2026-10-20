import { describe, expect, it } from 'vitest';
import { isVisible, mayEdit } from './life-update-access.js';
import { sortContexts, toSections } from './life-update-views.js';

const box = (id: string, name: string) => ({ box: { id, name } });

describe('sortContexts', () => {
  it('orders by Box name ignoring case, then by Box ID', () => {
    const sorted = sortContexts([
      box('3', 'zebra'),
      box('2', 'Apple'),
      box('9', 'apple'),
      box('1', 'apple'),
      box('5', 'Mango'),
    ]);
    expect(sorted.map((context) => context.box.id)).toEqual([
      '1',
      '2',
      '9',
      '5',
      '3',
    ]);
  });
});

describe('toSections', () => {
  it('uses the canonical order and labels and skips unknown or empty keys', () => {
    expect(
      toSections({
        whatsNext: 'Rest',
        lifeLately: 'Busy',
        mood: 'x',
        travel: '',
      }),
    ).toEqual([
      { key: 'lifeLately', label: 'Life lately', content: 'Busy' },
      { key: 'whatsNext', label: 'What’s next', content: 'Rest' },
    ]);
  });
});

describe('Life Update visibility', () => {
  const author = 'author';
  const boxes = {
    status: 'active',
    audience: 'boxes',
    authorUserId: author,
  } as const;
  const onlyMe = { ...boxes, audience: 'only_me' } as const;

  it('needs a reachable Box for Box audiences, even for the author', () => {
    expect(isVisible(boxes, false, author, 0)).toBe(false);
    expect(isVisible(boxes, false, author, 1)).toBe(true);
    expect(isVisible(boxes, false, 'member', 2)).toBe(true);
  });

  it('shows Only Me to the author alone, and nothing deleted or blocked', () => {
    expect(isVisible(onlyMe, false, author, 0)).toBe(true);
    expect(isVisible(onlyMe, false, 'member', 0)).toBe(false);
    expect(isVisible(boxes, true, 'member', 1)).toBe(false);
    expect(isVisible({ ...boxes, status: 'deleted' }, false, author, 1)).toBe(
      false,
    );
  });

  it('lets the author edit while Only Me or one Box is open', () => {
    expect(mayEdit(onlyMe, author, [])).toBe(true);
    expect(mayEdit(boxes, author, [{ boxStatus: 'archived' }])).toBe(false);
    expect(
      mayEdit(boxes, author, [
        { boxStatus: 'archived' },
        { boxStatus: 'active' },
      ]),
    ).toBe(true);
    expect(mayEdit(boxes, 'member', [{ boxStatus: 'active' }])).toBe(false);
  });
});
