"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui/form-controls";

/** A select that saves as soon as it changes (one tap on mobile). */
export function AutoSubmitSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
