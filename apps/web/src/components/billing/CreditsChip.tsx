"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { useWallet } from "@/hooks/useBilling";
import { authClient } from "@/lib/auth-client";

export function CreditsChip() {
  const t = useTranslations("Billing");
  const { data: session } = authClient.useSession();
  const { data, isLoading } = useWallet(!!session?.user);

  if (!session?.user) return null;

  return (
    <Link
      href="/billing"
      className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-xs font-medium text-foreground/80 transition-colors hover:bg-card/80"
      aria-label={t("chipAria")}
    >
      <Coins className="h-3.5 w-3.5 text-amber-400" />
      <span className="tabular-nums">{isLoading ? "…" : data?.credits ?? 0}</span>
    </Link>
  );
}
