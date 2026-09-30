"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock, Plus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { ScheduleCard } from "@/components/schedules/ScheduleCard";
import { ScheduleForm } from "@/components/schedules/ScheduleForm";
import { useSimulations } from "@/hooks/useSimulations";
import {
  useCreateSchedule,
  useDeleteSchedule,
  useSchedules,
  useUpdateSchedule,
} from "@/hooks/useSchedules";

export default function SchedulesPage() {
  return (
    <Suspense fallback={null}>
      <SchedulesContent />
    </Suspense>
  );
}

function SchedulesContent() {
  const t = useTranslations("Schedules");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const preselected = searchParams.get("simulation");

  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isSignedIn = !!session?.user;

  const { data: schedules, isLoading } = useSchedules(isSignedIn);
  const { data: simulations } = useSimulations(isSignedIn);
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  // Arriving from a simulation's "schedule this" link opens the form with it ticked.
  const [isCreating, setIsCreating] = useState(!!preselected);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (isSessionPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">{tCommon("loading")}</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <SignInPrompt title={t("signInTitle")} description={t("signInDescription")} />;
  }

  function handleDelete(id: string) {
    if (deletingId === id) {
      deleteSchedule.mutate(id, { onSuccess: () => setDeletingId(null) });
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId((prev) => (prev === id ? null : prev)), 3000);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {!isCreating && (
          <button
            type="button"
            onClick={() => {
              createSchedule.reset();
              setIsCreating(true);
            }}
            className="glow-gold inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            {t("newButton")}
          </button>
        )}
      </div>

      {isCreating && simulations && (
        <ScheduleForm
          simulations={simulations}
          initialSimulationIds={preselected ? [preselected] : []}
          isSaving={createSchedule.isPending}
          error={createSchedule.error}
          onCancel={() => {
            createSchedule.reset();
            setIsCreating(false);
          }}
          onSubmit={async (input) => {
            try {
              await createSchedule.mutateAsync(input);
              setIsCreating(false);
            } catch {
              // Rendered by the form from createSchedule.error.
            }
          }}
        />
      )}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="text-muted-foreground">{t("loadingList")}</div>
        </div>
      ) : !schedules || schedules.length === 0 ? (
        !isCreating && (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center dark:border-border/50 dark:bg-card/30">
            <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground/70">{t("emptyHint")}</p>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onToggleActive={() =>
                updateSchedule.mutate({
                  id: schedule.id,
                  input: { active: !schedule.active },
                })
              }
              isToggling={
                updateSchedule.isPending && updateSchedule.variables?.id === schedule.id
              }
              onDelete={() => handleDelete(schedule.id)}
              isConfirmingDelete={deletingId === schedule.id}
              isDeleting={deleteSchedule.isPending && deletingId === schedule.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
