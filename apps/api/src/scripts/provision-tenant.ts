// One-shot script: provisions a whitelabel tenant.
//
// D13 makes this CLI the only way an organization comes into existence — there
// is no self-serve signup for a tenant, and no invite flow. It writes
// organization, organization_settings, organization_branding and
// organization_domain in one transaction.
//
// Usage (from apps/api):
//   pnpm provision:tenant -- \
//     --slug acme \
//     --name "Acme Capital" \
//     --hostname acme.optim.app \
//     --tier whitelabel \
//     --support-email soporte@acme.com \
//     --privacy-url https://acme.com/privacidad \
//     --terms-url https://acme.com/terminos
//
// Optional: --accent '#1f6feb'  --product-name 'Acme Portfolio'  --short-name Acme
//           --tagline '...'  --font-key instrument-sans
//
// DATABASE_URL defaults to file:portfolio.db, so point it at the real database:
//   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... pnpm provision:tenant -- ...
//
// Deliberately NOT idempotent: it refuses an existing slug or hostname rather
// than overwriting a live tenant's branding.

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { db } from "../db/index.js";
import {
  organization,
  organizationBranding,
  organizationDomain,
  organizationSettings,
} from "../db/schema.js";

// D6: a tenant lives on a subdomain of ours, served under the *.optim.app
// wildcard certificate. A wildcard matches exactly ONE label, so `acme.optim.app`
// is covered and `team.acme.optim.app` is not — hence the single-label rule.
const PARENT_DOMAIN = "optim.app";
// RFC 1123: 1-63 chars, alphanumeric at both ends, hyphens inside. No dots, which
// is what keeps the host to one label under the parent domain.
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TIERS = ["cobranded", "whitelabel"] as const;

const USAGE = `Usage (from apps/api):
  pnpm provision:tenant -- --slug <slug> --name <name> --hostname <label>.${PARENT_DOMAIN} \\
    --tier <cobranded|whitelabel> --support-email <email> \\
    --privacy-url <url> --terms-url <url>
  Optional: --accent '#1f6feb' --product-name <name> --short-name <name> \\
            --tagline <text> --font-key <key>`;

type Options = {
  slug: string;
  name: string;
  hostname: string;
  tier: (typeof TIERS)[number];
  supportEmail: string;
  privacyUrl: string;
  termsUrl: string;
  accentHex: string | null;
  productName: string;
  productShortName: string | null;
  tagline: string | null;
  fontKey: string;
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateHostname(hostname: string, errors: string[]): void {
  const suffix = `.${PARENT_DOMAIN}`;
  if (!hostname.endsWith(suffix)) {
    errors.push(`--hostname must be a subdomain of ${PARENT_DOMAIN} (D6), got '${hostname}'`);
    return;
  }

  const label = hostname.slice(0, -suffix.length);
  if (!DNS_LABEL.test(label)) {
    errors.push(
      `--hostname must be a single DNS label under ${PARENT_DOMAIN} — '${label}' is not one. ` +
        `The wildcard certificate covers one label only, so a host like ` +
        `'team.acme.${PARENT_DOMAIN}' would serve a TLS error, not a page.`
    );
  }
}

function parseOptions(): Options {
  // pnpm forwards the `--` separator itself, and parseArgs reads it as
  // end-of-options — every flag after it would land as a positional and throw.
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();

  const { values } = parseArgs({
    args: argv,
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      hostname: { type: "string" },
      tier: { type: "string", default: "cobranded" },
      "support-email": { type: "string" },
      "privacy-url": { type: "string" },
      "terms-url": { type: "string" },
      accent: { type: "string" },
      "product-name": { type: "string" },
      "short-name": { type: "string" },
      tagline: { type: "string" },
      "font-key": { type: "string", default: "instrument-sans" },
    },
  });

  const errors: string[] = [];
  const slug = (values.slug ?? "").trim().toLowerCase();
  const name = (values.name ?? "").trim();
  const hostname = (values.hostname ?? "").trim().toLowerCase();
  const tier = (values.tier ?? "").trim();
  const supportEmail = (values["support-email"] ?? "").trim();
  const privacyUrl = (values["privacy-url"] ?? "").trim();
  const termsUrl = (values["terms-url"] ?? "").trim();
  const accentHex = (values.accent ?? "").trim().toLowerCase();

  // The slug is an internal identifier, never the subdomain (§3.1), but it ends
  // up in logs and URLs, so hold it to the same shape.
  if (!slug) errors.push("--slug is required");
  else if (!DNS_LABEL.test(slug)) errors.push(`--slug must be lowercase alphanumeric with hyphens, got '${slug}'`);

  if (!name) errors.push("--name is required");

  if (!hostname) errors.push("--hostname is required");
  else validateHostname(hostname, errors);

  if (!TIERS.includes(tier as (typeof TIERS)[number])) {
    errors.push(`--tier must be one of ${TIERS.join(" | ")}, got '${tier}'`);
  }

  // PLAN §0.2 item 3: a tenant that cannot show its own support address, privacy
  // policy and terms is not a tenant anyone can ship. The columns are nullable
  // only so the backfill could be written; provisioning is where it is enforced.
  if (!supportEmail) errors.push("--support-email is required (§0.2 item 3)");
  else if (!isEmail(supportEmail)) errors.push(`--support-email is not an email address: '${supportEmail}'`);

  if (!privacyUrl) errors.push("--privacy-url is required (§0.2 item 3)");
  else if (!isHttpUrl(privacyUrl)) errors.push(`--privacy-url is not an http(s) URL: '${privacyUrl}'`);

  if (!termsUrl) errors.push("--terms-url is required (§0.2 item 3)");
  else if (!isHttpUrl(termsUrl)) errors.push(`--terms-url is not an http(s) URL: '${termsUrl}'`);

  if (accentHex && !/^#[0-9a-f]{6}$/i.test(accentHex)) {
    errors.push(`--accent must be a six-digit hex colour like '#1f6feb', got '${accentHex}'`);
  }

  if (errors.length > 0) {
    console.error("Refusing to provision:\n");
    for (const error of errors) console.error(`  ✗ ${error}`);
    console.error(`\n${USAGE}`);
    process.exit(1);
  }

  return {
    slug,
    name,
    hostname,
    tier: tier as (typeof TIERS)[number],
    supportEmail,
    privacyUrl,
    termsUrl,
    accentHex: accentHex || null,
    productName: (values["product-name"] ?? name).trim(),
    productShortName: (values["short-name"] ?? "").trim() || null,
    tagline: (values.tagline ?? "").trim() || null,
    fontKey: (values["font-key"] ?? "instrument-sans").trim(),
  };
}

