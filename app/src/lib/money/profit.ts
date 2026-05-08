import type { Expense, Invoice, Job, OrgMember } from "@/types";

export interface JobProfit {
  jobId: string;
  revenueCents: number;
  cogsCents: number;
  laborCostCents: number;
  laborMinutes: number;
  netCents: number;
  marginPct: number; // 0..1
}

export interface MoneyTotals {
  revenueCents: number;
  expensesCents: number;
  netCents: number;
}

interface ComputeArgs {
  job: Job;
  invoices: Invoice[];
  expenses: Expense[];
  members: Pick<OrgMember, "uid" | "hourlyRateCents">[];
  defaultRateCents?: number;
}

// Revenue = collected (paid) on invoices linked to this job.
export function jobRevenueCents(jobId: string, invoices: Invoice[]): number {
  return invoices
    .filter((i) => i.jobId === jobId)
    .reduce((sum, i) => sum + (i.paidAmountCents || 0), 0);
}

// Expenses: only cogs/payroll linked to this job count as "job cost".
export function jobExpensesCents(jobId: string, expenses: Expense[]): number {
  return expenses
    .filter((e) => e.jobId === jobId && (e.kind === "cogs" || e.kind === "payroll"))
    .reduce((sum, e) => sum + (e.amountCents || 0), 0);
}

export function jobLaborMinutes(job: Job): number {
  const map = job.laborMinutesByUid ?? {};
  return Object.values(map).reduce((s, n) => s + (n || 0), 0);
}

export function jobLaborCostCents(job: Job, members: Pick<OrgMember, "uid" | "hourlyRateCents">[], defaultRateCents = 0): number {
  const map = job.laborMinutesByUid ?? {};
  let total = 0;
  for (const [uid, mins] of Object.entries(map)) {
    const m = members.find((x) => x.uid === uid);
    const rate = m?.hourlyRateCents ?? defaultRateCents;
    total += Math.round(((mins || 0) / 60) * rate);
  }
  return total;
}

export function computeJobProfit({ job, invoices, expenses, members, defaultRateCents = 0 }: ComputeArgs): JobProfit {
  const revenueCents = jobRevenueCents(job.id, invoices);
  const cogsCents = jobExpensesCents(job.id, expenses);
  const laborMinutes = jobLaborMinutes(job);
  const laborCostCents = jobLaborCostCents(job, members, defaultRateCents);
  const netCents = revenueCents - cogsCents - laborCostCents;
  const marginPct = revenueCents > 0 ? netCents / revenueCents : 0;
  return { jobId: job.id, revenueCents, cogsCents, laborCostCents, laborMinutes, netCents, marginPct };
}

export function totalsForRange(args: {
  invoices: Invoice[];
  expenses: Expense[];
  fromIso?: string;
  toIso?: string;
}): MoneyTotals {
  const { invoices, expenses, fromIso, toIso } = args;
  const fromMs = fromIso ? new Date(fromIso).getTime() : -Infinity;
  const toMs = toIso ? new Date(toIso).getTime() : Infinity;

  const revenueCents = invoices
    .flatMap((inv) =>
      (inv.payments ?? [])
        .filter((p) => {
          const t = new Date(p.receivedAt).getTime();
          return t >= fromMs && t <= toMs;
        })
        .map((p) => p.amountCents),
    )
    .reduce((a, b) => a + b, 0);

  const expensesCents = expenses
    .filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= fromMs && t <= toMs;
    })
    .reduce((s, e) => s + e.amountCents, 0);

  return { revenueCents, expensesCents, netCents: revenueCents - expensesCents };
}
