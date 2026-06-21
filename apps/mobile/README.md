# Mobile (Expo)

React Native client for the Portfolio Optimization app, built with **Expo SDK 56**
(React Native 0.85 / React 19.2), `expo-router`, and the New Architecture.

## Stack

- **expo-router** — file-based routing with typed routes (`src/app`)
- **@tanstack/react-query** — server state / data fetching
- **i18n-js + expo-localization** — Spanish (default) and English
- New Architecture + React Compiler enabled

## Getting started

From the monorepo root, install workspace dependencies:

```bash
pnpm install
```

Configure the API URL:

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Edit EXPO_PUBLIC_API_URL — use your LAN IP when testing on a physical device.
```

Start the dev server:

```bash
pnpm --filter mobile dev
# or, from this directory:
pnpm dev
```

Then press `i` (iOS simulator), `a` (Android emulator), or `w` (web), or scan
the QR code with Expo Go / a development build.

## Project structure

```
apps/mobile/
├── app.json              # Expo config (name, scheme, icons, plugins)
├── eas.json              # EAS Build profiles
├── metro.config.js       # Monorepo-aware Metro config
├── messages/             # i18n message catalogs (es.json, en.json)
└── src/
    ├── app/              # expo-router routes
    │   ├── _layout.tsx       # Root layout: providers + Stack
    │   ├── (tabs)/           # Tab navigator
    │   │   ├── _layout.tsx
    │   │   ├── index.tsx     # Home / API status
    │   │   └── optimizer.tsx
    │   └── +not-found.tsx
    ├── components/       # Reusable UI (themed primitives)
    ├── constants/        # Theme (colors, spacing, fonts)
    ├── hooks/            # useTheme, useColorScheme, useTranslations
    ├── i18n/             # i18n setup
    ├── lib/
    │   ├── api/          # Typed API client + endpoints
    │   ├── env.ts        # Public runtime config
    │   └── query-client.ts
    └── providers/        # App-wide context providers
```

## API connection

The app talks to the `apps/api` backend. The home screen pings the public
`/api/health` endpoint to show connectivity. Most optimization endpoints require
an authenticated BetterAuth session.

## Next steps

- Wire BetterAuth sign-in (Google / GitHub / Microsoft) to unlock the optimizer.
- Build out the optimizer flow against `POST /api/optimization/optimize`.
- Persist the user's locale choice and add a locale switcher.
