import { ActionForm } from "@/components/action-form";
import { Input, Select } from "@/components/ui/form-controls";
import { captureIdeaAction } from "../server/actions";

/** One-line idea capture: title and pillar. */
export function IdeaCapture({ pillars }: { pillars: { id: string; name: string }[] }) {
  return (
    <ActionForm action={captureIdeaAction} submitLabel="Save idea" inline className="flex-wrap sm:flex-nowrap">
      <Input name="title" required maxLength={300} placeholder="Content idea…" aria-label="Idea" className="min-w-0 flex-1 basis-full sm:basis-auto" />
      <Select name="pillarId" defaultValue="" aria-label="Pillar" className="w-auto min-w-0 flex-1 sm:w-56 sm:flex-none">
        <option value="">No pillar</option>
        {pillars.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </ActionForm>
  );
}
