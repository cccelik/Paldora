# Paldora Design Manifest

This is the source of truth for Paldora design generation. Each asset is generated as an individual artboard, inspected at full size, and paired with a developer handoff specification for major screens. `COMPLETE` means the asset exists in the repository and has passed visual inspection; `TODO` means no approved asset exists yet.

## Generation rules

- Desktop artboards: 1440×1024 unless noted.
- Mobile artboards: 390×844 unless noted.
- System/brand boards: 2048×1536.
- Core shell/feed screens receive separate light and dark assets.
- Trusted navigation, privacy controls, and account actions remain visually stable inside custom Rooms.
- Exact product copy lives in Markdown specs when raster text cannot be trusted.

## Initial delivery

| ID      | Screen                         | Platform     | Appearance   | Dimensions | Filename                                              | Status   | Dependencies              |
| ------- | ------------------------------ | ------------ | ------------ | ---------- | ----------------------------------------------------- | -------- | ------------------------- |
| PAL-001 | Brand identity and logo family | Design board | Light + dark | 2048×1536  | `00-brand/brand-identity.png`                         | COMPLETE | —                         |
| PAL-002 | Design tokens                  | Design board | Light + dark | 2048×1536  | `01-design-system/design-tokens.png`                  | COMPLETE | PAL-001                   |
| PAL-003 | Component system               | Design board | Light + dark | 2048×1536  | `01-design-system/component-system.png`               | COMPLETE | PAL-001, PAL-002          |
| PAL-004 | Application shell              | Desktop      | Dark         | 1440×1024  | `01-design-system/application-shell-desktop-dark.png` | COMPLETE | PAL-001–003               |
| PAL-005 | Home Feed                      | Desktop      | Dark         | 1440×1024  | `05-feed/feed-desktop-dark.png`                       | COMPLETE | PAL-004                   |
| PAL-006 | Home Feed                      | Desktop      | Light        | 1440×1024  | `05-feed/feed-desktop-light.png`                      | COMPLETE | PAL-005                   |
| PAL-007 | Home Feed                      | Mobile       | Dark         | 390×844    | `05-feed/feed-mobile-dark.png`                        | COMPLETE | PAL-005                   |
| PAL-008 | Home Feed                      | Mobile       | Light        | 390×844    | `05-feed/feed-mobile-light.png`                       | COMPLETE | PAL-006, PAL-007          |
| PAL-009 | Default Room                   | Desktop      | Cream Paper  | 1440×1024  | `10-rooms/room-default-desktop.png`                   | COMPLETE | PAL-001–004               |
| PAL-010 | First custom Room              | Desktop      | Y2K Glitter  | 1440×1024  | `10-rooms/room-y2k-glitter-desktop.png`               | COMPLETE | PAL-009                   |
| PAL-011 | Theme Editor                   | Desktop      | Dark editor  | 1440×1024  | `12-theme-editor/theme-editor-desktop.png`            | COMPLETE | PAL-002, PAL-003, PAL-009 |
| PAL-012 | Theme Editor                   | Mobile       | Light editor | 390×844    | `12-theme-editor/theme-editor-mobile.png`             | COMPLETE | PAL-011                   |

## Brand and system backlog

