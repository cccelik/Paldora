# Web component architecture

Keep route files focused on data loading and composition. Reusable rendering
belongs under `components/` so later routes can consume it without copying
markup or behavior.

## Layers

- `components/ui/`: server-compatible, stateless visual primitives. Import from
  `components/ui` rather than reaching into individual files.
- `components/*.tsx`: product components and layouts that combine primitives or
  own a client boundary, such as `AvatarUploader`, `AppShell`, and the forms.
- `app/**/page.tsx`: route orchestration, data loading, redirects, and page-level
  composition only.
- `@paldora/ui`: framework-neutral tokens today. Move components there only when
  web and mobile have a real shared rendering contract.

## Reuse rules

1. Search `components/ui` and existing product components before adding markup.
2. Extract a pattern when it reaches a second genuine use and its semantics and
   behavior match. Do not abstract two elements merely because their CSS looks
   similar.
3. Put validation constraints in the field component that owns the input. Keep
   the API and database authoritative.
4. Keep primitives server-compatible. Add `'use client'` only to the smallest
   component that needs state, effects, event handlers, or browser APIs.
5. Expose new primitives from `components/ui/index.ts` and use typed props with
   `ReactNode` slots for composition.
6. Preserve semantic elements, accessible names, status roles, keyboard focus,
   and existing responsive CSS when extracting a component.
7. Add or update tests whenever shared behavior, validation, routing, or client
   interaction changes.

`BoxManagementMenu` owns the responsive Box management dialog. Keep invitation,
membership, and owner settings controls inside it so the Box feed remains the
primary page content.

Route-sized product sections are also reusable components: `BoxGrid`,
`BoxInvitationList`, `FriendControls`, the friend list sections, and
`BoxDetailHeaderActions`. Client components separate browser orchestration from
rendering through `AvatarUploaderView`, `PostComposerForm`, and
`PostMediaLightbox`. Extend these components or extract a new focused sibling;
do not copy their markup back into a route.
