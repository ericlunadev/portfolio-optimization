const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No `rewrites()` for /api: Vercel refuses to proxy a rewrite to Render
  // (DNS_HOSTNAME_RESOLVED_PRIVATE). The catch-all route handler in
  // src/app/api/[...path]/route.ts forwards to API_URL at request time instead.
};

module.exports = withNextIntl(nextConfig);
