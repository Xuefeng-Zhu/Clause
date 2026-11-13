import { SAMPLE_QUOTE_TEXT } from "@/lib/clause-samples";

import type {
  CardRule,
  ClauseJob,
  ClauseRef,
  ClauseTransaction,
  ContractTerms,
} from "./clause-types";

export interface ClauseTheme {
  highlightBg: string;
  highlightActiveBg: string;
  highlightRing: string;
  tagBg: string;
  tagText: string;
  tagBorder: string;
  stroke: string;
}

type ClauseThemeKey =
  | "payment"
  | "allowed"
  | "prohibited"
  | "schedule"
  | "change"
  | "neutral";

const CLAUSE_THEMES: Record<ClauseThemeKey, ClauseTheme> = {
  payment: {
    highlightBg: "bg-[#F8E6D8]/85",
    highlightActiveBg: "bg-[#F4D5BE]",
    highlightRing: "ring-[#D99B72]",
    tagBg: "bg-[#F5DFCE]",
    tagText: "text-[#7A3B17]",
    tagBorder: "border-[#E8C5AA]",
    stroke: "#B86B43",
  },
  allowed: {
    highlightBg: "bg-[#D9F1E4]/85",
    highlightActiveBg: "bg-[#C2E8D4]",
    highlightRing: "ring-[#5BB389]",
    tagBg: "bg-[#CFEBD9]",
    tagText: "text-[#0F5C3F]",
    tagBorder: "border-[#B2DEC4]",
    stroke: "#1E7E57",
  },
  prohibited: {
    highlightBg: "bg-[#E9E2F6]/85",
    highlightActiveBg: "bg-[#DAD0F0]",
    highlightRing: "ring-[#9D88C9]",
    tagBg: "bg-[#E1D8F2]",
    tagText: "text-[#4A327A]",
    tagBorder: "border-[#CBBCE8]",
    stroke: "#735BA3",
  },
  schedule: {
    highlightBg: "bg-[#F8E1DE]/85",
    highlightActiveBg: "bg-[#F2CEC9]",
    highlightRing: "ring-[#D4847C]",
    tagBg: "bg-[#F3D5D1]",
    tagText: "text-[#7F2D27]",
    tagBorder: "border-[#E5B8B2]",
    stroke: "#B45A52",
  },
  change: {
    highlightBg: "bg-[#DFECF8]/85",
    highlightActiveBg: "bg-[#CBE0F3]",
    highlightRing: "ring-[#7BA7D1]",
    tagBg: "bg-[#D5E5F5]",
    tagText: "text-[#1E4B7A]",
    tagBorder: "border-[#B8D2EB]",
    stroke: "#4676A8",
  },
  neutral: {
    highlightBg: "bg-[#EFECE3]/90",
    highlightActiveBg: "bg-[#E4DFD2]",
    highlightRing: "ring-[#B5AE9E]",
    tagBg: "bg-[#EAE5D9]",
    tagText: "text-[#44403C]",
    tagBorder: "border-[#D6CFC0]",
    stroke: "#78716C",
  },
};

export function getClauseTheme(clauseId?: string | null): ClauseTheme {
  if (!clauseId) return CLAUSE_THEMES.neutral;
  const norm = clauseId.trim();
  if (norm.startsWith("§1") || norm.startsWith("1.")) {
    return CLAUSE_THEMES.payment;
  }
  if (norm === "§2.1" || norm === "2.1") {
    return CLAUSE_THEMES.allowed;
  }
  if (norm.startsWith("§2") || norm.startsWith("2.")) {
    return CLAUSE_THEMES.prohibited;
  }
  if (norm.startsWith("§3") || norm.startsWith("3.")) {
    return CLAUSE_THEMES.schedule;
  }
  if (
    norm.startsWith("§4") ||
    norm.startsWith("4.") ||
    norm.toLowerCase().includes("change")
  ) {
    return CLAUSE_THEMES.change;
  }
  return CLAUSE_THEMES.neutral;
}

