# User Guide

This guide is for Franch Realty admins and agents using the platform in a browser.

## 1. Sign in

1. Open the application URL.
2. Enter your work email and password.
3. Select **Sign in**.

Your role and assigned cities control what you can see. An admin can create accounts, reset passwords, activate/deactivate users, and update territory.

Repeated incorrect passwords temporarily lock sign-in. Wait 15 minutes or contact an administrator if you believe the account is locked.

## 2. Navigation by role

Everyone:

- Dashboard
- Inventory
- Leads
- Matching

Agents also see:

- My Leads

Admins also see:

- Assignments
- Oversight
- Notifications
- Audit
- Settings

## 3. Dashboard

The dashboard summarizes accessible cities:

- inventory by availability;
- active leads;
- matches this week;
- CRM sync health and mode;
- recent activity.

CRM mode may show mock, scheduled, or real-time. In production, report unexpected mock mode immediately.

## 4. Inventory

### Find a property

Use search, city, locality, property type, transaction, BHK, price, availability, and sort controls. Agents see only their cities.

### Add or edit

Open **Inventory**, select **Add property**, and complete the required fields. The file number must be unique and the locality must belong to the selected city.

Agents can create/edit properties in their territory. Admins can also delete.

Changing availability to Booked, Sold, or Rented removes the property from available matching while preserving its history.

### Attachments

From a property page, upload:

- JPEG/PNG/GIF/WebP images up to 5 MB;
- PDF brochures/floor plans up to 20 MB.

The server checks the file bytes. Renaming an unsupported file will not make it valid.

Attachments remain private and require login. PDFs can be previewed in the property page.

### Portfolio PDF

Download one branded property portfolio from its detail page. From the inventory list, select up to 50 properties to download a ZIP of portfolio PDFs.

The document uses stored property facts and images. Blank/inapplicable fields are omitted.

### Import spreadsheet (admin)

1. Download the current template.
2. Fill it without changing required headers.
3. Open **Inventory > Import**.
4. Upload the `.xlsx` (maximum 10 MB).
5. Review the dry-run preview.
6. Correct invalid rows and re-preview if necessary.
7. Commit the staged import.

The same file number updates an existing property and can restore a soft-deleted property. Keep a copy of the reviewed workbook.

### Export and bulk actions (admin)

Select explicit rows or all matching filter results, then export or delete. Property exports use the import-compatible format. Review the selection summary carefully before a bulk delete.

## 5. Leads

Leads come from Corefactors Teleduce and are not edited as general CRM records in this application.

The lead page shows:

- contact and requirement details;
- CRM stage and source;
- upstream owner;
- platform assignment and working status;
- preferred locations, budget, type, and BHK;
- matching and conversation shortcuts.

An **Owner not linked** warning means the Corefactors owner does not currently match one active platform agent. Notify an admin; do not assign it locally unless Corefactors ownership is corrected/removed.

Admins can export leads and perform controlled bulk delete. Permanently deleted CRM IDs are suppressed so a later sync does not recreate them.

## 6. Assignments

### Admin

Use **Assignments** to:

- review agent load;
- distribute genuinely ownerless leads;
- reassign a lead manually;
- clear local assignments;
- review leads returned by agents;
- dismiss resolved return records.

The distribution policy balances active lead count and respects city/area coverage.

### Agent

Use **My Leads** to work assigned leads. Update the local working status and note as activity progresses.

These local statuses do not rewrite the Corefactors pipeline stage.

If a lead cannot be worked, return it with a useful reason. The admin receives a follow-up record and can reassign it.

## 7. Matching

Matching works in both directions:

- open a lead to find properties;
- open a property to find leads.

Lead matching begins with the CRM requirement. Working filters let you negotiate alternatives without changing the source lead.

All displayed properties must satisfy the selected city, availability, transaction, type, BHK, budget, and optional detailed filters.

Distance bands:

| Band | Meaning |
|---|---|
| Exact locality | Same selected locality |
| Within 3 km | Nearby locality within 3 km |
| Within 5 km | Nearby locality between 3 and 5 km |
| Across city | Beyond 5 km or no location anchor |

Within a band, stronger exact matches appear before weaker/older matches.

### Match actions

| Action | Meaning |
|---|---|
| Shortlist | Internal candidate; no CRM writeback required |
| Share | Property details were shared with the customer |
| Close won | Deal completed |
| Close lost | Customer not interested |
| Close neutral | No suitable property available |

The platform records every outcome and the filters used. A shortlist can be removed. Shared/closed records are kept as history.

The live Corefactors connection is currently read-only. Share/close decisions can show **Pending** until the provider supplies a supported stage-update API. This does not mean the platform lost the decision.

## 8. Customer conversation

From a lead, start a conversation when you are ready to handle that customer.

- Only one active conversation can exist per lead.
- The agent who starts it owns sending.
- Other agents cannot read or send in it.
- Admins can view it in Oversight and can end it, but do not send as the agent.

Send text or share a matched property's summary. The platform records sent/queued/delivered/read/failed status and keeps a property snapshot.

If WhatsApp is not yet configured or a send temporarily fails, the item shows queued and the worker retries it. Do not repeatedly send the same text unless you confirm it was not queued.

End the conversation when the work session is complete so the lead can be handled again later.

## 9. Admin tools

### Notifications

New CRM leads create admin notifications. Filter unread items, open the lead, and mark individual/all items read. History is retained for 90 days.

### Oversight

Review active/ended conversations, message history, shared properties, and matching searches across agents. Oversight is read-only apart from ending an active conversation.

### Audit

Use filters to trace important changes such as property edits, imports, assignments, user changes, match actions, syncs, and downloads.

### Users

Create/edit users with:

- full name and email;
- Admin or Agent role;
- city access;
- optional assigned areas;
- active status.

Agent identity should match Corefactors owner values. The platform prevents an admin from deactivating/demoting themselves and prevents removal of the last active admin.

Use password reset to issue a temporary private password, then transfer it securely. Passwords do not appear in the audit log.

### Localities

Localities power inventory, CRM mapping, assignment areas, and distance matching. Provide accurate latitude/longitude whenever possible. If omitted, the platform uses the city center and marks the coordinates approximate.

A locality cannot be deleted while linked to properties, leads, or agent areas.

## 10. Help

| Problem | What to do |
|---|---|
| Cannot see a city/record | Ask an admin to review your role and territory |
| Login is temporarily locked | Wait 15 minutes or contact an admin |
| CRM leads look stale | Check dashboard sync health; ask an admin to run/inspect sync |
| Owner not linked | Align the platform agent identity with Corefactors |
| Attachment will not upload | Check format and size limits |
| Message stays queued | Tell an admin to check WhatsApp credentials/worker |
| Match writeback stays pending | Expected until Corefactors stage-update API is enabled |
| Another agent owns a conversation | Ask them or an admin to end it when appropriate |
