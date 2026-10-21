import {
  draftProblem,
  lifeUpdateHref,
  nextTabIndex,
  sectionsTotal,
} from '@/lib/life-updates/life-update-form';
import { describe, expect, it } from 'vitest';
const ID = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';
const BOX = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const COMMENT = '3b9f0f2a-1c4d-4e5f-8a6b-7c8d9e0f1a2b';

describe('sectionsTotal', () => {
  it('counts trimmed text across sections, as the server stores it', () => {
    expect(sectionsTotal({})).toBe(0);
    expect(sectionsTotal({ travel: '  Lisbon  ', reading: 'Dune' })).toBe(10);
  });
});

describe('draftProblem', () => {
  const written = {
    drafts: { travel: 'Lisbon' },
    photoCount: 0,
    photosBusy: false,
  };

  it('accepts a written draft for Only me or for chosen Boxes', () => {
    expect(
      draftProblem({ ...written, audience: { type: 'only_me', boxCount: 0 } }),
    ).toBeNull();
    expect(
      draftProblem({ ...written, audience: { type: 'boxes', boxCount: 20 } }),
    ).toBeNull();
    expect(draftProblem(written)).toBeNull();
  });

  it('accepts photos alone', () => {
    expect(
      draftProblem({
        drafts: { travel: '   ' },
        photoCount: 1,
        photosBusy: false,
      }),
    ).toBeNull();
  });

  it('explains each reason it cannot be sent yet', () => {
    expect(
      draftProblem({ drafts: {}, photoCount: 0, photosBusy: false }),
    ).toMatch(/at least one section/);
    expect(draftProblem({ ...written, photosBusy: true })).toMatch(/photos/);
    expect(
      draftProblem({ ...written, audience: { type: 'boxes', boxCount: 0 } }),
    ).toMatch(/at least one Box/);
    expect(
      draftProblem({ ...written, audience: { type: 'boxes', boxCount: 21 } }),
    ).toMatch(/20 Boxes/);
    const long = 'x'.repeat(2_000);
    const drafts = {
      lifeLately: long,
      travel: long,
      reading: long,
      watching: long,
      whatsNext: long,
    };
    expect(
      draftProblem({ drafts, photoCount: 0, photosBusy: false }),
    ).toBeNull();
    expect(
      draftProblem({
        drafts: { ...drafts, listeningTo: 'x' },
        photoCount: 0,
        photosBusy: false,
      }),
    ).toMatch(/10,000/);
  });
});

describe('nextTabIndex', () => {
  it('wraps with the arrows and jumps with Home and End', () => {
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
    expect(nextTabIndex('Enter', 0, 3)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('lifeUpdateHref', () => {
  it('opens the right Box and pins a linked comment', () => {
    expect(lifeUpdateHref(ID)).toBe(`/life-updates/${ID}`);
    expect(lifeUpdateHref(ID, { boxId: BOX })).toBe(
      `/life-updates/${ID}?box=${BOX}`,
    );
    expect(lifeUpdateHref(ID, { boxId: BOX, commentId: COMMENT })).toBe(
      `/life-updates/${ID}?box=${BOX}&comment=${COMMENT}#comment-${COMMENT}`,
    );
    expect(lifeUpdateHref(ID, { boxId: BOX, commentsCursor: 'a b' })).toBe(
      `/life-updates/${ID}?box=${BOX}&comments=a+b#comments`,
    );
  });
});
