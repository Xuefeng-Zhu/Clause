import { type RefObject, useCallback, useEffect, useState } from "react";

import { getClauseTheme } from "./clause-format";

interface ConnectorLine {
  id: string;
  clauseId: string;
  d: string;
  x1: number;
  y1: number;
  stroke: string;
}

interface ConnectorOverlayProps {
  containerRef: RefObject<HTMLDivElement | null>;
  activeClauseId: string | null;
  dependencyKey: string;
}

function buildRoundedElbowPath(
  x1: number,
  y1: number,
  midX: number,
  x2: number,
  y2: number,
): string {
  const dy = y2 - y1;
  if (Math.abs(dy) < 2) {
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  const dir = dy > 0 ? 1 : -1;
  const r = Math.max(
    0,
    Math.min(7, Math.abs(dy) / 2, (midX - x1) / 2, (x2 - midX) / 2),
  );
  if (r < 1.5) {
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${midX.toFixed(1)} ${y1.toFixed(1)} L ${midX.toFixed(1)} ${y2.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return [
    `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `L ${(midX - r).toFixed(1)} ${y1.toFixed(1)}`,
    `Q ${midX.toFixed(1)} ${y1.toFixed(1)} ${midX.toFixed(1)} ${(y1 + dir * r).toFixed(1)}`,
    `L ${midX.toFixed(1)} ${(y2 - dir * r).toFixed(1)}`,
    `Q ${midX.toFixed(1)} ${y2.toFixed(1)} ${(midX + r).toFixed(1)} ${y2.toFixed(1)}`,
    `L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
  ].join(" ");
}

export function ConnectorOverlay({
  containerRef,
  activeClauseId,
  dependencyKey,
}: ConnectorOverlayProps) {
  const [lines, setLines] = useState<ConnectorLine[]>([]);

  const recompute = useCallback(() => {
    const root = containerRef.current;
    if (!root) {
      setLines([]);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const paperEl = root.querySelector<HTMLElement>("[data-contract-paper]");
    if (!paperEl || rootRect.width < 900) {
      setLines([]);
      return;
    }

    const paperRect = paperEl.getBoundingClientRect();
    const dotNodes = Array.from(
      root.querySelectorAll<HTMLElement>("[data-txn-anchor]"),
    );

    if (dotNodes.length === 0) {
      setLines([]);
      return;
    }

    const nextLines: ConnectorLine[] = [];

    dotNodes.forEach((dotEl, idx) => {
      const txnId = dotEl.getAttribute("data-txn-anchor") ?? String(idx);
      const clauseId = dotEl.getAttribute("data-cites-clause")?.trim();
      if (!clauseId) return;

      const escaped =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(clauseId)
          : clauseId.replace(/"/g, '\\"');

      const clauseEl = root.querySelector<HTMLElement>(
        `[data-clause-anchor="${escaped}"]`,
      );
      if (!clauseEl) return;

      const dotRect = dotEl.getBoundingClientRect();
      // Only draw when two-column layout places transaction dots cleanly to the right of paper
      if (paperRect.right >= dotRect.left - 14) return;

      const clientRects = clauseEl.getClientRects();
      const firstLineRect =
        clientRects.length > 0
          ? clientRects[0]!
          : clauseEl.getBoundingClientRect();

      const x1 = firstLineRect.right - rootRect.left + 4;
      const y1 = firstLineRect.top + firstLineRect.height / 2 - rootRect.top;
      const x2 = dotRect.left - rootRect.left - 1;
      const y2 = dotRect.top + dotRect.height / 2 - rootRect.top;

      if (x2 <= x1 + 12) return;

      const gutterBase = paperRect.right - rootRect.left + 14;
      const maxMid = x2 - 10;
      const midX = Math.min(maxMid, gutterBase + (idx % 4) * 5);

      const d = buildRoundedElbowPath(x1, y1, midX, x2, y2);
      const theme = getClauseTheme(clauseId);

      nextLines.push({
        id: `${txnId}-${clauseId}`,
        clauseId,
        d,
        x1,
        y1,
        stroke: theme.stroke,
      });
    });

    setLines(nextLines);
  }, [containerRef]);

  useEffect(() => {
    let rafId = 0;
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recompute);
    };

    schedule();
    const timer = window.setTimeout(schedule, 120);

    const root = containerRef.current;
    const scrollMain = document.querySelector("main.agent-native-app-main");

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    if (ro && root) {
      ro.observe(root);
      const paper = root.querySelector("[data-contract-paper]");
      if (paper) ro.observe(paper);
    }

    window.addEventListener("resize", schedule, { passive: true });
    scrollMain?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timer);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      scrollMain?.removeEventListener("scroll", schedule);
    };
  }, [containerRef, dependencyKey, recompute]);

  if (lines.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full overflow-visible lg:block"
    >
      {lines.map((line) => {
        const isFocused = activeClauseId === line.clauseId;
        const isDimmed = Boolean(
          activeClauseId && activeClauseId !== line.clauseId,
        );
        const opacity = isFocused ? 0.92 : isDimmed ? 0.14 : 0.48;
        const strokeWidth = isFocused ? 1.75 : 1.2;

        return (
          <g
            key={line.id}
            style={{ opacity }}
            className="transition-opacity duration-150"
          >
            <circle cx={line.x1} cy={line.y1} r={2} fill={line.stroke} />
            <path
              d={line.d}
              fill="none"
              stroke={line.stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}
