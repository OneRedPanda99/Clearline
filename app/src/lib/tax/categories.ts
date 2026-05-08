import type { ExpenseKind } from "@/types";

export interface DefaultTaxCategory {
  id: string;
  label: string;
  scheduleCLine?: string;
  defaultKind: ExpenseKind;
}

// Schedule C-aligned defaults. Adjust labels later from Settings → Tax categories.
export const DEFAULT_TAX_CATEGORIES: DefaultTaxCategory[] = [
  { id: "advertising", label: "Advertising", scheduleCLine: "Line 8", defaultKind: "overhead" },
  { id: "vehicle", label: "Car & truck expenses", scheduleCLine: "Line 9", defaultKind: "overhead" },
  { id: "fuel_gas", label: "Fuel — gas", scheduleCLine: "Line 9", defaultKind: "cogs" },
  { id: "contract_labor", label: "Contract labor", scheduleCLine: "Line 11", defaultKind: "payroll" },
  { id: "insurance", label: "Insurance", scheduleCLine: "Line 15", defaultKind: "overhead" },
  { id: "legal_pro", label: "Legal & professional", scheduleCLine: "Line 17", defaultKind: "overhead" },
  { id: "office", label: "Office expense", scheduleCLine: "Line 18", defaultKind: "overhead" },
  { id: "rent_equip", label: "Rent / lease — equipment", scheduleCLine: "Line 20a", defaultKind: "overhead" },
  { id: "repairs", label: "Repairs & maintenance", scheduleCLine: "Line 21", defaultKind: "overhead" },
  { id: "supplies_chem", label: "Supplies — chemicals", scheduleCLine: "Line 22", defaultKind: "cogs" },
  { id: "supplies_other", label: "Supplies — other", scheduleCLine: "Line 22", defaultKind: "cogs" },
  { id: "taxes_lic", label: "Taxes & licenses", scheduleCLine: "Line 23", defaultKind: "overhead" },
  { id: "travel", label: "Travel", scheduleCLine: "Line 24a", defaultKind: "overhead" },
  { id: "meals", label: "Meals (50%)", scheduleCLine: "Line 24b", defaultKind: "overhead" },
  { id: "utilities", label: "Utilities", scheduleCLine: "Line 25", defaultKind: "overhead" },
  { id: "wages", label: "Wages", scheduleCLine: "Line 26", defaultKind: "payroll" },
  { id: "equipment", label: "Equipment (capital)", scheduleCLine: "Form 4562", defaultKind: "overhead" },
  { id: "other", label: "Other expenses", scheduleCLine: "Line 27a", defaultKind: "overhead" },
];