| ID      | Screen                        | Platform     | Appearance | Dimensions | Filename                                  | Status | Dependencies |
| ------- | ----------------------------- | ------------ | ---------- | ---------- | ----------------------------------------- | ------ | ------------ |
| PAL-013 | Logo family on dark           | Brand board  | Dark       | 2048×1536  | `00-brand/logo-family-dark.png`           | TODO   | PAL-001      |
| PAL-014 | Logo family on light          | Brand board  | Light      | 2048×1536  | `00-brand/logo-family-light.png`          | TODO   | PAL-001      |
| PAL-015 | App icon and favicon          | Brand board  | Mixed      | 2048×1536  | `00-brand/app-icon-favicon.png`           | TODO   | PAL-001      |
| PAL-016 | Typography system             | Design board | Mixed      | 2048×1536  | `01-design-system/typography.png`         | TODO   | PAL-001      |
| PAL-017 | Iconography                   | Design board | Mixed      | 2048×1536  | `01-design-system/iconography.png`        | TODO   | PAL-001      |
| PAL-018 | Navigation states             | Design board | Mixed      | 2048×1536  | `01-design-system/navigation.png`         | TODO   | PAL-003      |
| PAL-019 | Modal and bottom sheet system | Design board | Mixed      | 2048×1536  | `01-design-system/modals-sheets.png`      | TODO   | PAL-003      |
| PAL-020 | Loading, empty, error system  | Design board | Mixed      | 2048×1536  | `01-design-system/system-states.png`      | TODO   | PAL-003      |
| PAL-021 | Premium components            | Design board | Mixed      | 2048×1536  | `01-design-system/premium-components.png` | TODO   | PAL-003      |
| PAL-022 | Scrapbook decorative kit      | Design board | Mixed      | 2048×1536  | `01-design-system/scrapbook-kit.png`      | TODO   | PAL-001      |

## Landing, authentication, and onboarding

| ID      | Screen                  | Platform          | Appearance | Dimensions | Filename                                       | Status   | Dependencies       |
| ------- | ----------------------- | ----------------- | ---------- | ---------- | ---------------------------------------------- | -------- | ------------------ |
| PAL-023 | Landing page            | Desktop           | Dark       | 1440×6000  | `02-landing/landing-desktop-dark.png`          | TODO     | PAL-001–003        |
| PAL-024 | Landing page            | Desktop           | Light      | 1440×6000  | `02-landing/landing-desktop-light.png`         | TODO     | PAL-023            |
| PAL-025 | Landing page            | Mobile            | Dark       | 390×4200   | `02-landing/landing-mobile-dark.png`           | TODO     | PAL-023            |
| PAL-026 | Landing page            | Mobile            | Light      | 390×4200   | `02-landing/landing-mobile-light.png`          | TODO     | PAL-024, PAL-025   |
| PAL-027 | Sign in                 | Desktop           | Light      | 1440×1024  | `03-auth/sign-in-desktop-light.png`            | COMPLETE | PAL-003            |
| PAL-028 | Create account          | Desktop           | Light      | 1440×1024  | `03-auth/create-account-desktop-light.png`     | TODO     | PAL-027            |
| PAL-029 | Verify email            | Desktop           | Light      | 1440×1024  | `03-auth/verify-email-desktop-light.png`       | TODO     | PAL-027            |
| PAL-030 | Forgot password         | Desktop           | Light      | 1440×1024  | `03-auth/forgot-password-desktop-light.png`    | COMPLETE | PAL-027            |
| PAL-031 | Reset password          | Desktop           | Light      | 1440×1024  | `03-auth/reset-password-desktop-light.png`     | COMPLETE | PAL-030            |
| PAL-032 | Magic link sent         | Desktop           | Light      | 1440×1024  | `03-auth/magic-link-sent-desktop-light.png`    | TODO     | PAL-027            |
| PAL-033 | Username selection      | Desktop           | Light      | 1440×1024  | `03-auth/username-selection-desktop-light.png` | COMPLETE | PAL-027            |
| PAL-034 | Profile setup           | Desktop           | Light      | 1440×1024  | `03-auth/profile-setup-desktop-light.png`      | COMPLETE | PAL-033            |
| PAL-035 | Avatar setup            | Desktop           | Light      | 1440×1024  | `03-auth/avatar-setup-desktop-light.png`       | COMPLETE | PAL-034            |
| PAL-036 | Auth error states       | Design board      | Mixed      | 2048×1536  | `03-auth/auth-error-states.png`                | COMPLETE | PAL-027–035        |
| PAL-037 | Sign in                 | Mobile            | Light      | 390×844    | `03-auth/sign-in-mobile-light.png`             | COMPLETE | PAL-027            |
| PAL-038 | Create account          | Mobile            | Light      | 390×844    | `03-auth/create-account-mobile-light.png`      | TODO     | PAL-028            |
| PAL-039 | Username unavailable    | Mobile            | Light      | 390×844    | `03-auth/username-unavailable-mobile.png`      | COMPLETE | PAL-033            |
| PAL-040 | Welcome to Paldora      | Mobile onboarding | Light      | 390×844    | `04-onboarding/welcome.png`                    | TODO     | PAL-038            |
| PAL-041 | Choose username         | Mobile onboarding | Light      | 390×844    | `04-onboarding/choose-username.png`            | TODO     | PAL-040            |
| PAL-042 | Upload profile photo    | Mobile onboarding | Light      | 390×844    | `04-onboarding/upload-photo.png`               | TODO     | PAL-041            |
| PAL-043 | About yourself          | Mobile onboarding | Light      | 390×844    | `04-onboarding/about-yourself.png`             | TODO     | PAL-042            |
| PAL-044 | Choose interests        | Mobile onboarding | Light      | 390×844    | `04-onboarding/interests.png`                  | TODO     | PAL-043            |
| PAL-045 | Find friends            | Mobile onboarding | Light      | 390×844    | `04-onboarding/find-friends.png`               | TODO     | PAL-044            |
| PAL-046 | Create first Box        | Mobile onboarding | Light      | 390×844    | `04-onboarding/create-first-box.png`           | TODO     | PAL-045            |
| PAL-047 | Join existing Box       | Mobile onboarding | Light      | 390×844    | `04-onboarding/join-box.png`                   | TODO     | PAL-045            |
| PAL-048 | Choose first theme      | Mobile onboarding | Light      | 390×844    | `04-onboarding/choose-theme.png`               | TODO     | PAL-046 or PAL-047 |
| PAL-049 | Customize Room          | Mobile onboarding | Light      | 390×844    | `04-onboarding/customize-room.png`             | TODO     | PAL-048            |
| PAL-050 | Notification permission | Mobile onboarding | Light      | 390×844    | `04-onboarding/notifications.png`              | TODO     | PAL-049            |
| PAL-051 | You're ready            | Mobile onboarding | Light      | 390×844    | `04-onboarding/complete.png`                   | TODO     | PAL-050            |

