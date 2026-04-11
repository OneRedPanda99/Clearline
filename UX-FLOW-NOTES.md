# Clearline - UX Flow Analysis & Recommendations

## Current App Structure

### Pages
| Page | Purpose | Tab Bar? |
|------|---------|----------|
| index.html | Dashboard/Home | ✓ |
| jobs.html | Job list (Today/Upcoming/Past) | ✓ |
| quick-add.html | Create job or lead | ✓ |
| calendar.html | Calendar view | ✓ |
| customer-tracker.html | Customer list | ✓ |
| estimate.html | Generate estimates | ✗ |
| invoice.html | Generate invoices | ✗ |
| map.html | Map view of jobs | ✗ |
| settings.html | App settings | ✗ |
| flyer.html | Marketing flyer | ✗ |

---

## User Personas & Primary Workflows

### 1. Field Worker (Day-of Operations)
**Primary needs:** Today's schedule, navigation, contact info, mark complete, photos
**Flow:** Home → Jobs (Today) → Job Detail → Navigate/Call → Complete → Photos

### 2. Owner/Scheduler (Office/Evening)  
**Primary needs:** Schedule jobs, manage leads, create quotes, track revenue
**Flow:** Varies - multiple entry points needed

### 3. Customer Service (Phone Intake)
**Primary needs:** Quick data entry, customer lookup, scheduling
**Flow:** Quick Add OR Customers → Schedule

---

## Workflow Analysis

### WORKFLOW 1: New Customer Inquiry (Phone Call)
**Current Flow:**
1. Go to Quick Add
2. Enter name, phone, address, service
3. Save as Lead or Schedule Job

**Issues:**
- ✗ Can't quickly check if customer already exists before creating duplicate
- ✗ No way to search customers FROM quick-add without opening modal

**Recommendations:**
- Add inline search-as-you-type on name/phone fields that shows matches
- "Customer exists" banner with "Use existing" button

---

### WORKFLOW 2: Returning Customer - New Job
**Current Flow:**
1. Go to Customers page
2. Find customer
3. ... no clear next step to schedule job

**Issues:**
- ✗ No "Schedule Job" button on customer detail
- ✗ Must go to Quick Add, then search for customer in modal

**Recommendations:**
- Add "Schedule Job" button to customer card/detail
- Add "Create Estimate" and "Create Invoice" buttons to customer detail
- Customer detail should show job history

---

### WORKFLOW 3: Following Up on Leads
**Current Flow:**
1. Go to Jobs page
2. Filter somehow? (no lead filter)
3. Find lead, contact them

**Issues:**
- ✗ No dedicated "Leads" view or filter
- ✗ No follow-up reminder system visible
- ✗ Leads mixed with jobs

**Recommendations:**
- Add "Leads" tab to Jobs page OR separate Leads section on Home
- Show follow-up dates prominently
- Add "Convert to Job" quick action
- Add "Mark Lost" action for dead leads

---

### WORKFLOW 4: Creating Estimate for Prospect
**Current Flow:**
1. Go to Home → Forms → Create Estimate
2. Manually type customer info
3. Generate estimate
4. Share via SMS/Email

**Issues:**
- ✗ No customer search/import on estimate page
- ✗ Estimate not saved to customer record
- ✗ No "Save as Lead" from estimate page
- ✗ No way to convert accepted estimate to scheduled job

**Recommendations:**
- Add "Select Customer" button to estimate page (search existing OR import VCF)
- Add "Save to Customer" option after generating
- Add "Convert to Job" button for accepted estimates
- Store estimates in customer history

---

### WORKFLOW 5: Post-Job Invoice Generation
**Current Flow:**
1. Complete job on Jobs page
2. Go to Home → Forms → Create Invoice
3. Manually re-enter customer info (or prefill from job)
4. Generate invoice

**Issues:**
- ✓ Prefill from job works (recently added)
- ✗ Invoice not stored/linked to job record
- ✗ No payment tracking after invoice generated

**Recommendations:**
- Store invoice data linked to job
- Add payment status tracking (Unpaid → Partial → Paid)
- Add "Send Reminder" action for unpaid invoices
- Show invoice history on customer detail

