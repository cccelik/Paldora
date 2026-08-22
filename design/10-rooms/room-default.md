# Default Room — Cream Paper

## Purpose

Present a personal profile as a warm living scrapbook while keeping trusted social actions and privacy state obvious.

## Route

`/rooms/:username`

## Required data

Profile, relationship and block state, Room theme configuration, banner/avatar media, current status, music reference, Top Friends, gallery, Life Updates, posts, collections, memory highlights.

## Layout

Trusted shell surrounds a customizable Room canvas. The default Cream Paper Room uses an editorial banner, profile identity card, two-column desktop grid, Today/currently strip, Top Friends, photo fragments, and chronological tabs. Decorative tape and handwriting never carry required information.

## Interactions

Friend/relationship action, message where allowed later, tabs, media viewer, music integration link, and owner-only Customize Room action.

## States

Private Room shows a clear lock state and relationship action without leaking widgets. Blocked state reveals no profile content. Loading uses the theme-neutral shell. Missing custom assets fall back gracefully.

## Accessibility and responsive behavior

Theme variables cannot alter trusted controls. The Room must maintain AA text contrast. On mobile the profile identity leads, widgets become ordered sections, and owner actions move to an overflow sheet.
