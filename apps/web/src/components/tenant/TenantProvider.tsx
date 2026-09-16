"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TENANT_CONFIG, type TenantBrand, type TenantConfig } from "@/lib/tenant-config";

// The tenant's identity, resolved on the server and handed down (PLAN Task 1.4).
//
// It sits beside `NextIntlClientProvider` rather than inside it because the two
// carry different kinds of value: next-intl carries *translated copy*, one
// string per locale, identical for every tenant; this carries *tenant data*, one
// value per organization, the same in every locale. A product name has no
// Spanish and English variants — it is a name.
//
// There is no client fetch and no loading state, deliberately. Branding arrives
// with the first byte of HTML, so nothing flashes our brand on the way to
// theirs.

const TenantContext = createContext<TenantConfig | null>(null);

export function TenantProvider({
  config,
  children,
}: {
  /** Resolved from the `Host` header in the root layout. */
  config: TenantConfig;
  children: React.ReactNode;
}) {
  return <TenantContext.Provider value={config}>{children}</TenantContext.Provider>;
}

/**
 * Falls back to our own brand rather than throwing, the way `useResolvedTheme`
 * does. A component rendered outside the provider — a test, an error boundary
 * above the layout — should still have a wordmark.
 */
export function useTenant(): TenantConfig {
  return useContext(TenantContext) ?? DEFAULT_TENANT_CONFIG;
}

/** The brand strings that used to be the `Brand` namespace in the message files. */
export function useTenantBrand(): TenantBrand {
  return useTenant().brand;
}
