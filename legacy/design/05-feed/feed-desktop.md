# Home Feed — Desktop

## Purpose

Show a calm, chronological stream from friends, followed people, Boxes, and the current user without engagement ranking.

## Route

`/home`

## Required data

Post envelope, author profile, timestamp, audience, Box summary, typed payload, safe media variants, reaction/comment counts, viewer reaction/save state, pagination cursor.

## Components

ApplicationShell, FeedHeader, AudienceFilter, ComposerPrompt, PostCard variants, PrivacyBadge, ReactionBar, BoxCard, LifeUpdatePrompt, MemoryPrompt, loading sentinel.

## Desktop layout

620px chronological reading column centered in the available canvas. A 288px right rail shows Boxes and a restrained “On this day” card. The feed header says “Home” and “Latest from your people,” with no algorithmic tabs.

## Interactions

Composer prompt opens Create Post. Reaction is optimistic but reversible. Comments open detail/drawer. Save opens a collection picker. More menu exposes mute, report, and block according to authorization.

## States

- Loading: three structural post skeletons without shimmer when reduced motion is enabled.
- Empty: invite people or create a Box; never imply the user has failed.
- Error: preserve already-loaded posts and offer retry.
- Pagination: cursor-based “load newer”/continuation behavior with scroll restoration.

## Privacy

Audience badge is visible beside every timestamp. Box posts name the Box. Private media never preloads unauthorized originals. Blocked relationships remove both content and interaction affordances.

## Accessibility and responsive behavior

Posts are articles with author and time metadata. Action names include the author/post context. At tablet the right rail collapses; at mobile the feed becomes edge-to-edge cards with 16px page padding.
