# Theme Editor — Desktop

## Purpose

Let a user customize a Room through safe, versioned settings with immediate preview and clear draft/publish semantics.

## Route

`/settings/room/theme`

## Required data

Published theme, draft theme, preset catalog, entitlements, upload references, widget catalog/order, validation warnings, preview profile.

## Layout

Three panes: 280px setting navigation, flexible live Room preview, 320px contextual inspector/device controls. Persistent top actions: Save Draft, Preview, Publish, Reset. Publish is the strongest action; Reset is quiet and requires confirmation.

## Controls

Preset, appearance, accent, background, font, banner, avatar, music, stickers, sparkles, widgets/order, gallery layout, Top Friends, post appearance. Premium controls show a subtle badge and remain understandable without upgrade pressure.

## Interactions and states

Draft autosave status is explicit. Undo/redo operates on editor state. Device toggle changes preview only. Invalid contrast produces a blocking explanation and suggested fix. Offline edits stay local and cannot claim publication.

## Privacy and accessibility

Preview uses synthetic/sample content when viewing other device sizes. Keyboard users can reorder widgets. Every color control accepts typed values and reports contrast. Motion controls respect system preferences.
