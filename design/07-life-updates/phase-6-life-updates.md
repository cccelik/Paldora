# Phase 6 Life Updates — Developer Handoff

## Product model

A Life Update stores its structured story and up to four photos once. Publishing to Boxes creates one private delivery context per selected Box. The Home card appears once and exposes those contexts as alphabetically ordered tabs; comments and reactions belong to the selected tab only. `Only Me` is mutually exclusive with Box selection and never displays interaction controls.

## Responsive composition

- Desktop composer: maximum 820px reading width, nine optional section fields, audience panel first, then photos and primary publish action.
- Mobile composer: one column at 390px, 16px card padding, native 20px checkboxes, 48px Box rows, and no horizontal scrolling.
- Box selector: searchable, independently scrollable, 1–20 distinct active Boxes, persistent selection while filtering, and an explicit private-conversation explanation.
- Feed/detail card: shared author/content/media region followed by context tabs. Tab switches remount interaction state with the selected delivery post ID.
- Edit: audience is shown as locked; sections and retained/new photos remain editable. Delete is owner-only and confirms complete multi-delivery removal.

## States

Empty authored history and inaccessible/deleted details use the shared empty/not-found language. Upload or network failures remain in the composer without discarding entered text. Busy actions disable repeat submission. Processed media is replaced through realtime invalidation.

## Accessibility

Audience and media controls use labels and fieldsets. Context controls use `tablist`, `tab`, and `aria-selected`. All buttons retain the shared 44px touch-target and visible focus treatment. Content headings remain semantic and photos use author-aware alternative text.

## Routes

- `/life-updates`
- `/life-updates/new`
- `/life-updates/[lifeUpdateId]`
- `/life-updates/[lifeUpdateId]/edit`

The implementation-derived edit artboard is captured as
`07-life-updates/life-update-edit.png`; the remaining routed artboards map to
their corresponding `PAL-063`–`PAL-068` manifest entries.

Friend-history data is available through `GET /api/v1/users/:username/life-updates`; a standalone public profile surface remains owned by the later Rooms phase.