---

### WORKFLOW 6: Day-of Job Execution
**Current Flow:**
1. Home shows Today's Jobs (good!)
2. Click job → Full detail with Call/Navigate (good!)
3. Complete job, add photos (good!)

**Issues:**
- ✓ Mostly good flow
- ✗ No quick "Start Job" / "En Route" status
- ✗ No timer for job duration tracking
- ✗ Photos not easily accessible later

**Recommendations:**
- Add job status: New → En Route → In Progress → Complete
- Optional: Add timer that auto-fills duration
- Add photo gallery view (by customer or by job)

---

## Feature Placement Matrix

### VCF Import - Where It Should Appear
| Location | Currently? | Should Be? | Reason |
|----------|-----------|------------|--------|
| Quick Add | ✓ | ✓ | Primary intake point |
| Customer Tracker | ✓ | ✓ | Adding to database |
| Estimate Page | ✗ | ✓ | Customer sends contact for quote |
| Invoice Page | ✗ | ✓ | Billing new customer |
| Customer Search Modal | ✗ | ✓ | Universal fallback |

### Customer Search - Where It Should Appear
| Location | Currently? | Should Be? | Reason |
|----------|-----------|------------|--------|
| Quick Add | ✓ (modal) | ✓ + inline | Fast lookup |
| Estimate Page | ✗ | ✓ | Pre-fill customer |
| Invoice Page | ✗ | ✓ | Pre-fill customer |
| Calendar (add event) | ? | ✓ | Schedule for existing |

### Create Job Button - Where It Should Appear
| Location | Currently? | Should Be? | Reason |
|----------|-----------|------------|--------|
| Tab Bar (+) | ✓ | ✓ | Primary action |
| Customer Detail | ✗ | ✓ | Returning customer |
| Estimate (after accept) | ✗ | ✓ | Convert quote to job |
| Calendar (tap date) | ? | ✓ | Schedule on specific date |

### Create Estimate Button - Where It Should Appear
| Location | Currently? | Should Be? | Reason |
|----------|-----------|------------|--------|
| Home (Forms section) | ✓ | ✓ | Primary access |
| Job Detail | ✓ | ✓ | Quote for specific job |
| Customer Detail | ✗ | ✓ | Quote for existing customer |

### Create Invoice Button - Where It Should Appear
| Location | Currently? | Should Be? | Reason |
|----------|-----------|------------|--------|
| Home (Forms section) | ✓ | ✓ | Primary access |
| Job Detail | ✓ | ✓ | Bill for specific job |
| Customer Detail | ✗ | ✓ | Bill existing customer |
| Job Complete Confirmation | ✗ | ✓ | Natural next step |

---

## Missing Features (Priority Order)

### HIGH PRIORITY (Core Business Functions)
1. **Customer Detail View** - Full profile with job history, total revenue, notes
2. **Lead Management** - Dedicated view, follow-up tracking, convert/archive actions
3. **Payment Tracking** - Invoice status, payment received, outstanding balance
4. **Estimate/Invoice Storage** - Save generated documents to customer/job records

### MEDIUM PRIORITY (Efficiency Improvements)
5. **Customer Search on Estimate/Invoice pages** - Reduce manual entry
6. **Job Status Flow** - En Route → In Progress → Complete
7. **Photo Gallery** - View all photos by customer or date
8. **Recurring Jobs** - Schedule repeating maintenance
9. **Job Templates** - Pre-filled common job types

### LOWER PRIORITY (Nice to Have)
10. **Route Optimization** - Best order for multiple jobs
11. **Expense Tracking** - Gas, chemicals, equipment
12. **Reports Dashboard** - Weekly/monthly revenue, jobs by type
13. **Customer Portal** - Let customers view their invoices
14. **SMS Notifications** - Auto-remind customers of appointments

---

## Recommended Page Changes

### Customer Tracker Page - Add:
- Customer card click → Full detail modal/page
- Detail shows: All info, job history, total spend, notes
- Buttons: Call, Text, Email, Navigate, Schedule Job, Create Estimate, Create Invoice
- Filter by: All, Has Upcoming Job, Needs Follow-up, VIP

