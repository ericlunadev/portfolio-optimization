"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { useOnboardingProfile } from "@/hooks/useOnboarding";
import { WizardShell } from "@/components/onboarding/WizardShell";

export default function OnboardingPage() {
  const router = useRouter();
  const tCommon = useTranslations("Common");
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const hasUser = !!session?.user;
  const { data: profile, isLoading } = useOnboardingProfile(hasUser);

  useEffect(() => {
    if (sessionPending) return;
    if (!hasUser) {
      router.replace("/");
      return;
    }
    if (profile?.completedAt) {
      router.replace("/");
    }
  }, [sessionPending, hasUser, profile, router]);

  if (sessionPending || !hasUser || isLoading || !profile || profile.completedAt) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  return <WizardShell initialProfile={profile} />;
}