## Posts and Life Updates

| ID      | Screen                                  | Platform        | Appearance | Dimensions | Filename                                           | Status   | Dependencies     |
| ------- | --------------------------------------- | --------------- | ---------- | ---------- | -------------------------------------------------- | -------- | ---------------- |
| PAL-052 | Post type library in feed               | Design board    | Mixed      | 2048×2400  | `06-posts/post-types-feed.png`                     | TODO     | PAL-003, PAL-005 |
| PAL-053 | Text post detail                        | Desktop         | Light      | 1440×1024  | `06-posts/text-post-detail.png`                    | TODO     | PAL-052          |
| PAL-054 | Photo post detail                       | Desktop         | Dark       | 1440×1024  | `06-posts/photo-post-detail.png`                   | TODO     | PAL-052          |
| PAL-055 | Gallery post detail                     | Desktop         | Light      | 1440×1024  | `06-posts/gallery-post-detail.png`                 | TODO     | PAL-052          |
| PAL-056 | Quote post detail                       | Desktop         | Dark       | 1440×1024  | `06-posts/quote-post-detail.png`                   | TODO     | PAL-052          |
| PAL-057 | Link post detail                        | Desktop         | Light      | 1440×1024  | `06-posts/link-post-detail.png`                    | TODO     | PAL-052          |
| PAL-058 | Life Update detail                      | Desktop         | Light      | 1440×1024  | `06-posts/life-update-post-detail.png`             | COMPLETE | PAL-063          |
| PAL-059 | Music post detail                       | Desktop         | Dark       | 1440×1024  | `06-posts/music-post-detail.png`                   | TODO     | PAL-052          |
| PAL-060 | Poll post detail                        | Desktop         | Light      | 1440×1024  | `06-posts/poll-post-detail.png`                    | TODO     | PAL-052          |
| PAL-061 | Milestone post detail                   | Desktop         | Light      | 1440×1024  | `06-posts/milestone-post-detail.png`               | TODO     | PAL-052          |
| PAL-062 | Create post modal and audience selector | Desktop         | Dark       | 1440×1024  | `06-posts/create-post-modal-desktop.png`           | TODO     | PAL-003          |
| PAL-063 | Life Update composer                    | Desktop         | Light      | 1440×1024  | `07-life-updates/life-update-composer-desktop.png` | COMPLETE | PAL-062          |
| PAL-064 | Life Update composer                    | Mobile          | Light      | 390×844    | `07-life-updates/life-update-composer-mobile.png`  | COMPLETE | PAL-063          |
| PAL-065 | Life Update feed card                   | Component board | Mixed      | 1440×1024  | `07-life-updates/life-update-feed-card.png`        | COMPLETE | PAL-063          |
| PAL-066 | Life Update full page                   | Desktop         | Light      | 1440×1024  | `07-life-updates/life-update-full-page.png`        | COMPLETE | PAL-063          |
| PAL-067 | Friend Life Update history              | Desktop         | Light      | 1440×1024  | `07-life-updates/friend-life-update-history.png`   | COMPLETE | PAL-066          |
| PAL-068 | Monthly Life Update overview            | Desktop         | Dark       | 1440×1024  | `07-life-updates/monthly-life-update-overview.png` | COMPLETE | PAL-066          |

