"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useOnboardingProfile } from "@/hooks/useOnboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const hasUser = !!session?.user;

  const { data: profile, isLoading: profileLoading } = useOnboardingProfile(hasUser);

  useEffect(() => {
    if (sessionPending) return;
    if (!hasUser) return;
    if (profileLoading) return;
    if (profile && !profile.completedAt && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [sessionPending, hasUser, profile, profileLoading, pathname, router]);

  // While we're still deciding for an authenticated user, render nothing to avoid
  // a flash of the app shell before redirecting to onboarding.
  if (hasUser && (profileLoading || (profile && !profile.completedAt))) {
    return null;
  }

  return <>{children}</>;
}
