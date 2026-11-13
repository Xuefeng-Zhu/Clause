import { useMemo } from "react";

import { ClauseHighlight, ClauseMarginTag } from "./ClauseHighlight";
import {
  buildContractBlocks,
  formatContractDate,
  formatCurrency,
  getRawQuoteForJob,
  stripLegalSuffix,
} from "./clause-format";
import type { ClauseJob } from "./clause-types";

interface ContractDocumentProps {
  job: ClauseJob;
  rawQuoteOverride?: string;
  activeClauseId: string | null;
  onHoverClause: (clauseId: string | null) => void;
  onSelectClause: (clauseId: string) => void;
}

export function ContractDocument({
  job,
  rawQuoteOverride,
  activeClauseId,
  onHoverClause,
  onSelectClause,
}: ContractDocumentProps) {
  const { terms } = job;
  const rawText = useMemo(
    () => rawQuoteOverride ?? getRawQuoteForJob(job),
    [job, rawQuoteOverride],
  );

  const { blocks, unmatchedClauses } = useMemo(
    () => buildContractBlocks(rawText, terms),
    [rawText, terms],
  );

  const shortContractor = stripLegalSuffix(terms.contractor_name);

  return (
    <article
      data-contract-paper="true"
      aria-label={`Contract ${terms.contract_ref}`}
      className="clause-paper-sheet relative rounded-[10px] px-5 py-7 sm:px-9 sm:py-10"
    >
      {/* Document Masthead */}
      <header className="border-b border-[#ECE6DA] pb-6 sm:ps-[3.5rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-stone-400">
          <span>Quote &amp; Service Agreement</span>
          <span className="tabular-nums">{terms.contract_ref}</span>
        </div>

        <h2 className="font-contract-serif mt-2 text-2xl font-normal tracking-[-0.015em] text-stone-900 sm:text-[26px] sm:leading-[1.25]">
          Quote {terms.contract_ref} — {shortContractor}
        </h2>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs text-stone-600 sm:grid-cols-2">
          <div>
            <dt className="inline text-stone-400">Client: </dt>
            <dd className="inline font-medium text-stone-800">
              {terms.client_name}
            </dd>
          </div>
          <div>
            <dt className="inline text-stone-400">Contractor: </dt>
            <dd className="inline font-medium text-stone-800">
              {terms.contractor_name}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="inline text-stone-400">Scope: </dt>
            <dd className="inline text-stone-700">{terms.project}</dd>
          </div>
          <div>
            <dt className="inline text-stone-400">Contract total: </dt>
            <dd className="inline font-semibold tabular-nums text-stone-900">
              {formatCurrency(terms.total_amount, terms.currency)}
            </dd>
          </div>
          {terms.start_date ? (
            <div>
              <dt className="inline text-stone-400">Schedule: </dt>
              <dd className="inline tabular-nums text-stone-700">
                {formatContractDate(terms.start_date)} –{" "}
                {formatContractDate(terms.deadline.date)}
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      {/* Contract Body with Left Margin Clause Gutter */}
      <div className="font-contract-serif mt-6 space-y-3.5 text-[15px] leading-[1.68] text-stone-800">
        {blocks.map((block) => {
          if (block.type === "section_heading") {
            return (
              <div
                key={block.id}
                className="pt-3 first:pt-0 sm:ps-[3.5rem]"
              >
                <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.06em] text-stone-500">
                  {block.segments[0]?.text}
                </h3>
              </div>
            );
          }

          if (block.type === "signature") {
            return (
              <div
                key={block.id}
                className="mt-7 border-t border-[#ECE6DA] pt-5 font-sans text-xs text-stone-500 sm:ps-[3.5rem]"
              >
                {block.segments[0]?.text}
              </div>
            );
          }

          const primaryTag = block.marginClauseIds[0];
          const isBlockActive = Boolean(
            activeClauseId && block.marginClauseIds.includes(activeClauseId),
          );
          const isBlockDimmed = Boolean(
            activeClauseId &&
              block.marginClauseIds.length > 0 &&
              !isBlockActive,
          );

          return (
            <div
              key={block.id}
              className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-2"
            >
              <div className="flex items-center pt-0.5 sm:justify-end sm:pe-1">
                {primaryTag ? (
                  <ClauseMarginTag
                    clauseId={primaryTag}
                    isActive={isBlockActive}
                    isDimmed={isBlockDimmed}
                    onHover={onHoverClause}
                    onSelect={onSelectClause}
                  />
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 flex-1 text-stone-800">
                    {block.segments.map((seg, sIdx) => {
                      if (seg.kind === "plain") {
                        return <span key={sIdx}>{seg.text}</span>;
                      }
                      const cid = seg.entry.clauseId;
                      const isActive = activeClauseId === cid;
                      const isDimmed = Boolean(
                        activeClauseId && activeClauseId !== cid,
                      );
                      return (
                        <ClauseHighlight
                          key={`${cid}-${sIdx}`}
                          clauseId={cid}
                          isActive={isActive}
                          isDimmed={isDimmed}
                          amendedNote={seg.entry.amendedNote}
                          onHover={onHoverClause}
                          onSelect={onSelectClause}
                        >
                          {seg.text}
                        </ClauseHighlight>
                      );
                    })}
                  </p>

                  {block.rightBadge ? (
                    <span className="hidden shrink-0 font-sans text-sm font-medium tabular-nums text-stone-900 md:inline">
                      {block.rightBadge}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {/* Fallback / Addendum section for clauses not verbatim in original quote (e.g. approved Change Order) */}
        {unmatchedClauses.length > 0 ? (
          <div className="mt-6 space-y-3 border-t border-dashed border-[#DFD8C8] pt-5">
            <div className="sm:ps-[3.5rem]">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.06em] text-stone-500">
                Approved Addendum &amp; Referenced Clauses
              </h3>
            </div>
            {unmatchedClauses.map((entry) => {
              const isActive = activeClauseId === entry.clauseId;
              const isDimmed = Boolean(
                activeClauseId && activeClauseId !== entry.clauseId,
              );
              return (
                <div
                  key={entry.clauseId}
                  className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-2"
                >
                  <div className="flex items-center pt-0.5 sm:justify-end sm:pe-1">
                    <ClauseMarginTag
                      clauseId={entry.clauseId}
                      isActive={isActive}
                      isDimmed={isDimmed}
                      onHover={onHoverClause}
                      onSelect={onSelectClause}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1 font-sans text-xs font-medium text-stone-600">
                      {entry.heading}
                    </div>
                    <p className="text-stone-800">
                      <ClauseHighlight
                        clauseId={entry.clauseId}
                        isActive={isActive}
                        isDimmed={isDimmed}
                        amendedNote={entry.amendedNote}
                        onHover={onHoverClause}
                        onSelect={onSelectClause}
                      >
                        “{entry.quote}”
                      </ClauseHighlight>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </article>
  );
}
