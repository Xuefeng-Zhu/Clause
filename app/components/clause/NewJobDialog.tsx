import { IconFileText, IconLoader2 } from "@tabler/icons-react";

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

interface QuoteIntakeFormProps {
  quoteText: string;
  onQuoteTextChange: (text: string) => void;
  onParse: () => void;
  busy: boolean;
  mountParseId: boolean;
}

function QuoteIntakeForm({
  quoteText,
  onQuoteTextChange,
  onParse,
  busy,
  mountParseId,
}: QuoteIntakeFormProps) {
  const isSample = quoteText.trim() === SAMPLE_QUOTE_TEXT.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label
          htmlFor={mountParseId ? "quoteTextarea" : undefined}
          className="text-xs font-medium text-stone-700"
        >
          Contractor quote or service agreement
        </Label>
        <div className="flex items-center gap-3 text-xs">
          {!isSample ? (
            <button
              type="button"
              onClick={() => onQuoteTextChange(SAMPLE_QUOTE_TEXT)}
              className="font-medium text-[#0F7B55] hover:underline"
            >
              Use sample quote
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onQuoteTextChange("")}
              className="text-stone-500 hover:text-stone-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="clause-paper-sheet overflow-hidden rounded-xl">
        <textarea
          id={mountParseId ? "quoteTextarea" : undefined}
          rows={13}
          value={quoteText}
          onChange={(e) => onQuoteTextChange(e.target.value)}
          placeholder="Paste a contractor quote, scope of work, or milestone agreement…"
          className="font-contract-serif block w-full resize-y border-0 bg-transparent px-5 py-4 text-[14px] leading-relaxed text-stone-800 placeholder:font-sans placeholder:text-stone-400 focus:outline-none focus:ring-0"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-xs text-stone-500">
          Clause extracts milestones, spending categories, and completion dates
          verbatim before you issue a card.
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
    <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 space-y-1.5">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D8E5DD] bg-[#EBF4EE] px-2.5 py-0.5 text-[11px] font-medium text-[#0F5C3F]">
          <IconFileText className="size-3.5" />
          New contract card
        </div>
        <h2 className="font-contract-serif text-2xl font-normal tracking-tight text-stone-900 sm:text-[28px]">
          Start from the contractor’s quote
        </h2>
        <p className="text-sm text-stone-600">
          Paste a contractor quote below or use the Maple Street Café sample to
          extract clause-backed card limits, merchant rules, and expiration.
        </p>
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
        <DialogHeader>
          <DialogTitle className="font-contract-serif text-xl font-normal">
            New contract job
          </DialogTitle>
          <DialogDescription>
            Paste a contractor quote or use the sample agreement to extract
            clauses and review card controls.
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
