# Mobile app (Expo)

This is the React Native / Expo client for Portfolio Optimization, part of the
pnpm + Turborepo monorepo. It targets **Expo SDK 56** (React Native 0.85,
React 19.2) with the New Architecture and the React Compiler enabled.

## Expo changes fast

Before writing Expo/React Native code, read the exact versioned docs at
https://docs.expo.dev/versions/v56.0.0/ — APIs differ between SDK versions.

## Conventions

- **Routing:** file-based via `expo-router`. Routes live in `src/app`; the tab
  bar is the `(tabs)` group. Typed routes are enabled.
- **i18n:** Spanish (`es`) is the default locale, English (`en`) is supported.
  Never hardcode UI strings — add keys to `messages/es.json` and
  `messages/en.json` and read them with `useTranslations()`.
- **Data fetching:** `@tanstack/react-query`; API access goes through
  `src/lib/api`.
- **Imports:** use the `@/` path alias for `src`.

## Common commands (run from this directory)

- `pnpm dev` — start the Expo dev server
- `pnpm ios` / `pnpm android` / `pnpm web`
- `pnpm lint`