## Boxes, invites, and friends

| ID      | Screen                     | Platform      | Appearance | Dimensions | Filename                            | Status   | Dependencies |
| ------- | -------------------------- | ------------- | ---------- | ---------- | ----------------------------------- | -------- | ------------ |
| PAL-069 | Boxes overview             | Desktop       | Dark       | 1440×1024  | `08-boxes/boxes-overview.png`       | TODO     | PAL-004      |
| PAL-070 | Create Box                 | Desktop modal | Light      | 1440×1024  | `08-boxes/create-box.png`           | TODO     | PAL-069      |
| PAL-071 | Box detail                 | Desktop       | Dark       | 1440×1024  | `08-boxes/box-detail.png`           | TODO     | PAL-069      |
| PAL-072 | Box feed                   | Desktop       | Light      | 1440×1024  | `08-boxes/box-feed.png`             | TODO     | PAL-071      |
| PAL-073 | Box members and roles      | Desktop       | Light      | 1440×1024  | `08-boxes/box-members-roles.png`    | TODO     | PAL-071      |
| PAL-074 | Invite members             | Desktop modal | Dark       | 1440×1024  | `08-boxes/invite-members.png`       | TODO     | PAL-073      |
| PAL-075 | Box settings               | Desktop       | Light      | 1440×1024  | `08-boxes/box-settings.png`         | TODO     | PAL-071      |
| PAL-076 | Box media                  | Desktop       | Dark       | 1440×1024  | `08-boxes/box-media.png`            | TODO     | PAL-071      |
| PAL-077 | Box memories               | Desktop       | Light      | 1440×1024  | `08-boxes/box-memories.png`         | COMPLETE | PAL-071      |
| PAL-078 | Box Life Updates           | Desktop       | Light      | 1440×1024  | `08-boxes/box-life-updates.png`     | COMPLETE | PAL-071      |
| PAL-079 | Invite states              | Design board  | Mixed      | 2048×1536  | `08-boxes/invite-states.png`        | TODO     | PAL-074      |
| PAL-080 | Invite received / Join Box | Mobile        | Light      | 390×844    | `08-boxes/join-box-mobile.png`      | TODO     | PAL-079      |
| PAL-081 | Expired and invalid invite | Mobile        | Light      | 390×844    | `08-boxes/invite-errors-mobile.png` | TODO     | PAL-079      |
| PAL-082 | Friends list               | Desktop       | Light      | 1440×1024  | `09-friends/friends-list.png`       | TODO     | PAL-004      |
| PAL-083 | Friend requests            | Desktop       | Light      | 1440×1024  | `09-friends/friend-requests.png`    | TODO     | PAL-082      |
| PAL-084 | Suggested friends          | Desktop       | Light      | 1440×1024  | `09-friends/suggested-friends.png`  | TODO     | PAL-082      |
| PAL-085 | Find friends / User search | Desktop       | Dark       | 1440×1024  | `09-friends/find-friends.png`       | TODO     | PAL-082      |
| PAL-086 | Blocked users              | Desktop       | Light      | 1440×1024  | `09-friends/blocked-users.png`      | TODO     | PAL-082      |
| PAL-087 | Top Friends editor         | Desktop       | Light      | 1440×1024  | `09-friends/top-friends-editor.png` | COMPLETE | PAL-009      |

