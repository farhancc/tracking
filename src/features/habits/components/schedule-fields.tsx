import { Field, Input, Select } from "@/components/ui/form-controls";
import { WEEKDAY_SHORT } from "@/lib/domain/habits";

/** Schedule: specific weekdays, or N times a week on any days. */
export function ScheduleFields({ idPrefix, kind = "days", days = [0, 1, 2, 3, 4, 5, 6], weeklyTarget }: { idPrefix: string; kind?: string; days?: number[]; weeklyTarget?: number | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Schedule" htmlFor={`${idPrefix}-kind`}>
        <Select id={`${idPrefix}-kind`} name="scheduleKind" defaultValue={kind}>
          <option value="days">On these days</option>
          <option value="weekly">A number of times a week</option>
        </Select>
      </Field>
      <Field label="Times a week (weekly schedule)" htmlFor={`${idPrefix}-target`}>
        <Input id={`${idPrefix}-target`} name="weeklyTarget" type="number" min="1" max="7" inputMode="numeric" defaultValue={weeklyTarget ?? ""} />
      </Field>
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-sm sm:col-span-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">Days (for &ldquo;on these days&rdquo;)</legend>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <label key={d} className="flex items-center gap-1.5">
            <input type="checkbox" name="scheduleDays" value={d} defaultChecked={days.includes(d)} />
            {WEEKDAY_SHORT[d]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
