import { describe, expect, it } from 'vitest';
import { bottomLinks, isCurrentSection, primaryNavigation } from './navigation';
describe('primaryNavigation', () => {
  it('lists every desktop destination, with My Room for the signed-in user', () => {
    expect(primaryNavigation('ada').map((entry) => entry.label)).toEqual([
      'Home',
      'Friends',
      'Boxes',
      'Life Updates',
      'Memories',
      'My Room',
      'Settings',
    ]);
    expect(
      primaryNavigation('ada').find((entry) => entry.label === 'My Room')?.href,
    ).toBe('/rooms/ada');
  });

  it('gives the bottom nav exactly five items in its own order', () => {
    expect(
      bottomLinks(primaryNavigation('ada')).map((entry) => entry.label),
    ).toEqual(['Home', 'Boxes', 'Life Updates', 'Friends', 'My Room']);
  });

  it('leaves My Room out until there is a username', () => {
    expect(
      primaryNavigation(null).some((entry) => entry.label === 'My Room'),
    ).toBe(false);
  });
});

describe('isCurrentSection', () => {
  const [home] = primaryNavigation('Ada');
  const room = primaryNavigation('Ada').find(
    (entry) => entry.label === 'My Room',
  );
  const settings = primaryNavigation('Ada').at(-1);

  it('marks the section and the pages under it', () => {
    expect(home && isCurrentSection('/home', home)).toBe(true);
    expect(settings && isCurrentSection('/settings/appearance', settings)).toBe(
      true,
    );
    expect(room && isCurrentSection('/rooms/ada/memories', room)).toBe(true);
  });

  it('does not mark lookalike paths or other people’s Rooms', () => {
    expect(home && isCurrentSection('/homepage', home)).toBe(false);
    expect(room && isCurrentSection('/rooms/adam', room)).toBe(false);
  });

  it('compares encoded and decoded usernames alike', () => {
    const [entry] = primaryNavigation('çelik').filter(
      (candidate) => candidate.label === 'My Room',
    );
    expect(entry && isCurrentSection('/rooms/%C3%A7elik', entry)).toBe(true);
    expect(entry && isCurrentSection('/rooms/Çelik', entry)).toBe(true);
  });
});
