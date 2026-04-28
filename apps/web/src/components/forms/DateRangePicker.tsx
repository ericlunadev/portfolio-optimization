"use client";

import { useTranslations } from "next-intl";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1970 + 1 }, (_, i) => 1970 + i);

export interface DateRange {
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const t = useTranslations("Forms.DateRange");

  const months = [
    { value: 1, label: t("monthJan") },
    { value: 2, label: t("monthFeb") },
    { value: 3, label: t("monthMar") },
    { value: 4, label: t("monthApr") },
    { value: 5, label: t("monthMay") },
    { value: 6, label: t("monthJun") },
    { value: 7, label: t("monthJul") },
    { value: 8, label: t("monthAug") },
    { value: 9, label: t("monthSep") },
    { value: 10, label: t("monthOct") },
    { value: 11, label: t("monthNov") },
    { value: 12, label: t("monthDec") },
  ];

  const selectClass =
    "flex-1 min-w-[5rem] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:flex-initial";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="w-12 text-sm font-medium">{t("startLabel")}</label>
        <select
          value={value.startMonth}
          onChange={(e) => onChange({ ...value, startMonth: Number(e.target.value) })}
          className={selectClass}
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={value.startYear}
          onChange={(e) => onChange({ ...value, startYear: Number(e.target.value) })}
          className={selectClass}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="w-12 text-sm font-medium">{t("endLabel")}</label>
        <select
          value={value.endMonth}
          onChange={(e) => onChange({ ...value, endMonth: Number(e.target.value) })}
          className={selectClass}
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={value.endYear}
          onChange={(e) => onChange({ ...value, endYear: Number(e.target.value) })}
          className={selectClass}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
