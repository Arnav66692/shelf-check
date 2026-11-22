import type { Flag, LabelSectionName, Severity } from "../types.ts";

const STOP_SECTIONS: readonly LabelSectionName[] = ["boxed_warning", "contraindications", "do_not_use"];
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { stop: 0, ask: 1, info: 2 };

export function severityForSection(section: LabelSectionName): Severity {
  return STOP_SECTIONS.includes(section) ? "stop" : "ask";
}

export function sortBySeverity(flags: readonly Flag[]): readonly Flag[] {
  return [...flags].sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]);
}
