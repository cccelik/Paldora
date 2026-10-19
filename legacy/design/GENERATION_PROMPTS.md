# Initial Artboard Prompt Set

All initial artboards were generated with the built-in image generation workflow and inspected at original resolution before export. These are the approved prompt intents; exact tokens, accessibility constraints, and component rules come from [`design-system.md`](design-system.md).

## PAL-001 — Brand identity

Create a premium 4:3 Paldora brand board with the editorial `Paldora` wordmark, a geometric P/open-box mark and one emerging four-point star, dark/light/monochrome lockups, app icon, favicon test, exact core palette, typography pairing, and restrained paper/tape/photo-corner/date-stamp motifs. Use the exact line “a box for your people.” Avoid literal treasure chests, 3D metallic marks, childish magic, crypto styling, and excessive sparkle.

## PAL-002 — Design tokens

Using PAL-001 as the identity anchor, create a developer-readable 4:3 Figma-style board for semantic color, type, 4px space, 12-column grid, radius, shadow, motion, breakpoints, z-index, icon strokes, and light/dark surfaces. Show a 3px Soft Lavender `#8D6CD1` focus ring. Avoid tiny paragraphs and generic SaaS styling.

## PAL-003 — Component system

Using PAL-002, create a production component board with buttons and states, form controls, avatars, role badges, explicit audience badges, PostCard, ReactionBar, BoxCard, LifeUpdateCard, MemoryCard, NotificationRow, Modal, BottomSheet, Tabs, Toast, skeleton, and empty state. Controls must read as 44px targets, with visible lavender focus and sparse gold.

## PAL-004 — Desktop application shell

Create a 1440×1024 dark authenticated shell with a 232px labeled navigation rail, 620px central reading footprint, and 288px context rail. Include Home, Life Updates, Boxes, Memories, Collections, Friends, Notifications, Search, Create, profile, settings, Your Boxes, and On this day. Keep the center structurally empty to document the shell.

## PAL-005 — Desktop feed dark

Fill PAL-004’s central column with an explicitly chronological dark feed: compact composer, Alice Moreno’s Box-scoped lakeside photo post, Jonah Kim’s Life Update card, and the beginning of a text post. Every card exposes author, time, audience, actions, and realistic content. Preserve the context rail; include no ranking or ads.

## PAL-006 — Desktop feed light

Convert PAL-005 to warm stationery light mode while preserving its exact structure, content, photos, privacy indicators, counts, and spacing. Use Warm Ivory, Paper, Dark Ink, Muted Brown, Deep Gold for readable selected text, and Soft Lavender emotional accents. Do not simply invert colors.

## PAL-007 — Mobile feed dark

Adapt PAL-005 into a true 390×844 mobile layout with safe areas, Paldora header, search and notifications, compact composer, Alice’s Box photo card, the start of Jonah’s Life Update, and visible-label bottom navigation: Home, Boxes, Create, Memories, Profile. Do not squeeze the desktop shell into a phone.

## PAL-008 — Mobile feed light

Convert PAL-007 to warm light mode while preserving exact hierarchy, content, privacy indicators, safe areas, and bottom navigation. Use premium paper surfaces and readable Deep Gold rather than yellow text.

## PAL-009 — Default Room

Create Alice Moreno’s 1440×1024 Cream Paper Room inside the trusted Paldora shell. Include banner/avatar/profile identity, Berlin, currently learning pottery, Friends privacy/action, Currently with a legitimate music-service link, Top Friends, photos, Life Update, profile tabs, post preview, and secondary Customize Room action. Use restrained paper/tape/annotation motifs.

## PAL-010 — Y2K Glitter Room

Transform only PAL-009’s customizable Room layer into polished silver-lilac Y2K Glitter while preserving every person, photo, data field, widget, tab, post, and trusted shell control. Use tasteful chrome, pale pink panels, pixel stars, and sticker frames; keep body copy readable and the trusted shell unchanged.

## PAL-011 — Desktop Theme Editor

Create a 1440×1024 production editor with a dark trusted top bar, draft status and Save Draft/Preview/Publish/Reset; a 280px settings rail; centered live Alice Cream Paper preview with device toggle; and a 320px inspector for presets, appearance, typed accent, background, font, premium decorations, and AA contrast status. Make draft versus publish explicit.

## PAL-012 — Mobile Theme Editor

Adapt PAL-011 into a true 390×844 light mobile flow: safe-area header, Draft saved, Publish, 16:10 live Alice preview, Desktop/Mobile preview toggle, horizontal Theme/Colors/Layout/Widgets/Advanced tabs, preset carousel, appearance and background controls, and persistent Full preview/Publish actions above the home indicator.
