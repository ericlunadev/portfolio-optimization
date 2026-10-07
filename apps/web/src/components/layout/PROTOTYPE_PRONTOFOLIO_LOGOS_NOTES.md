# PROTOTYPE — Prontofolio logo concepts

**Question:** what should the Prontofolio logo look like?

Run `pnpm --filter web dev` and open any app page with `?logo=A`…`E` (no param = the
current tenant wordmark). Cycle with the floating bar or the ←/→ keys. The full mark shows in
the Sidebar; the phone header (<768px) shows the compact one.

| key | concept | idea |
| --- | --- | --- |
| A | Frontier P | "P" whose bowl is the efficient frontier; the dot is the optimal portfolio |
| B | Two-tone type | no symbol — light "pronto" + bold accent "folio" |
| C | Allocation donut | weighted ring of portfolio slices + lowercase name |
| D | Pronto (speed) | italic, speed lines, final "o" becomes an up-right arrow |
| E | Monogram tile | app-icon "Pf" tile + stacked tracked caps |

All colours come from tokens (`--primary`, `--gradient-gold-*`), so they follow the tenant's
accent and both themes.

**Verdict:** _TBD — pick one (or "mark from X + type from Y")._

**Cleanup once decided:** delete `PrototypeProntofolioLogos.tsx`, `ui/PrototypeSwitcher.tsx`,
this file, and the `PrototypeLogo` / `ProntofolioLogoSwitcher` hook-ins in `Sidebar.tsx`,
`Header.tsx` and `app/(app)/layout.tsx`. The winner ships as tenant data (`logoUrl` /
`organization_branding`), not hardcoded — see CLAUDE.md.
