export type TimelineCategory = "SEASON" | "COLLECTION" | "LAB" | "RULE" | "DECISION" | "DELIVERY" | "FOLLOWUP";

export type TimelineReference = { entityType: string; id: string; href: string; label: string };

export type TimelineEvent = {
  id: string;
  category: TimelineCategory;
  occurredAt: string;
  dateBasis: "EVENT" | "REGISTERED";
  seasonId: string | null;
  analysisId: string | null;
  title: string;
  detail: string;
  source: { entityType: string; id: string; href: string };
  responsibleName: string | null;
  rule: { code: string | null; version: string | null; hash: string | null } | null;
  evidenceRefs: TimelineReference[];
  limitations: string[];
};

export type FieldTimeline = {
  fieldId: string;
  events: TimelineEvent[];
  seasons: { id: string; label: string }[];
  undatedCount: number;
};