async function assertNoConflict(options: Options): Promise<void> {
  const bySlug = await db.query.organization.findFirst({
    where: eq(organization.slug, options.slug),
  });
  if (bySlug) {
    console.error(`✗ slug '${options.slug}' already belongs to organization ${bySlug.id} ('${bySlug.name}').`);
    process.exit(1);
  }

  const byHostname = await db.query.organizationDomain.findFirst({
    where: eq(organizationDomain.hostname, options.hostname),
  });
  if (byHostname) {
    console.error(`✗ hostname '${options.hostname}' already resolves to organization ${byHostname.organizationId}.`);
    process.exit(1);
  }
}

async function provision(options: Options): Promise<string> {
  const organizationId = randomUUID();

  // One transaction: an organization with no settings row is a tenant that 500s
  // on its first request.
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      slug: options.slug,
      name: options.name,
      tier: options.tier,
      isDefault: false,
    });

    // The whitelabel defaults, which is what a tenant gets: no advisor CTA, no
    // crypto rail, no free credits — the organization pre-purchases them (D8).
    // signupGrantCredits is written explicitly because the column default is 3.
    await tx.insert(organizationSettings).values({
      organizationId,
      academiaEnabled: true,
      advisorMode: "off",
      advisorBookingUrl: null,
      advisorCostCredits: 100,
      cryptoRailEnabled: false,
      fundAllowlist: null,
      overdraftLimit: 0,
      signupGrantCredits: 0,
    });

    await tx.insert(organizationBranding).values({
      organizationId,
      productName: options.productName,
      productShortName: options.productShortName,
      tagline: options.tagline,
      accentHex: options.accentHex,
      fontKey: options.fontKey,
      supportEmail: options.supportEmail,
      privacyPolicyUrl: options.privacyUrl,
      termsUrl: options.termsUrl,
    });

    await tx.insert(organizationDomain).values({
      id: randomUUID(),
      organizationId,
      hostname: options.hostname,
      isPrimary: true,
    });
  });

  return organizationId;
}

async function main() {
  const options = parseOptions();
  await assertNoConflict(options);

  const organizationId = await provision(options);

  console.log(`✓ organization:          ${options.slug} (${organizationId})`);
  console.log(`✓ organization_settings: whitelabel defaults (advisor off, no crypto rail, 0 signup credits)`);
  console.log(`✓ organization_branding: ${options.productName}`);
  console.log(`✓ organization_domain:   ${options.hostname}`);

  // TODO(whitelabel): create the tenant's first analyst account. Two questions are
  // open in PLAN.md Task 0.9 and both have to be answered before this can be
  // written — do not guess at either:
  //   1. WHICH BETTERAUTH API CREATES THE ACCOUNT, AND HOW THE INITIAL PASSWORD
  //      REACHES THE ANALYST. `emailAndPassword` is enabled (lib/auth.ts), so
  //      credentials live in BetterAuth's `account` table under its own hashing
  //      and cannot be written by hand, and no admin plugin is installed
  //      (`plugins: [expo()]`). Whether `sendOnSignUp` verification is suppressed
  //      or `emailVerified` is pre-set is part of the same decision.
  //   2. WHAT HAPPENS WHEN THE ANALYST ALREADY HAS A D2C ACCOUNT. D3's
  //      `org_member_user_unique` means they cannot simply join a second
  //      organization — and for the first customer that is the normal case, not
  //      the edge case.
  // Until both are settled, the tenant is provisioned with zero members.
  console.log(
    `\nThe tenant has no members yet: analyst-account creation is unresolved (PLAN.md Task 0.9).\n` +
      `Point DNS/TLS at ${options.hostname} and add the organization_member row by hand for now.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.error(`\n${USAGE}`);
  process.exit(1);
});
