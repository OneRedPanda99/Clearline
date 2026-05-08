import type { Timestamp } from "firebase/firestore";

export type FsTimestamp = Timestamp | null | undefined;
export type IsoString = string;

export type Role = "owner" | "manager" | "worker";

export interface OrgMember {
  uid: string;
  role: Role;
  active: boolean;
  displayName?: string;
  email?: string;
  hourlyRateCents?: number;
  createdAt?: IsoString;
}

export interface Org {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: IsoString;
  legacy?: boolean;
}

export interface UserProfile {
  uid: string;
  displayName?: string;
  email?: string;
  lastOrgId?: string;
  prefs?: Record<string, unknown>;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  tags?: string[];
  createdAt: IsoString;
  updatedAt: IsoString;
  createdBy?: string;
  archived?: boolean;
}

export type JobStatus = "lead" | "scheduled" | "in_progress" | "completed" | "lost";

export interface JobNote {
  id: string;
  authorUid: string;
  authorName?: string;
  text: string;
  createdAt: IsoString;
}

export interface JobPhoto {
  id: string;
  storagePath: string;
  url?: string;
  caption?: string;
  uploadedBy: string;
  uploadedAt: IsoString;
}

export interface Job {
  id: string;
  customerId: string;
  customerName?: string;
  title?: string;
  status: JobStatus;
  jobDate?: string; // YYYY-MM-DD
  jobTime?: string; // HH:mm
  followUpDate?: string;
  address?: string;
  assignedTo?: string[]; // uids
  laborMinutesByUid?: Record<string, number>;
  timer?: { startedAt?: number; isRunning?: boolean; uid?: string };
  notes?: JobNote[];
  photos?: JobPhoto[];
  serviceType?: string;
  createdAt: IsoString;
  updatedAt: IsoString;
  createdBy?: string;
}

export type DocStatus = "draft" | "sent" | "accepted" | "declined" | "expired" | "void";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface DocLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable?: boolean;
}

export interface DocTotals {
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

export interface Estimate {
  id: string;
  number: string;
  customerId: string;
  jobId?: string;
  lines: DocLine[];
  totals: DocTotals;
  status: DocStatus;
  notes?: string;
  issuedAt?: IsoString;
  createdAt: IsoString;
  updatedAt: IsoString;
  createdBy?: string;
}

export interface PaymentEvent {
  id: string;
  amountCents: number;
  method?: "cash" | "check" | "card" | "transfer" | "other";
  reference?: string;
  receivedAt: IsoString;
  recordedBy: string;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  jobId?: string;
  lines: DocLine[];
  totals: DocTotals;
  status: DocStatus;
  paymentStatus: PaymentStatus;
  payments: PaymentEvent[];
  paidAmountCents: number;
  dueDate?: string;
  issuedAt?: IsoString;
  notes?: string;
  createdAt: IsoString;
  updatedAt: IsoString;
  createdBy?: string;
}

export type ExpenseKind = "cogs" | "overhead" | "payroll";

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amountCents: number;
  vendor?: string;
  description?: string;
  taxCategoryId: string;
  jobId?: string;
  payeeUid?: string;
  kind: ExpenseKind;
  receiptStoragePath?: string;
  receiptUrl?: string;
  createdAt: IsoString;
  updatedAt: IsoString;
  createdBy?: string;
}

export interface TaxCategory {
  id: string;
  label: string;
  scheduleCLine?: string;
  defaultKind: ExpenseKind;
  builtin?: boolean;
  archived?: boolean;
}

export interface PayrunLine {
  uid: string;
  displayName?: string;
  regularHours: number;
  otHours: number;
  rateCents: number;
  totalCents: number;
}

export interface Payrun {
  id: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  status: "draft" | "exported" | "paid";
  lines: PayrunLine[];
  totalCents: number;
  notes?: string;
  createdAt: IsoString;
  updatedAt: IsoString;
  createdBy?: string;
}

export interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "revoked";
  createdAt: IsoString;
  createdBy: string;
}

export interface OrgSettings {
  businessName?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessAddress?: string;
  laborDefaultRateCents?: number;
  invoiceNumberPrefix?: string;
  invoiceNextNumber?: number;
  estimateNumberPrefix?: string;
  estimateNextNumber?: number;
  updatedAt?: IsoString;
}
