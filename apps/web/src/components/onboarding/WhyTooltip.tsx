"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";

export function WhyTooltip({ content }: { content: string }) {
  return <InfoTooltip content={content} className="ml-1" />;
}