## Rooms, themes, and customization

| ID      | Screen                          | Platform     | Appearance         | Dimensions | Filename                                        | Status   | Dependencies |
| ------- | ------------------------------- | ------------ | ------------------ | ---------- | ----------------------------------------------- | -------- | ------------ |
| PAL-088 | Room theme                      | Desktop      | Obsidian Gold      | 1440×1024  | `11-themes/room-obsidian-gold-desktop.png`      | COMPLETE | PAL-009      |
| PAL-089 | Room theme                      | Desktop      | Cream Paper        | 1440×1024  | `11-themes/room-cream-paper-desktop.png`        | COMPLETE | PAL-009      |
| PAL-090 | Room theme                      | Desktop      | Lavender Dream     | 1440×1024  | `11-themes/room-lavender-dream-desktop.png`     | COMPLETE | PAL-009      |
| PAL-091 | Room theme                      | Desktop      | Ocean Glow         | 1440×1024  | `11-themes/room-ocean-glow-desktop.png`         | COMPLETE | PAL-009      |
| PAL-092 | Room theme                      | Desktop      | Daisy Day          | 1440×1024  | `11-themes/room-daisy-day-desktop.png`          | COMPLETE | PAL-009      |
| PAL-093 | Room theme                      | Desktop      | Neon Night         | 1440×1024  | `11-themes/room-neon-night-desktop.png`         | COMPLETE | PAL-009      |
| PAL-094 | Room theme                      | Desktop      | Dark Academia      | 1440×1024  | `11-themes/room-dark-academia-desktop.png`      | COMPLETE | PAL-009      |
| PAL-095 | Room theme                      | Desktop      | Frutiger Aero      | 1440×1024  | `11-themes/room-frutiger-aero-desktop.png`      | COMPLETE | PAL-009      |
| PAL-096 | Room theme                      | Desktop      | Tumblr 2014        | 1440×1024  | `11-themes/room-tumblr-2014-desktop.png`        | COMPLETE | PAL-009      |
| PAL-097 | Room theme                      | Desktop      | Retro Windows      | 1440×1024  | `11-themes/room-retro-windows-desktop.png`      | COMPLETE | PAL-009      |
| PAL-098 | Room theme                      | Desktop      | Cyberpunk          | 1440×1024  | `11-themes/room-cyberpunk-desktop.png`          | COMPLETE | PAL-009      |
| PAL-099 | Room theme                      | Desktop      | Minimal Editorial  | 1440×1024  | `11-themes/room-minimal-editorial-desktop.png`  | COMPLETE | PAL-009      |
| PAL-100 | Room theme                      | Desktop      | Polaroid Scrapbook | 1440×1024  | `11-themes/room-polaroid-scrapbook-desktop.png` | COMPLETE | PAL-009      |
| PAL-101 | Advanced MySpace editor         | Desktop      | Dark               | 1440×1024  | `12-theme-editor/advanced-editor-desktop.png`   | TODO     | PAL-011      |
| PAL-102 | HTML widget library             | Design board | Mixed              | 2048×2400  | `12-theme-editor/html-widget-library.png`       | TODO     | PAL-101      |
| PAL-103 | Top Friends privacy and layouts | Design board | Mixed              | 2048×1536  | `12-theme-editor/top-friends-options.png`       | COMPLETE | PAL-087      |
| PAL-104 | Music widgets                   | Design board | Mixed              | 2048×1536  | `12-theme-editor/music-widgets.png`             | COMPLETE | PAL-009      |

## Memories, collections, gallery, and discovery

