/**
 * The success criteria a conformance claim is made of.
 *
 * WCAG 2.2 levels A and AA, which is the bar the European Accessibility Act
 * inherits through EN 301 549. Level AAA is not here: nobody claims it for a
 * whole product, and listing it would invite a claim nobody can keep.
 */

export type Level = "A" | "AA";

export type Criterion = {
  readonly id: string;
  readonly name: string;
  readonly level: Level;
  /** WCAG 2.2 added and removed criteria; this records which version applies. */
  readonly since: "2.0" | "2.1" | "2.2";
};

/**
 * WCAG 2.2 levels A and AA — 55 criteria in the published recommendation.
 *
 * 4.1.1 Parsing is deliberately absent: it was removed in WCAG 2.2 and always
 * passes. Including it would inflate a conformance report with a criterion that
 * cannot fail.
 */
export const CRITERIA: readonly Criterion[] = [
  { id: "1.1.1", name: "Non-text Content", level: "A", since: "2.0" },
  { id: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", since: "2.0" },
  { id: "1.2.2", name: "Captions (Prerecorded)", level: "A", since: "2.0" },
  { id: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A", since: "2.0" },
  { id: "1.2.4", name: "Captions (Live)", level: "AA", since: "2.0" },
  { id: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", since: "2.0" },
  { id: "1.3.1", name: "Info and Relationships", level: "A", since: "2.0" },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A", since: "2.0" },
  { id: "1.3.3", name: "Sensory Characteristics", level: "A", since: "2.0" },
  { id: "1.3.4", name: "Orientation", level: "AA", since: "2.1" },
  { id: "1.3.5", name: "Identify Input Purpose", level: "AA", since: "2.1" },
  { id: "1.4.1", name: "Use of Color", level: "A", since: "2.0" },
  { id: "1.4.2", name: "Audio Control", level: "A", since: "2.0" },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA", since: "2.0" },
  { id: "1.4.4", name: "Resize Text", level: "AA", since: "2.0" },
  { id: "1.4.5", name: "Images of Text", level: "AA", since: "2.0" },
  { id: "1.4.10", name: "Reflow", level: "AA", since: "2.1" },
  { id: "1.4.11", name: "Non-text Contrast", level: "AA", since: "2.1" },
  { id: "1.4.12", name: "Text Spacing", level: "AA", since: "2.1" },
  { id: "1.4.13", name: "Content on Hover or Focus", level: "AA", since: "2.1" },
  { id: "2.1.1", name: "Keyboard", level: "A", since: "2.0" },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A", since: "2.0" },
  { id: "2.1.4", name: "Character Key Shortcuts", level: "A", since: "2.1" },
  { id: "2.2.1", name: "Timing Adjustable", level: "A", since: "2.0" },
  { id: "2.2.2", name: "Pause, Stop, Hide", level: "A", since: "2.0" },
  { id: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", since: "2.0" },
  { id: "2.4.1", name: "Bypass Blocks", level: "A", since: "2.0" },
  { id: "2.4.2", name: "Page Titled", level: "A", since: "2.0" },
  { id: "2.4.3", name: "Focus Order", level: "A", since: "2.0" },
  { id: "2.4.4", name: "Link Purpose (In Context)", level: "A", since: "2.0" },
  { id: "2.4.5", name: "Multiple Ways", level: "AA", since: "2.0" },
  { id: "2.4.6", name: "Headings and Labels", level: "AA", since: "2.0" },
  { id: "2.4.7", name: "Focus Visible", level: "AA", since: "2.0" },
  { id: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA", since: "2.2" },
  { id: "2.5.1", name: "Pointer Gestures", level: "A", since: "2.1" },
  { id: "2.5.2", name: "Pointer Cancellation", level: "A", since: "2.1" },
  { id: "2.5.3", name: "Label in Name", level: "A", since: "2.1" },
  { id: "2.5.4", name: "Motion Actuation", level: "A", since: "2.1" },
  { id: "2.5.7", name: "Dragging Movements", level: "AA", since: "2.2" },
  { id: "2.5.8", name: "Target Size (Minimum)", level: "AA", since: "2.2" },
  { id: "3.1.1", name: "Language of Page", level: "A", since: "2.0" },
  { id: "3.1.2", name: "Language of Parts", level: "AA", since: "2.0" },
  { id: "3.2.1", name: "On Focus", level: "A", since: "2.0" },
  { id: "3.2.2", name: "On Input", level: "A", since: "2.0" },
  { id: "3.2.3", name: "Consistent Navigation", level: "AA", since: "2.0" },
  { id: "3.2.4", name: "Consistent Identification", level: "AA", since: "2.0" },
  { id: "3.2.6", name: "Consistent Help", level: "A", since: "2.2" },
  { id: "3.3.1", name: "Error Identification", level: "A", since: "2.0" },
  { id: "3.3.2", name: "Labels or Instructions", level: "A", since: "2.0" },
  { id: "3.3.3", name: "Error Suggestion", level: "AA", since: "2.0" },
  { id: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", since: "2.0" },
  { id: "3.3.7", name: "Redundant Entry", level: "A", since: "2.2" },
  { id: "3.3.8", name: "Accessible Authentication (Minimum)", level: "AA", since: "2.2" },
  { id: "4.1.2", name: "Name, Role, Value", level: "A", since: "2.0" },
  { id: "4.1.3", name: "Status Messages", level: "AA", since: "2.1" },
] as const;

const byId = new Map(CRITERIA.map((criterion) => [criterion.id, criterion]));

export function criterion(id: string): Criterion | undefined {
  return byId.get(id);
}

/** The criteria a claim at this level has to cover: AA includes A. */
export function criteriaFor(level: Level): readonly Criterion[] {
  return level === "A" ? CRITERIA.filter((c) => c.level === "A") : CRITERIA;
}

/**
 * How much of WCAG an automated tool can settle.
 *
 * Automated checks find roughly a quarter to a third of accessibility problems.
 * That is not a criticism of the tools — most criteria are about meaning, and a
 * machine cannot tell whether alt text describes the image. This map records
 * which criteria a scanner can decide on its own, so a report can show how much
 * of a claim is still resting on nobody having looked.
 */
export const AUTOMATABLE: ReadonlySet<string> = new Set([
  "1.3.1",
  "1.4.3",
  "1.4.11",
  "2.4.2",
  "3.1.1",
  "3.1.2",
  "4.1.2",
]);
