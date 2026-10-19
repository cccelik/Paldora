# Desktop Application Shell

## Purpose

Provide the trusted, persistent frame for authenticated Paldora pages.

## Route

Shared layout for `/home`, `/life-updates`, `/boxes`, `/memories`, `/collections`, `/friends`, and `/notifications`.

## Required data

Current route, unread count, current user avatar, active appearance, and optional contextual rail data.

## Components

Desktop navigation rail, brand mark, global search trigger, Create button, profile menu, page header, reading column, contextual rail, toast region.

## Desktop layout

232px left rail, flexible central canvas, optional 288px right rail. Content max width 1280px. Navigation stays visually quiet; active item uses a narrow antique-gold marker plus selected fill.

## Mobile behavior

Transforms into a top header and five-item bottom navigation. Search and notifications move into the header. Create occupies the central emphasized action.

## Interactions

Keyboard shortcuts open search and composer. Rail can compact. Profile avatar opens an anchored menu. All icon-only actions have tooltips.

## States

Loading preserves navigation and skeletonizes page content. Offline state appears below the header. Shell-level error never removes account or privacy access.

## Privacy and accessibility

No private content appears in navigation previews. Focus order is rail, header, main, context. A skip link targets main content. Custom Room layers cannot cover shell controls.
