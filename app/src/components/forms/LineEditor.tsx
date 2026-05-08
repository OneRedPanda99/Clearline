"use client";

import type { DocLine } from "@/types";
import { formatMoney, parseMoneyInput } from "@/lib/utils/format";

interface LineEditorProps {
  lines: DocLine[];
  onChange: (lines: DocLine[]) => void;
  showTaxable?: boolean;
}

function newLine(): DocLine {
  return {
    id: `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    description: "",
    quantity: 1,
    unitPriceCents: 0,
    taxable: false,
  };
}

export function LineEditor({ lines, onChange, showTaxable = false }: LineEditorProps) {
  function update(idx: number, patch: Partial<DocLine>) {
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function remove(idx: number) {
    onChange(lines.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...lines, newLine()]);
  }

  const subtotalCents = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceCents), 0);

  return (
    <div className="space-y-2">
      <p className="label">Line items</p>
      <div className="rounded-xl border border-line bg-ink-soft">
        {lines.map((l, idx) => (
          <div key={l.id} className="grid grid-cols-12 gap-2 border-b border-line p-2 last:border-b-0">
            <input
              className="input col-span-12 sm:col-span-6"
              value={l.description}
              placeholder="Description"
              onChange={(e) => update(idx, { description: e.target.value })}
            />
            <input
              className="input col-span-3 sm:col-span-1 text-right"
              inputMode="decimal"
              type="number"
              min={0}
              step="any"
              value={l.quantity}
              onChange={(e) => update(idx, { quantity: parseFloat(e.target.value) || 0 })}
            />
            <input
              className="input col-span-5 sm:col-span-2 text-right"
              inputMode="decimal"
              placeholder="0.00"
              value={(l.unitPriceCents / 100).toFixed(2)}
              onChange={(e) => update(idx, { unitPriceCents: parseMoneyInput(e.target.value) })}
            />
            <div className="col-span-3 sm:col-span-2 text-right text-sm font-semibold leading-9">
              {formatMoney(Math.round(l.quantity * l.unitPriceCents))}
            </div>
            <button type="button" onClick={() => remove(idx)} className="col-span-1 text-text-faint hover:text-bad" aria-label="Remove line">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={add} className="btn-outline text-xs">+ Add line</button>
        <p className="text-sm font-semibold">Subtotal {formatMoney(subtotalCents)}</p>
      </div>
      {showTaxable && (
        <p className="text-xs text-text-faint">Use the per-line "taxable" flag in the future when sales tax is enabled.</p>
      )}
    </div>
  );
}
