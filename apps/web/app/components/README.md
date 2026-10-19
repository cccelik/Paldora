# Web component catalog

Search here before writing markup. Add an entry whenever you add a shared
component.

## Layers

- `components/ui/`: stateless, server-compatible primitives. Import them from
  `components/ui`, never from individual files.
- `components/*.tsx`: product components that compose primitives or own a
  client boundary.
- `app/**/page.tsx`: data loading, redirects, and composition only.

## Primitives

| Component                    | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `Wordmark`                   | Brand wordmark with the four-point star. `size="inline" \| "display"`.      |
| `Button`, `buttonClassName`  | Buttons and button-styled links: `primary`, `secondary`, `quiet`, `danger`. |
| `TextField`, `TextAreaField` | Labelled controls with optional prefix, "Optional" tag, and described help. |
| `FormMessage`                | A form's live region; `success`, `attention`, `failure` tones.              |
| `Avatar`                     | Photo or initials; signed URLs render as plain `img`.                       |

## Product components

| Component                                               | Owns                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `AppShell`, `AppNav`                                    | The trusted signed-in frame: brand, primary nav, avatar, sign-out.       |
| `AuthLayout`                                            | Signed-out frame (sign-in, recovery, account unavailable).               |
| `OnboardingLayout`                                      | The three setup steps with progress.                                     |
| `SettingsNav`                                           | Account / Appearance sections.                                           |
| `SubmitButton`                                          | Submit with pending state (`useFormStatus`).                             |
| `ActionFeedback`                                        | Renders an `ActionResult` into `FormMessage`.                            |
| `SignInForm`, `ForgotPasswordForm`, `ResetPasswordForm` | Auth forms on `useActionState`.                                          |
| `UsernameStepForm`, `ProfileStepForm`, `AccountForm`    | Profile forms; shared username/name/bio inputs.                          |
| `AvatarUploader`, `useAvatarUpload`                     | Reserve → PUT → complete → poll; old photo stays until the new is ready. |
| `AppearanceForm`                                        | App appearance (server-stored, mirrored to the `pal-appearance` cookie). |

Shared form rhythm lives in `components/form-stack.module.css`.

## Data access

- `app/lib/session.ts` is the server-only data-access layer: `currentUser()`
  (cached per render), `completedUser()`, `userOnStep()`, `apiClient()`.
- Server Actions live in `app/actions/*` and validate every argument.

## Page-level styles

- `app/status-page.module.css` is shared by `not-found.tsx` and `error.tsx`.
  The not-found page doubles as the "missing or not yours" state, so private
  absence and denial look identical.
