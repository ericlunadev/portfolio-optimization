"use client";

const MONTHS = [
  { value: 1, label: "Ene" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Abr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Ago" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dic" },
];

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
  const selectClass =
    "rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="w-12 text-sm font-medium">Inicio</label>
        <select
          value={value.startMonth}
          onChange={(e) => onChange({ ...value, startMonth: Number(e.target.value) })}
          className={selectClass}
        >
          {MONTHS.map((m) => (
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

      <div className="flex items-center gap-3">
        <label className="w-12 text-sm font-medium">Fin</label>
        <select
          value={value.endMonth}
          onChange={(e) => onChange({ ...value, endMonth: Number(e.target.value) })}
          className={selectClass}
        >
          {MONTHS.map((m) => (
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