| ID      | Screen                                | Platform      | Appearance | Dimensions | Filename                                      | Status   | Dependencies |
| ------- | ------------------------------------- | ------------- | ---------- | ---------- | --------------------------------------------- | -------- | ------------ |
| PAL-105 | Memory home                           | Desktop       | Dark       | 1440×1024  | `13-memories/memory-home.png`                 | COMPLETE | PAL-004      |
| PAL-106 | Year timeline                         | Desktop       | Light      | 1440×1024  | `13-memories/year-timeline.png`               | COMPLETE | PAL-105      |
| PAL-107 | Month timeline                        | Desktop       | Light      | 1440×1024  | `13-memories/month-timeline.png`              | COMPLETE | PAL-106      |
| PAL-108 | On This Day                           | Desktop       | Dark       | 1440×1024  | `13-memories/on-this-day.png`                 | TODO     | PAL-105      |
| PAL-109 | Friendship timeline                   | Desktop       | Light      | 1440×1024  | `13-memories/friendship-timeline.png`         | TODO     | PAL-105      |
| PAL-110 | Box timeline                          | Desktop       | Light      | 1440×1024  | `13-memories/box-timeline.png`                | COMPLETE | PAL-105      |
| PAL-111 | Memory detail                         | Desktop       | Dark       | 1440×1024  | `13-memories/memory-detail.png`               | COMPLETE | PAL-105      |
| PAL-112 | Yearly recap                          | Mobile story  | Dark       | 1080×1920  | `13-memories/yearly-recap-01.png`             | TODO     | PAL-105      |
| PAL-113 | Yearly recap statistics               | Mobile story  | Light      | 1080×1920  | `13-memories/yearly-recap-02.png`             | TODO     | PAL-112      |
| PAL-114 | Collections home                      | Desktop       | Light      | 1440×1024  | `14-collections/collections-home.png`         | TODO     | PAL-004      |
| PAL-115 | Collection detail                     | Desktop       | Light      | 1440×1024  | `14-collections/collection-detail.png`        | TODO     | PAL-114      |
| PAL-116 | Create Collection                     | Desktop modal | Light      | 1440×1024  | `14-collections/create-collection.png`        | TODO     | PAL-114      |
| PAL-117 | Add to Collection                     | Mobile sheet  | Light      | 390×844    | `14-collections/add-to-collection-mobile.png` | TODO     | PAL-114      |
| PAL-118 | Profile gallery                       | Desktop       | Light      | 1440×1024  | `15-gallery/profile-gallery.png`              | TODO     | PAL-009      |
| PAL-119 | Box gallery                           | Desktop       | Dark       | 1440×1024  | `15-gallery/box-gallery.png`                  | TODO     | PAL-071      |
| PAL-120 | Album                                 | Desktop       | Light      | 1440×1024  | `15-gallery/album.png`                        | TODO     | PAL-118      |
| PAL-121 | Photo viewer                          | Desktop       | Dark       | 1440×1024  | `15-gallery/photo-viewer.png`                 | TODO     | PAL-120      |
| PAL-122 | Upload gallery                        | Desktop modal | Light      | 1440×1024  | `15-gallery/upload-gallery.png`               | TODO     | PAL-118      |
| PAL-123 | Photo detail                          | Mobile        | Dark       | 390×844    | `15-gallery/photo-detail-mobile.png`          | TODO     | PAL-121      |
| PAL-124 | Global search                         | Desktop       | Dark       | 1440×1024  | `16-search/global-search.png`                 | TODO     | PAL-004      |
| PAL-125 | Search results and privacy boundaries | Desktop       | Light      | 1440×1024  | `16-search/search-results.png`                | TODO     | PAL-124      |
| PAL-126 | Notification center                   | Desktop       | Dark       | 1440×1024  | `17-notifications/notification-center.png`    | TODO     | PAL-004      |
| PAL-127 | Notifications empty                   | Desktop       | Light      | 1440×1024  | `17-notifications/notifications-empty.png`    | TODO     | PAL-126      |

## Settings, security, premium, and trust

