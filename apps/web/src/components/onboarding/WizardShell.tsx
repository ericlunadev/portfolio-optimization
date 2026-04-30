"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { UserProfile } from "@/lib/api";
import { useCompleteOnboarding, usePatchOnboardingStep } from "@/hooks/useOnboarding";
import { useAutoDetect } from "./useAutoDetect";
import {
  StepLocalization,
  isStep1Valid,
  type Step1Values,
} from "./StepLocalization";
import {
  StepInvestorProfile,
  isStep2Valid,
  type Step2Values,
} from "./StepInvestorProfile";
import {
  StepMarketPreferences,
  isStep3Valid,
  type Step3Values,
} from "./StepMarketPreferences";

const TOTAL_STEPS = 3;

type Step = 1 | 2 | 3;

function clampStep(n: number | undefined | null): Step {
  if (!n || n < 1) return 1;
  if (n > TOTAL_STEPS) return TOTAL_STEPS as Step;
  return n as Step;
}

interface Props {
  initialProfile: UserProfile;
}

export function WizardShell({ initialProfile }: Props) {
  const t = useTranslations("Onboarding");
  const router = useRouter();
  const detected = useAutoDetect();
  const patch = usePatchOnboardingStep();
  const complete = useCompleteOnboarding();

  const [step, setStep] = useState<Step>(() => clampStep(initialProfile.currentStep));
  const [error, setError] = useState<string | null>(null);

  const initialStep1 = useMemo<Step1Values>(
    () => ({
      countryCode: initialProfile.countryCode ?? detected.countryCode,
      currency: initialProfile.currency ?? detected.currency,
    }),
    [initialProfile, detected]
  );
  const initialStep2 = useMemo<Step2Values>(
    () => ({
      experience: initialProfile.experience ?? "",
      horizon: initialProfile.horizon ?? "",
      riskBehavior: initialProfile.riskBehavior ?? "",
      goal: initialProfile.goal ?? "",
    }),
    [initialProfile]
  );
  const initialStep3 = useMemo<Step3Values>(
    () => ({
      marketsOfInterest: initialProfile.marketsOfInterest ?? [],
      conceptFamiliarity: initialProfile.conceptFamiliarity ?? [],
    }),
    [initialProfile]
  );

  const [step1, setStep1] = useState<Step1Values>(initialStep1);
  const [step2, setStep2] = useState<Step2Values>(initialStep2);
  const [step3, setStep3] = useState<Step3Values>(initialStep3);

  const isCurrentValid =
    (step === 1 && isStep1Valid(step1)) ||
    (step === 2 && isStep2Valid(step2)) ||
    (step === 3 && isStep3Valid(step3));

  const isBusy = patch.isPending || complete.isPending;

  const handleNext = async () => {
    setError(null);
    try {
      if (step === 1) {
        await patch.mutateAsync({ step: 1, data: step1 });
        setStep(2);
        return;
      }
      if (step === 2) {
        await patch.mutateAsync({
          step: 2,
          data: {
            experience: step2.experience as Exclude<Step2Values["experience"], "">,
            horizon: step2.horizon as Exclude<Step2Values["horizon"], "">,
            riskBehavior: step2.riskBehavior as Exclude<Step2Values["riskBehavior"], "">,
            goal: step2.goal as Exclude<Step2Values["goal"], "">,
          },
        });
        setStep(3);
        return;
      }
      await patch.mutateAsync({ step: 3, data: step3 });
      await complete.mutateAsync();
      router.replace("/");
    } catch {
      setError(t("errorGeneric"));
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) setStep((step - 1) as Step);
  };

  const progressLabel = t("progress", { current: step, total: TOTAL_STEPS });
  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur md:p-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {progressLabel}
        </p>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {step === 1 && <StepLocalization value={step1} onChange={setStep1} />}
      {step === 2 && <StepInvestorProfile value={step2} onChange={setStep2} />}
      {step === 3 && <StepMarketPreferences value={step3} onChange={setStep3} />}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 1 || isBusy}
          className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          {t("back")}
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!isCurrentValid || isBusy}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 glow-gold"
        >
          {isBusy ? t("saving") : step === TOTAL_STEPS ? t("finish") : t("next")}
        </button>
      </div>
    </div>
  );
}
