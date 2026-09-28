"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Lock } from "lucide-react";
import { DEFAULT_ACCENT_HEX } from "@/lib/tenant-palette";
import {
  MAX_LENGTHS,
  formatContrastRatio,
  isDirty,
  previewAccent,
  toForm,
  toRequestBody,
  validateBranding,
  type BrandingFieldError,
  type BrandingFieldKey,
  type BrandingForm,
  type ThemeContrast,
} from "./form";
import { useBrandingSettings, useSaveBranding } from "./queries";

// PLAN Task 1.7 — the tenant's branding settings, for an owner only.
//
// The gate is the server's: `GET /organizations/branding/settings` answers 403
// for a member, and that refusal is what renders the notice below. Nothing here
// reads a role and decides for itself, so a member cannot reach the form by
// getting the client into an odd state.

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

export default function BrandingSettingsPage() {
  const t = useTranslations("BrandingSettings");
  const { data, isLoading, error } = useBrandingSettings();
  const save = useSaveBranding();

  const original = useMemo(() => (data ? toForm(data) : null), [data]);
  const [form, setForm] = useState<BrandingForm | null>(null);

  // The server's row is the source of truth; the boxes are a working copy of it
  // that is reset whenever a fresh row arrives (first load, and after a save).
  useEffect(() => {
    if (original) setForm(original);
  }, [original]);

  if (error?.status === 403) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 dark:border-border/60 dark:bg-card/40">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <h1 className="font-display text-xl tracking-tight">{t("ownerOnlyTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("ownerOnlyBody")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data || !form || !original) {
    return (
      <p className="text-sm text-muted-foreground">
        {error ? t("loadError") : t("loading")}
      </p>
    );
  }

  const errors = validateBranding(form);
  const dirty = isDirty(form, original);
  const canSave = dirty && Object.keys(errors).length === 0 && !save.isPending;

  const set = (key: BrandingFieldKey) => (value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const errorFor = (key: BrandingFieldKey) => {
    const error = errors[key];
    return error ? <FieldError error={error} /> : null;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-3xl tracking-tight">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </header>

      <form
        className="space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) save.mutate(toRequestBody(form));
        }}
      >
        <Section title={t("identityTitle")} subtitle={t("identitySubtitle")}>
          <Field label={t("productName")} help={t("productNameHelp")} error={errorFor("productName")}>
            <input
              type="text"
              className={INPUT_CLASS}
              value={form.productName}
              maxLength={MAX_LENGTHS.productName}
              onChange={(event) => set("productName")(event.target.value)}
            />
          </Field>

          <Field
            label={t("productShortName")}
            help={t("productShortNameHelp")}
            error={errorFor("productShortName")}
          >
            <input
              type="text"
              className={INPUT_CLASS}
              value={form.productShortName}
              maxLength={MAX_LENGTHS.productShortName}
              onChange={(event) => set("productShortName")(event.target.value)}
            />
          </Field>

          <Field label={t("tagline")} help={t("taglineHelp")} error={errorFor("tagline")}>
            <input
              type="text"
              className={INPUT_CLASS}
              value={form.tagline}
              maxLength={MAX_LENGTHS.tagline}
              onChange={(event) => set("tagline")(event.target.value)}
            />
          </Field>
        </Section>

        <Section title={t("appearanceTitle")} subtitle={t("appearanceSubtitle")}>
          <AccentField
            value={form.accentHex}
            onChange={set("accentHex")}
            error={errorFor("accentHex")}
          />

          <Field label={t("font")} help={t("fontHelp")}>
            <select
              className={INPUT_CLASS}
              value={form.fontKey}
              onChange={(event) => set("fontKey")(event.target.value)}
            >
              {/* An unset font is a real state: the column is nullable. */}
              <option value="">—</option>
              {data.fontKeys.map((key) => (
                // Typeface names are proper nouns, not copy to translate.
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 dark:border-border/60 dark:bg-card/20">
            <p className="text-xs font-medium text-foreground/80">{t("logoTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("logoUnavailable")}</p>
          </div>
        </Section>

        <Section title={t("supportTitle")} subtitle={t("supportSubtitle")}>
          <Field
            label={t("supportEmail")}
            help={t("supportEmailHelp")}
            error={errorFor("supportEmail")}
          >
            <input
              type="email"
              className={INPUT_CLASS}
              value={form.supportEmail}
              onChange={(event) => set("supportEmail")(event.target.value)}
            />
          </Field>

          <Field label={t("privacyPolicyUrl")} error={errorFor("privacyPolicyUrl")}>
            <input
              type="url"
              className={INPUT_CLASS}
              value={form.privacyPolicyUrl}
              onChange={(event) => set("privacyPolicyUrl")(event.target.value)}
            />
          </Field>

          <Field label={t("termsUrl")} error={errorFor("termsUrl")}>
            <input
              type="url"
              className={INPUT_CLASS}
              value={form.termsUrl}
              onChange={(event) => set("termsUrl")(event.target.value)}
            />
          </Field>

          <Field
            label={t("disclaimerText")}
            help={t("disclaimerHelp")}
            error={errorFor("disclaimerText")}
          >
            <textarea
              rows={3}
              className={INPUT_CLASS}
              value={form.disclaimerText}
              maxLength={MAX_LENGTHS.disclaimerText}
              onChange={(event) => set("disclaimerText")(event.target.value)}
            />
          </Field>
        </Section>

        <TierNotice tier={data.tier} />

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 dark:border-border/60">
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {save.isPending ? t("saving") : t("save")}
          </button>

          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => setForm(original)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:border-border/60"
          >
            {t("discard")}
          </button>

          {save.isSuccess && !dirty && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">{t("saved")}</span>
          )}
          {save.isError && (
            <span className="text-sm text-rose-600 dark:text-rose-400" role="alert">
              {t("saveError")}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground/90">{label}</span>
      {children}
      {help && <span className="block text-xs text-muted-foreground">{help}</span>}
      {error}
    </label>
  );
}

function FieldError({ error }: { error: BrandingFieldError }) {
  const t = useTranslations("BrandingSettings");
  const message =
    error.key === "tooLong" ? t("tooLong", { max: error.max }) : t(error.key);

  return (
    <span className="block text-xs text-rose-600 dark:text-rose-400" role="alert">
      {message}
    </span>
  );
}

/**
 * The colour picker and its live reading.
 *
 * A native `<input type="color">` alongside a hex box: the picker is how a brand
 * colour is chosen, the box is how one is pasted from a brand guide. The picker
 * cannot represent "unset", so it falls back to showing the house gold while the
 * box is empty — clearing the box, not the picker, is how a tenant gives the
 * accent back.
 */
function AccentField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: React.ReactNode;
}) {
  const t = useTranslations("BrandingSettings");
  const preview = previewAccent(value);

  // Not wrapped in `Field`: that renders a `<label>`, and a label containing a
  // button hands the button's clicks to the first input inside it.
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-foreground/90">{t("accent")}</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t("accent")}
            value={preview?.accent ?? DEFAULT_ACCENT_HEX}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-1"
          />
          <input
            type="text"
            aria-label={t("accent")}
            className={INPUT_CLASS}
            value={value}
            placeholder="#2f6f4f"
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={value.trim() === ""}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:border-border/60"
          >
            {t("accentReset")}
          </button>
        </div>
        <span className="block text-xs text-muted-foreground">{t("accentHelp")}</span>
        {error}
      </div>

      {preview && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 dark:border-border/60 dark:bg-card/40">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("contrastTitle")}
          </p>
          <p className="text-xs text-muted-foreground">{t("contrastNote")}</p>

          <dl className="grid gap-3 sm:grid-cols-2">
            <ContrastRow label={t("contrastLight")} contrast={preview.light} />
            <ContrastRow label={t("contrastDark")} contrast={preview.dark} />
          </dl>

          <div className="flex flex-wrap gap-4 border-t border-border pt-3 dark:border-border/60">
            <Swatch label={t("swatchReport")} colors={[preview.reportGold]} />
            <Swatch
              label={t("swatchChart")}
              colors={[preview.series.light, preview.series.dark]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ContrastRow({ label, contrast }: { label: string; contrast: ThemeContrast }) {
  const t = useTranslations("BrandingSettings");
  const ratio = formatContrastRatio(contrast.ratio);
  const message = !contrast.adjusted
    ? t("contrastOk", { ratio })
    : contrast.direction === "darker"
      ? t("contrastDarkened", { ratio })
      : t("contrastBrightened", { ratio });

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          contrast.adjusted
            ? "text-xs text-amber-700 dark:text-amber-400"
            : "text-xs text-emerald-700 dark:text-emerald-400"
        }
      >
        {message}
      </dd>
    </div>
  );
}

/** Derived colours, shown rather than described — the honest preview. */
function Swatch({ label, colors }: { label: string; colors: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex overflow-hidden rounded-md border border-border dark:border-border/60">
        {colors.map((color) => (
          <span
            key={color}
            className="h-6 w-6"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * The commercial tier, stated and not editable. It is the one thing on this page
 * a tenant would most like to change and the one thing they may not (D14): it is
 * what decides whether their report carries our name.
 */
function TierNotice({ tier }: { tier: string | null }) {
  const t = useTranslations("BrandingSettings");
  if (tier !== "cobranded" && tier !== "whitelabel") return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 dark:border-border/60 dark:bg-card/40">
      <h2 className="text-sm font-medium text-foreground/90">{t("tierTitle")}</h2>
      <p className="mt-1 text-sm text-foreground/80">
        {tier === "cobranded" ? t("tierCobranded") : t("tierWhitelabel")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {tier === "cobranded" ? t("tierCobrandedNote") : t("tierWhitelabelNote")}
      </p>
    </section>
  );
}
