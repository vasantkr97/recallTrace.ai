import { z } from "zod";

export const canonicalPredicateSchema = z.enum([
  "preferred_theme",
  "employer",
  "current_city",
  "destination_city",
  "active_project",
  "goal"
]);

export const claimStatusSchema = z.enum([
  "current",
  "superseded",
  "contested",
  "supporting",
  "duplicate"
]);

export const memoryDecisionSchema = z.enum([
  "NEW",
  "SUPERSEDES",
  "CONTRADICTS",
  "SUPPORTS",
  "DUPLICATES"
]);

export const extractedClaimSchema = z.object({
  predicate: canonicalPredicateSchema,
  label: z.string().min(1),
  value: z.string().min(1).max(500),
  observedAt: z.iso.datetime({ offset: true }),
  sourceMessageIndex: z.number().int().nonnegative()
});

export type CanonicalPredicate = z.infer<typeof canonicalPredicateSchema>;
export type ClaimStatus = z.infer<typeof claimStatusSchema>;
export type MemoryDecision = z.infer<typeof memoryDecisionSchema>;
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>;

export const slotLabels: Record<CanonicalPredicate, string> = {
  preferred_theme: "Preferred theme",
  employer: "Employer",
  current_city: "Current city",
  destination_city: "Moving to",
  active_project: "Active project",
  goal: "Goal"
};