export function formatCurrency(amount: number, currency = "USD"): string {
  const hasCents = Math.abs(amount % 1) >= 0.005;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString("en-US", {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function formatSignedDelta(delta: number, currency = "USD"): string {
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(delta), currency)}`;
}

function parseIsoDateLocal(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatContractDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = parseIsoDateLocal(dateStr);
  if (!d) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = parseIsoDateLocal(dateStr);
  if (!d) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45 && diffSec >= -60) return "Just now";
  if (diffSec < 0) return formatContractDate(iso);
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatContractDate(iso);
}

export function stripLegalSuffix(name: string): string {
  return name.replace(/,?\s+\b(LLC|Inc\.?|Corp\.?|Co\.?|Ltd\.?)$/i, "").trim();
}

export function formatJobTitle(client: string, project: string): string {
  const cleanClient = stripLegalSuffix(client);
  let cleanProject = project.replace(/\s*\([^)]*\)\s*/g, "").trim();
  cleanProject = cleanProject.replace(/^back-of-house\s+/i, "");
  if (cleanProject.length > 0) {
    cleanProject = cleanProject[0]!.toUpperCase() + cleanProject.slice(1);
  }
  return cleanProject ? `${cleanClient} — ${cleanProject}` : cleanClient;
}

export function formatCardLast4(cardId?: string | null): string {
  if (!cardId) return "••••";
  const digitsOnly = cardId.replace(/\D/g, "");
  if (digitsOnly.length >= 4) {
    return digitsOnly.slice(-4);
  }
  let hash = 2166136261;
  for (let i = 0; i < cardId.length; i++) {
    hash ^= cardId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = (Math.abs(hash) % 9000) + 1000;
  return String(num);
}

export function formatMilestoneNumber(milestoneId: string): string {
  const m = /^M(\d+)$/i.exec(milestoneId.trim());
  return m ? `Milestone ${m[1]}` : milestoneId;
}

export function humanizeEvidenceKind(kind: string): string {
  switch (kind) {
    case "photos":
      return "Site photos";
    case "inspection_report":
      return "Inspection report";
    case "invoice":
      return "Supplier invoice";
    case "walkthrough_signoff":
      return "Walkthrough sign-off";
    default:
      return kind.replace(/_/g, " ");
  }
}

export function humanizeSpendCategory(cat: string): string {
  switch (cat) {
    case "building_materials":
      return "building materials";
    case "lumber":
      return "lumber";
    case "hardware":
      return "hardware";
    case "plumbing_supplies":
      return "plumbing";
    case "electrical_supplies":
      return "electrical";
    case "paint_glass":
      return "paint & glass";
    case "home_improvement_warehouse":
      return "supply warehouses";
    default:
      return cat.replace(/_/g, " ");
  }
}

export function humanizeDeclineReason(failureReason?: string): string {
  switch (failureReason) {
    case "MERCHANT_CATEGORY_NOT_ALLOWED":
      return "Not a building-supply merchant";
    case "LIMIT_EXCEEDED":
      return "Over released limit";
    case "OUT_OF_ALLOWED_TIME_RANGE":
      return "After contract deadline";
    case "CURRENCY_NOT_ALLOWED":
      return "Outside contract currency";
    case "CARD_INACTIVE":
      return "Card is frozen";
    case "CARD_CLOSED":
      return "Card is closed";
    case "INSUFFICIENT_FUNDS":
      return "Insufficient wallet balance";
    default:
      return failureReason ? "Declined by card control" : "Approved";
  }
}

export function resolveTransactionClauseId(
  txn: ClauseTransaction,
  terms: ContractTerms,
): string | undefined {
  if (txn.failure_reason) {
    return txn.explanation?.clause_id;
  }
  return terms.allowed_spend.clause.clause_id;
}

export function cleanVerdictReasoning(reasoning?: string): string {
  if (!reasoning) return "";
  return reasoning
    .replace(/\s*\(offline evaluator\)\.?/gi, ".")
    .replace(/\s*\(offline rule:[^)]*\)\.?/gi, ".")
    .replace(/\.\.$/, ".")
    .trim();
}

export interface PlainControlItem {
  id: string;
  label: string;
  detail: string;
  clauseId: string;
  clauseQuote: string;
  technicalTooltip: string;
}

export function derivePlainControls(
  terms: ContractTerms,
  rules: CardRule[],
  releasedMilestoneIds: string[],
): PlainControlItem[] {
  if (rules.length > 0) {
    const items: PlainControlItem[] = [];
    for (const r of rules) {
      if (r.control === "currency") continue;
      if (r.control === "limit") {
        const releasedList = releasedMilestoneIds.length
          ? releasedMilestoneIds.join(" + ")
          : "M1";
        const releasedSum = terms.milestones
          .filter((m) => releasedMilestoneIds.includes(m.id))
          .reduce((s, m) => s + m.amount, 0);
        items.push({
          id: "limit",
          label: `Spend capped at ${formatCurrency(releasedSum, terms.currency)}`,
          detail: `Released: ${releasedList} of ${formatCurrency(terms.total_amount, terms.currency)}`,
          clauseId: r.clause.clause_id,
          clauseQuote: r.clause.quote,
          technicalTooltip: `ALL_TIME limit: ${r.value} · Decline code: ${r.declines.join(", ")}`,
        });
      } else if (r.control === "merchant_categories") {
        items.push({
          id: "merchant_categories",
          label: "Building-supply merchants only",
          detail: terms.allowed_spend.categories
            .slice(0, 4)
            .map(humanizeSpendCategory)
            .join(", "),
          clauseId: r.clause.clause_id,
          clauseQuote: r.clause.quote,
          technicalTooltip: `Allowed MCCs: ${r.value} · Decline code: ${r.declines.join(", ")}`,
        });
      } else if (r.control === "time_window") {
        items.push({
          id: "time_window",
          label: `Active through ${formatContractDate(terms.deadline.date)}`,
          detail: "Automatic cutoff at end of deadline day",
          clauseId: r.clause.clause_id,
          clauseQuote: r.clause.quote,
          technicalTooltip: `active_to: ${r.value} · Decline code: ${r.declines.join(", ")}`,
        });
      }
    }
    if (terms.prohibited_spend) {
      items.splice(2, 0, {
        id: "prohibited_spend",
        label: "Meals, travel, fuel & tools blocked",
        detail: terms.prohibited_spend.description,
        clauseId: terms.prohibited_spend.clause.clause_id,
        clauseQuote: terms.prohibited_spend.clause.quote,
        technicalTooltip:
          "Excluded from merchant category allowlist · Decline code: MERCHANT_CATEGORY_NOT_ALLOWED",
      });
    }
    return items;
  }

  // Preview controls for draft jobs before card issuance
  const signingMilestones = terms.milestones.filter(
    (m) => m.released_on_signing,
  );
  const openingAmount = signingMilestones.reduce((s, m) => s + m.amount, 0);
  const openingClause =
    signingMilestones[signingMilestones.length - 1]?.clause ??
    terms.milestones[0]?.clause ?? { clause_id: "§1.1", quote: "" };

  const preview: PlainControlItem[] = [
    {
      id: "limit",
      label: `Opening limit ${formatCurrency(openingAmount, terms.currency)}`,
      detail: `${signingMilestones.map((m) => m.id).join(" + ") || "M1"} released on signing (${formatCurrency(terms.total_amount, terms.currency)} total)`,
      clauseId: openingClause.clause_id,
      clauseQuote: openingClause.quote,
      technicalTooltip: `ALL_TIME limit at issuance: ${terms.currency} ${openingAmount.toLocaleString("en-US")} · LIMIT_EXCEEDED`,
    },
    {
      id: "merchant_categories",
      label: "Building-supply merchants only",
      detail: terms.allowed_spend.categories
        .slice(0, 4)
        .map(humanizeSpendCategory)
        .join(", "),
      clauseId: terms.allowed_spend.clause.clause_id,
      clauseQuote: terms.allowed_spend.clause.quote,
      technicalTooltip: `Mapped deterministically to building-supply MCCs · MERCHANT_CATEGORY_NOT_ALLOWED`,
    },
  ];

  if (terms.prohibited_spend) {
    preview.push({
      id: "prohibited_spend",
      label: "Meals, travel, fuel & tools blocked",
      detail: terms.prohibited_spend.description,
      clauseId: terms.prohibited_spend.clause.clause_id,
      clauseQuote: terms.prohibited_spend.clause.quote,
      technicalTooltip:
        "Excluded from MCC allowlist · MERCHANT_CATEGORY_NOT_ALLOWED",
    });
  }

  preview.push({
    id: "time_window",
    label: `Expires ${formatContractDate(terms.deadline.date)}`,
    detail: "No charges permitted after completion cutoff",
    clauseId: terms.deadline.clause.clause_id,
    clauseQuote: terms.deadline.clause.quote,
    technicalTooltip: `active_to: ${terms.deadline.date}T23:59:59 · OUT_OF_ALLOWED_TIME_RANGE`,
  });

  return preview;
}

export interface ExtractedClauseEntry {
  clauseId: string;
  quote: string;
  heading: string;
  rightBadge?: string;
  amendedNote?: string;
}

export function collectExtractedClauses(
  terms: ContractTerms,
): ExtractedClauseEntry[] {
  const list: ExtractedClauseEntry[] = [];
  for (const m of terms.milestones) {
    const formattedAmt = formatCurrency(m.amount, terms.currency);
    const quoteHasCurrentAmount = m.clause.quote.includes(
      m.amount.toLocaleString("en-US"),
    );
    list.push({
      clauseId: m.clause.clause_id,
      quote: m.clause.quote,
      heading: `${m.id} · ${m.name}`,
      rightBadge: formattedAmt,
      ...(quoteHasCurrentAmount
        ? {}
        : { amendedNote: `Amended to ${formattedAmt}` }),
    });
  }
  list.push({
    clauseId: terms.allowed_spend.clause.clause_id,
    quote: terms.allowed_spend.clause.quote,
    heading: "Permitted spend",
  });
  if (terms.prohibited_spend) {
    list.push({
      clauseId: terms.prohibited_spend.clause.clause_id,
      quote: terms.prohibited_spend.clause.quote,
      heading: "Prohibited spend",
    });
  }
  list.push({
    clauseId: terms.deadline.clause.clause_id,
    quote: terms.deadline.clause.quote,
    heading: `Completion cutoff · ${formatContractDate(terms.deadline.date)}`,
  });
  if (terms.change_order_clause) {
    list.push({
      clauseId: terms.change_order_clause.clause_id,
      quote: terms.change_order_clause.quote,
      heading: "Change orders",
    });
  }
  return list;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWhitespaceTolerantSpan(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;
  const pattern = trimmed
    .split(/\s+/)
    .map((tok) => escapeRegex(tok).replace(/[-–—]/g, "[-–—]"))
    .join("\\s+");
  const re = new RegExp(pattern, "i");
  const match = re.exec(haystack);
  if (!match || match.index === undefined) return null;
  return { start: match.index, end: match.index + match[0].length };
}

export type DocumentSegment =
  | { kind: "plain"; text: string }
  | {
      kind: "clause";
      text: string;
      entry: ExtractedClauseEntry;
    };

export interface DocumentBlock {
  id: string;
  type: "section_heading" | "clause_paragraph" | "body_paragraph" | "signature";
  marginClauseIds: string[];
  rightBadge?: string;
  amendedNote?: string;
  segments: DocumentSegment[];
}

const RAW_QUOTE_STORAGE_PREFIX = "clause.rawQuote:";

export function saveRawQuoteForJob(jobId: string, rawQuote: string): void {
  try {
    window.localStorage.setItem(
      `${RAW_QUOTE_STORAGE_PREFIX}${jobId}`,
      rawQuote,
    );
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function getRawQuoteForJob(job: ClauseJob): string {
  try {
    const stored = window.localStorage.getItem(
      `${RAW_QUOTE_STORAGE_PREFIX}${job.id}`,
    );
    if (stored && stored.trim()) return stored;
  } catch {
    // Ignore storage errors
  }
  if (job.terms.contract_ref === "Q-2026-0412") {
    return SAMPLE_QUOTE_TEXT;
  }
  return synthesizeQuoteDocument(job.terms);
}

function synthesizeQuoteDocument(terms: ContractTerms): string {
  const lines: string[] = [
    `${terms.contractor_name.toUpperCase()}`,
    "",
    `QUOTE & SERVICE AGREEMENT  No. ${terms.contract_ref}`,
    `Client: ${terms.client_name}`,
    `Project: ${terms.project}`,
    "",
    `Total contract price: ${terms.currency} ${terms.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    "",
    "§1 Payment schedule",
    ...terms.milestones.map(
      (m) => `  ${m.clause.clause_id.replace(/^§/, "")} ${m.clause.quote}`,
    ),
    "",
    "§2 Use of funds",
    `  ${terms.allowed_spend.clause.clause_id.replace(/^§/, "")} ${terms.allowed_spend.clause.quote}`,
    ...(terms.prohibited_spend
      ? [
          `  ${terms.prohibited_spend.clause.clause_id.replace(/^§/, "")} ${terms.prohibited_spend.clause.quote}`,
        ]
      : []),
    "",
    "§3 Schedule",
    ...(terms.start_date ? [`  3.1 Work begins ${terms.start_date}.`] : []),
    `  ${terms.deadline.clause.clause_id.replace(/^§/, "")} ${terms.deadline.clause.quote}`,
    ...(terms.change_order_clause
      ? [
          "",
          "§4 Change orders",
          `  ${terms.change_order_clause.clause_id.replace(/^§/, "")} ${terms.change_order_clause.quote}`,
        ]
      : []),
  ];
  return lines.join("\n");
}

function unwrapBodyParagraphs(rawText: string): string[] {
  const rawLines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\s*\(synthetic\)/gi, "")
    .split("\n");

  // Drop top preamble header lines that are already rendered cleanly in the paper masthead
  const bodyLines: string[] = [];
  let seenFirstSection = false;
  for (const line of rawLines) {
    const t = line.trim();
    if (/^§\d+\b/.test(t)) {
      seenFirstSection = true;
    }
    if (!seenFirstSection) continue;
    bodyLines.push(line);
  }

  const source = bodyLines.length > 0 ? bodyLines : rawLines;
  const paragraphs: string[] = [];
  let current = "";

  for (const line of source) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) {
        paragraphs.push(current);
        current = "";
      }
      continue;
    }
    const isSectionHeading = /^§\d+\b/.test(trimmed);
    const isNumberedClause = /^\d+\.\d+\b/.test(trimmed);
    const isSignature = /^Contractor:/i.test(trimmed);
    const isContinuation = /^\s{4,}\S/.test(line) && !isNumberedClause;

    if (isSectionHeading || isSignature) {
      if (current) {
        paragraphs.push(current);
        current = "";
      }
      paragraphs.push(trimmed);
    } else if (isNumberedClause) {
      if (current) {
        paragraphs.push(current);
      }
      current = trimmed;
    } else if (isContinuation && current) {
      current = `${current} ${trimmed}`;
    } else if (current) {
      current = `${current} ${trimmed}`;
    } else {
      current = trimmed;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

export function buildContractBlocks(
  rawText: string,
  terms: ContractTerms,
): {
  blocks: DocumentBlock[];
  unmatchedClauses: ExtractedClauseEntry[];
} {
  const clauses = collectExtractedClauses(terms);
  const matchedClauseIds = new Set<string>();
  const paragraphs = unwrapBodyParagraphs(rawText);
  const blocks: DocumentBlock[] = [];

  paragraphs.forEach((para, idx) => {
    if (/^§\d+\b/.test(para)) {
      blocks.push({
        id: `sec-${idx}`,
        type: "section_heading",
        marginClauseIds: [],
        segments: [{ kind: "plain", text: para }],
      });
      return;
    }

    if (/^Contractor:/i.test(para)) {
      blocks.push({
        id: `sig-${idx}`,
        type: "signature",
        marginClauseIds: [],
        segments: [{ kind: "plain", text: para }],
      });
      return;
    }

    // Find all clause matches inside this paragraph
    const spans: Array<{
      start: number;
      end: number;
      entry: ExtractedClauseEntry;
    }> = [];

    for (const entry of clauses) {
      if (matchedClauseIds.has(entry.clauseId)) continue;
      const found = findWhitespaceTolerantSpan(para, entry.quote);
      if (found) {
        // Strip leading "1.1 " prefix into the highlight if immediately preceding
        let start = found.start;
        const prefix = para.slice(0, start);
        if (/^\d+\.\d+\s+$/.test(prefix)) {
          start = 0;
        }
        spans.push({ start, end: found.end, entry });
        matchedClauseIds.add(entry.clauseId);
      }
    }

    spans.sort((a, b) => a.start - b.start);

    if (spans.length === 0) {
      blocks.push({
        id: `p-${idx}`,
        type: "body_paragraph",
        marginClauseIds: [],
        segments: [{ kind: "plain", text: para }],
      });
      return;
    }

    const segments: DocumentSegment[] = [];
    let cursor = 0;
    for (const sp of spans) {
      if (sp.start > cursor) {
        segments.push({ kind: "plain", text: para.slice(cursor, sp.start) });
      }
      segments.push({
        kind: "clause",
        text: para.slice(sp.start, sp.end),
        entry: sp.entry,
      });
      cursor = sp.end;
    }
    if (cursor < para.length) {
      segments.push({ kind: "plain", text: para.slice(cursor) });
    }

    const primary = spans[0]!.entry;
    blocks.push({
      id: `clause-${idx}-${primary.clauseId}`,
      type: "clause_paragraph",
      marginClauseIds: spans.map((s) => s.entry.clauseId),
      ...(primary.rightBadge ? { rightBadge: primary.rightBadge } : {}),
      ...(primary.amendedNote ? { amendedNote: primary.amendedNote } : {}),
      segments,
    });
  });

  const unmatchedClauses = clauses.filter(
    (c) => !matchedClauseIds.has(c.clauseId),
  );
  return { blocks, unmatchedClauses };
}