| ID      | Screen                           | Platform         | Appearance | Dimensions | Filename                                      | Status   | Dependencies |
| ------- | -------------------------------- | ---------------- | ---------- | ---------- | --------------------------------------------- | -------- | ------------ |
| PAL-128 | Account settings                 | Desktop          | Dark shell | 1440×1024  | `18-settings/account.png`                     | COMPLETE | PAL-004      |
| PAL-129 | Profile settings                 | Desktop          | Light      | 1440×1024  | `18-settings/profile.png`                     | TODO     | PAL-128      |
| PAL-130 | Appearance settings              | Desktop          | Dark       | 1440×1024  | `18-settings/appearance.png`                  | TODO     | PAL-128      |
| PAL-131 | Privacy settings                 | Desktop          | Light      | 1440×1024  | `18-settings/privacy.png`                     | TODO     | PAL-128      |
| PAL-132 | Notification settings            | Desktop          | Light      | 1440×1024  | `18-settings/notifications.png`               | TODO     | PAL-128      |
| PAL-133 | Blocked users settings           | Desktop          | Light      | 1440×1024  | `18-settings/blocked-users.png`               | TODO     | PAL-128      |
| PAL-134 | Connected services               | Desktop          | Light      | 1440×1024  | `18-settings/connected-services.png`          | TODO     | PAL-128      |
| PAL-135 | Data and storage                 | Desktop          | Light      | 1440×1024  | `18-settings/data-storage.png`                | TODO     | PAL-128      |
| PAL-136 | Export data                      | Desktop          | Light      | 1440×1024  | `18-settings/export-data.png`                 | TODO     | PAL-135      |
| PAL-137 | Delete account                   | Desktop          | Light      | 1440×1024  | `18-settings/delete-account.png`              | TODO     | PAL-128      |
| PAL-138 | Privacy controls library         | Design board     | Mixed      | 2048×1800  | `18-settings/privacy-controls.png`            | TODO     | PAL-131      |
| PAL-139 | Security center                  | Desktop          | Dark       | 1440×1024  | `19-security/security-center.png`             | TODO     | PAL-128      |
| PAL-140 | Password and recovery            | Desktop          | Light      | 1440×1024  | `19-security/password-recovery.png`           | TODO     | PAL-139      |
| PAL-141 | Passkeys and MFA                 | Desktop          | Light      | 1440×1024  | `19-security/passkeys-mfa.png`                | TODO     | PAL-139      |
| PAL-142 | Active sessions and devices      | Desktop          | Light      | 1440×1024  | `19-security/sessions-devices.png`            | TODO     | PAL-139      |
| PAL-143 | Login history                    | Desktop          | Light      | 1440×1024  | `19-security/login-history.png`               | TODO     | PAL-139      |
| PAL-144 | Future encrypted Boxes explainer | Desktop          | Dark       | 1440×1024  | `19-security/encrypted-boxes-future.png`      | TODO     | PAL-139      |
| PAL-145 | Storage dashboard                | Desktop          | Light      | 1440×1024  | `20-premium/storage-dashboard.png`            | TODO     | PAL-135      |
| PAL-146 | Paldora+ overview                | Desktop          | Dark       | 1440×1024  | `20-premium/paldora-plus.png`                 | TODO     | PAL-003      |
| PAL-147 | Subscription plans               | Desktop          | Light      | 1440×1024  | `20-premium/subscription-desktop.png`         | TODO     | PAL-146      |
| PAL-148 | Subscription plans               | Mobile           | Dark       | 390×844    | `20-premium/subscription-mobile.png`          | TODO     | PAL-146      |
| PAL-149 | Over-quota reassurance           | Desktop          | Light      | 1440×1024  | `20-premium/over-quota.png`                   | TODO     | PAL-145      |
| PAL-150 | Report post                      | Desktop modal    | Light      | 1440×1024  | `21-moderation/report-post.png`               | TODO     | PAL-003      |
| PAL-151 | Report comment                   | Desktop modal    | Light      | 1440×1024  | `21-moderation/report-comment.png`            | TODO     | PAL-150      |
| PAL-152 | Report user                      | Mobile sheet     | Light      | 390×844    | `21-moderation/report-user-mobile.png`        | TODO     | PAL-150      |
| PAL-153 | Report Box                       | Desktop modal    | Light      | 1440×1024  | `21-moderation/report-box.png`                | TODO     | PAL-150      |
| PAL-154 | Block user and confirmation      | Mobile sheet     | Light      | 390×844    | `21-moderation/block-confirmation-mobile.png` | TODO     | PAL-150      |
| PAL-155 | Admin overview                   | Desktop internal | Light      | 1440×1024  | `22-admin/admin-overview.png`                 | TODO     | PAL-003      |
| PAL-156 | Report queue                     | Desktop internal | Light      | 1440×1024  | `22-admin/report-queue.png`                   | TODO     | PAL-155      |
| PAL-157 | Report detail and content review | Desktop internal | Light      | 1440×1024  | `22-admin/report-detail.png`                  | TODO     | PAL-156      |
| PAL-158 | User lookup and detail           | Desktop internal | Light      | 1440×1024  | `22-admin/user-detail.png`                    | TODO     | PAL-155      |
| PAL-159 | Suspension modal                 | Desktop internal | Light      | 1440×1024  | `22-admin/suspension-modal.png`               | TODO     | PAL-158      |
| PAL-160 | Audit history                    | Desktop internal | Light      | 1440×1024  | `22-admin/audit-history.png`                  | TODO     | PAL-155      |