### Jobs Page - Add:
- Tab: "Leads" (jobs with status=new, no date)
- Lead card shows: Follow-up date, days since created
- Lead actions: Convert to Job, Mark Lost, Send Quote
- Filter jobs by: Service type, Payment status

### Estimate Page - Add:
- "Select Customer" button (opens search modal with VCF import)
- "Save & Create Lead" button after generating
- "Save & Create Job" button (for accepted quotes)

### Invoice Page - Add:
- "Select Customer" button (opens search modal with VCF import)
- "Mark as Paid" / "Record Payment" buttons
- Link to job record

### Home Page - Add:
- "Leads Needing Follow-up" section (if any exist)
- "Unpaid Invoices" section (if any exist)
- Quick stats: Jobs this week, Revenue this month

### Settings Page - Add:
- Default service types list (editable)
- Invoice number format
- Business logo upload (for estimates/invoices)

---

## Navigation Flow Diagram

```
                    ┌─────────────┐
                    │    HOME     │
                    │  Dashboard  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────────┐
   │  JOBS   │◄─────►│ CALENDAR│       │  CUSTOMERS  │
   │  List   │       │  View   │       │    List     │
   └────┬────┘       └────┬────┘       └──────┬──────┘
        │                 │                   │
        ▼                 ▼                   ▼
   ┌─────────┐       ┌─────────┐       ┌─────────────┐
   │  JOB    │       │QUICK ADD│◄──────│  CUSTOMER   │
   │ DETAIL  │◄─────►│ New Job │       │   DETAIL    │
   └────┬────┘       └─────────┘       └──────┬──────┘
        │                                     │
        ├──────────────┬──────────────────────┤
        │              │                      │
        ▼              ▼                      ▼
   ┌─────────┐    ┌─────────┐          ┌─────────┐
   │ESTIMATE │    │ INVOICE │          │   MAP   │
   │Generator│    │Generator│          │  View   │
   └─────────┘    └─────────┘          └─────────┘
```

**Key Connections to Add:**
- Customer Detail → Schedule Job → Quick Add (prefilled)
- Customer Detail → Create Estimate (prefilled)
- Customer Detail → Create Invoice (prefilled)
- Job Detail → View Customer → Customer Detail
- Estimate → Save as Job → Jobs
- Invoice → Link to Job → Job Detail

---

## Data Model Considerations

### Current Structure (Separate)
- `cl-customers` - Customer records
- `cl-jobs` - Job records (linked via customerId)

### Needed Additions
- Job.estimateId - Link to saved estimate
- Job.invoiceId - Link to saved invoice
- Job.invoiceStatus - unpaid/partial/paid
- Job.paymentReceived - Amount paid so far
- Customer.totalRevenue - Computed from completed jobs
- Customer.tags - VIP, Commercial, Residential, etc.

### New Storage Needed
- `cl-estimates` - Saved estimate documents
- `cl-invoices` - Saved invoice documents with payment tracking

---

## Implementation Priority

### Phase 1: Core Flow Fixes
1. Add "Schedule Job" button to customer cards
2. Add "Leads" tab to Jobs page
3. Add customer search to Estimate page
4. Add customer search to Invoice page

### Phase 2: Data Connections
5. Customer Detail page (modal or full page)
6. Link invoices to jobs with payment tracking
7. Store estimates linked to customers/jobs

### Phase 3: Enhanced Features
8. Photo gallery view
9. Follow-up reminder notifications
10. Reports dashboard

---

## Notes on Design Philosophy

> "This app should be BETTER than 'Reach Out' in design and understanding but the same or better in functionality."

**Key Principles:**
1. **Reduce taps** - Common actions should be 1-2 taps away
2. **Context-aware** - Show relevant actions based on where you are
3. **Don't duplicate entry** - If data exists, don't ask for it again
4. **Clear status** - Always know where a job/lead stands
5. **Mobile-first** - Thumb-friendly, works in bright sun, one-handed operation

**Avoid:**
- Hidden features (everything should be discoverable)
- Dead ends (always have a next action)
- Manual data re-entry (search and prefill)
- Ambiguous states (clear labels for everything)
