# Themes

Application appearance (`light`, `dark`, or `system`) and a user's Room theme are separate preferences. Shared design tokens provide the Paldora palette: Obsidian Ink, Antique Gold, Champagne, Warm Ivory, and Soft Lavender.

Web renders every Room through one semantic component tree and a versioned,
validated registry. Phase 7 presets are Obsidian Gold, Cream Paper, Lavender
Dream, Ocean Glow, Daisy Day, Neon Night, Y2K Glitter, Dark Academia, Frutiger
Aero, Tumblr 2014, Retro Windows, Cyberpunk, Minimal Editorial, and Polaroid
Scrapbook. The registry controls five scoped CSS variables plus allowlisted
accent, background, bundled/system font, decoration, and motion tokens.

At 900px and below, two-column Rooms collapse responsively without mutating the
saved order. Sparkles respect `prefers-reduced-motion`, and registry contrast
pairs are tested at WCAG AA. The trusted application shell and privacy controls
never inherit Room variables.

Arbitrary HTML and CSS remain deferred. Any later custom CSS must be scoped to
the Room container; custom HTML must be sanitized, allowlisted, sandboxed, and
isolated from navigation, privacy, security, billing, and moderation surfaces.
JavaScript customization is prohibited.