## Mobile product and system states

| ID      | Screen               | Platform     | Appearance | Dimensions | Filename                          | Status   | Dependencies     |
| ------- | -------------------- | ------------ | ---------- | ---------- | --------------------------------- | -------- | ---------------- |
| PAL-161 | Create post          | Mobile       | Dark       | 390×844    | `23-mobile/create-post.png`       | TODO     | PAL-007, PAL-062 |
| PAL-162 | Box detail           | Mobile       | Dark       | 390×844    | `23-mobile/box-detail.png`        | TODO     | PAL-071          |
| PAL-163 | Memories             | Mobile       | Light      | 390×844    | `23-mobile/memories.png`          | COMPLETE | PAL-105          |
| PAL-164 | Room                 | Mobile       | Custom     | 390×844    | `23-mobile/room.png`              | COMPLETE | PAL-009          |
| PAL-165 | Friends              | Mobile       | Light      | 390×844    | `23-mobile/friends.png`           | TODO     | PAL-082          |
| PAL-166 | Notifications        | Mobile       | Dark       | 390×844    | `23-mobile/notifications.png`     | TODO     | PAL-126          |
| PAL-167 | Search               | Mobile       | Light      | 390×844    | `23-mobile/search.png`            | TODO     | PAL-124          |
| PAL-168 | Settings             | Mobile       | Light      | 390×844    | `23-mobile/settings.png`          | TODO     | PAL-128          |
| PAL-169 | Gallery              | Mobile       | Light      | 390×844    | `23-mobile/gallery.png`           | TODO     | PAL-118          |
| PAL-170 | Photo viewer         | Mobile       | Dark       | 390×844    | `23-mobile/photo-viewer.png`      | TODO     | PAL-121          |
| PAL-171 | Empty states library | Design board | Mixed      | 2048×2400  | `24-states/empty-states.png`      | TODO     | PAL-003          |
| PAL-172 | Error states library | Design board | Mixed      | 2048×2400  | `24-states/error-states.png`      | TODO     | PAL-003          |
| PAL-173 | Loading skeletons    | Design board | Mixed      | 2048×1800  | `24-states/loading-states.png`    | TODO     | PAL-003          |
| PAL-174 | 404                  | Desktop      | Light      | 1440×1024  | `24-states/404.png`               | TODO     | PAL-003          |
| PAL-175 | 500                  | Desktop      | Dark       | 1440×1024  | `24-states/500.png`               | TODO     | PAL-003          |
| PAL-176 | Offline              | Mobile       | Light      | 390×844    | `24-states/offline-mobile.png`    | TODO     | PAL-003          |
| PAL-177 | Permission denied    | Desktop      | Light      | 1440×1024  | `24-states/permission-denied.png` | TODO     | PAL-003          |
| PAL-178 | Content removed      | Desktop      | Light      | 1440×1024  | `24-states/content-removed.png`   | TODO     | PAL-003          |
| PAL-179 | Account suspended    | Desktop      | Dark       | 1440×1024  | `24-states/account-suspended.png` | TODO     | PAL-003          |
