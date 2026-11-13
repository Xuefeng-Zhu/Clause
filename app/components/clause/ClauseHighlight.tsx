import { cn } from "@/lib/utils";

import { getClauseTheme } from "./clause-format";

interface ClauseMarginTagProps {
  clauseId: string;
  isActive: boolean;
  isDimmed: boolean;
  onHover: (clauseId: string | null) => void;
  onSelect: (clauseId: string) => void;
}

export function ClauseMarginTag({
  clauseId,
  isActive,
  isDimmed,
  onHover,
  onSelect,
}: ClauseMarginTagProps) {
  const theme = getClauseTheme(clauseId);
  const displayTag = clauseId.startsWith("§")
    ? clauseId
    : clauseId.toLowerCase().includes("change")
      ? "CO"
      : clauseId;

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(clauseId)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(clauseId)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(clauseId)}
      title={clauseId}
      className={cn(
        "inline-flex h-5 min-w-[2.4rem] items-center justify-center rounded-md border px-1.5 font-sans text-[11px] font-semibold tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45",
        theme.tagBg,
        theme.tagText,
        theme.tagBorder,
        isActive && "scale-[1.04] shadow-xs ring-1 ring-stone-900/15",
        isDimmed && "opacity-55",
      )}
    >
      {displayTag}
    </button>
  );
}

interface ClauseHighlightProps {
  clauseId: string;
  children: React.ReactNode;
  isActive: boolean;
  isDimmed: boolean;
  amendedNote?: string | undefined;
  onHover: (clauseId: string | null) => void;
  onSelect: (clauseId: string) => void;
}

export function ClauseHighlight({
  clauseId,
  children,
  isActive,
  isDimmed,
  amendedNote,
  onHover,
  onSelect,
}: ClauseHighlightProps) {
  const theme = getClauseTheme(clauseId);

  return (
    <span
      role="button"
      tabIndex={0}
      data-clause-anchor={clauseId}
      onMouseEnter={() => onHover(clauseId)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(clauseId)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(clauseId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(clauseId);
        }
      }}
      className={cn(
        "cursor-pointer rounded-[4px] box-decoration-clone px-1.5 py-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45",
        isActive ? theme.highlightActiveBg : theme.highlightBg,
        isActive && cn("ring-1", theme.highlightRing),
        isDimmed && "opacity-65",
      )}
    >
      {children}
      {amendedNote ? (
        <span className="ms-2 inline-flex items-center rounded bg-white/85 px-1.5 py-0.5 align-middle font-sans text-[10px] font-semibold tracking-normal text-[#1E4B7A] ring-1 ring-[#B8D2EB]">
          {amendedNote}
        </span>
      ) : null}
    </span>
  );
}
