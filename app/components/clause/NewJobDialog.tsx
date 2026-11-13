import {
  IconArrowRight,
  IconCheck,
  IconFileText,
  IconLoader2,
  IconSparkles,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SAMPLE_QUOTE_TEXT } from "@/lib/clause-samples";
import { cn } from "@/lib/utils";

interface QuoteIntakeFormProps {
  quoteText: string;
  onQuoteTextChange: (text: string) => void;
  onParse: () => void;
  busy: boolean;
  mountParseId: boolean;
}

function StepPillRow() {
  return (
    <div
      aria-label="Card setup steps"
      className="flex flex-wrap items-center gap-2 text-xs text-stone-500"
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-stone-900">
        <span className="flex size-4 items-center justify-center rounded-full bg-[#0F7B55] text-[10px] font-semibold text-white">
          1
        </span>
        Read quote
      </span>
      <IconArrowRight className="size-3 text-stone-400" />
      <span className="inline-flex items-center gap-1.5">
        <span className="flex size-4 items-center justify-center rounded-full border border-[#D8D1C2] bg-white text-[10px] font-medium text-stone-500">
          2
        </span>
        Review clauses &amp; controls
      </span>
      <IconArrowRight className="size-3 text-stone-400" />
      <span className="inline-flex items-center gap-1.5">
        <span className="flex size-4 items-center justify-center rounded-full border border-[#D8D1C2] bg-white text-[10px] font-medium text-stone-500">
          3
        </span>
        Issue virtual card
      </span>
    </div>
  );
}

function QuoteIntakeForm({
  quoteText,
  onQuoteTextChange,
  onParse,
  busy,
  mountParseId,
}: QuoteIntakeFormProps) {
  const isSample = quoteText.trim() === SAMPLE_QUOTE_TEXT.trim();
  const hasText = quoteText.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label
          htmlFor={mountParseId ? "quoteTextarea" : undefined}
          className="text-xs font-medium text-stone-700"
        >
          Contractor quote or service agreement
        </Label>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={busy}
            onClick={() => onQuoteTextChange(SAMPLE_QUOTE_TEXT)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45",
              isSample
                ? "border-[#0F7B55]/30 bg-[#0F7B55]/10 text-[#0F5C3F]"
                : "border-[#DCD5C6] bg-white text-stone-700 hover:border-[#0F7B55]/40 hover:text-[#0F7B55]",
            )}
          >
            {isSample ? (
              <IconCheck className="size-3.5 text-[#0F7B55]" />
            ) : (
              <IconSparkles className="size-3.5 text-[#0F7B55]" />
            )}
            <span>Use sample quote</span>
          </button>

          {hasText ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onQuoteTextChange("")}
              className="rounded-md px-2 py-1 text-stone-500 transition-colors hover:bg-stone-200/50 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="clause-paper-sheet overflow-hidden rounded-xl transition-shadow focus-within:ring-2 focus-within:ring-[#0F7B55]/35">
        <textarea
          id={mountParseId ? "quoteTextarea" : undefined}
          rows={13}
          value={quoteText}
          onChange={(e) => onQuoteTextChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) {
              e.preventDefault();
              onParse();
            }
          }}
          placeholder={`Paste a contractor quote, milestone schedule, or scope of work…\n\nExample clauses Clause extracts:\n• Payment milestones & required release proof (§1.1–§1.3)\n• Permitted & prohibited spending categories (§2.1–§2.2)\n• Substantial completion cutoff date (§3.2)`}
          className="font-contract-serif block w-full resize-y border-0 bg-transparent px-5 py-4 text-[14px] leading-relaxed text-stone-800 placeholder:font-sans placeholder:text-xs placeholder:leading-relaxed placeholder:text-stone-400 focus:outline-none focus:ring-0"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-xs text-stone-500">
          Every card limit, merchant category, and cutoff date is linked
          verbatim to a clause you approve.
        </span>
        <Button
          id={mountParseId ? "parse" : undefined}
          type="button"
          disabled={busy}
          onClick={onParse}
          className="h-9 rounded-lg bg-[#0F7B55] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#0C6646] focus-visible:ring-[#0F7B55]/45"
        >
          {busy ? (
            <>
              <IconLoader2 className="size-3.5 animate-spin" />
              Reading quote…
            </>
          ) : (
            "Read quote"
          )}
        </Button>
      </div>
    </div>
  );
}

interface EmptyJobStateProps {
  quoteText: string;
  onQuoteTextChange: (text: string) => void;
  onParse: () => void;
  busy: boolean;
  dialogOpen: boolean;
}

export function EmptyJobState({
  quoteText,
  onQuoteTextChange,
  onParse,
  busy,
  dialogOpen,
}: EmptyJobStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-[740px] flex-1 flex-col justify-center px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D8E5DD] bg-[#EBF4EE] px-2.5 py-0.5 text-[11px] font-medium text-[#0F5C3F]">
            <IconFileText className="size-3.5" />
            Contract-backed virtual card
          </div>
          <StepPillRow />
        </div>

        <div className="space-y-1.5 pt-1">
          <h2 className="font-contract-serif text-2xl font-normal tracking-tight text-stone-900 sm:text-[28px]">
            Issue a card governed by the contractor’s quote
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            Paste a contractor agreement below or load a sample quote to review
            extracted clauses and deterministic card controls before issuing.
          </p>
        </div>
      </div>

      <QuoteIntakeForm
        quoteText={quoteText}
        onQuoteTextChange={onQuoteTextChange}
        onParse={onParse}
        busy={busy}
        mountParseId={!dialogOpen}
      />
    </div>
  );
}

interface NewJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteText: string;
  onQuoteTextChange: (text: string) => void;
  onParse: () => void;
  busy: boolean;
}

export function NewJobDialog({
  open,
  onOpenChange,
  quoteText,
  onQuoteTextChange,
  onParse,
  busy,
}: NewJobDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-[#E5DFD2] bg-[#FAF8F3] p-6">
        <DialogHeader className="space-y-2">
          <StepPillRow />
          <DialogTitle className="font-contract-serif text-xl font-normal">
            New contract job
          </DialogTitle>
          <DialogDescription>
            Paste a contractor quote or load the sample agreement to extract
            clauses and review derived card controls.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <QuoteIntakeForm
            quoteText={quoteText}
            onQuoteTextChange={onQuoteTextChange}
            onParse={onParse}
            busy={busy}
            mountParseId={true}
          />
        ) : null}

        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
