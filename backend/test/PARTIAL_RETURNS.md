# Partial-return verification

The return model already stores `quantity`, `saleItemId`, `originalSellerId`, and
`creditSaleId`. No new model or schema field is required.

Pending and approved quantities reserve units; rejected quantities release them.
PostgreSQL invoice-row locks serialize reservations and decisions. Approval uses
the recorded sale-item total (including discount and tax), allocating rounding
across successive returns. Credit reductions retain the existing rule of capping
the adjustment at the outstanding debt. Historical payments are never deleted.

Owner and employee returns both replenish the original seller?s personal supplied
stock. They do not increase warehouse inventory. Only legacy returns without an
original seller retain the warehouse fallback.

Only fully returned invoices become `REFUNDED`. The accompanying data migration
repairs the status of legacy partially returned invoices without altering items,
payments, or return history. Seller-stock calculations include the original sold
quantities for both completed and refunded invoices, then add approved returns.

## Run the PostgreSQL integration suite

Use a **dedicated local test instance on port 55439**, never production. Apply the
repository migrations to it first. In PowerShell, from `backend`:

```powershell
$env:DATABASE_URL='postgresql://return_test@127.0.0.1:55439/postgres'
node node_modules/prisma/build/index.js migrate deploy
$env:RETURN_TEST_DATABASE_URL=$env:DATABASE_URL
npm.cmd run test:e2e -- --runInBand partial-returns.e2e-spec.ts
```

Tests create distinct businesses and retain fixtures in this disposable database.
The test harness supplies authenticated identities to the actual Nest controller;
Prisma, PostgreSQL transactions, validation, service authorization, inventory,
credit adjustments, notifications, and audit writes are exercised without mocks.

Coverage includes 20 Salt / 50 Maggi, returns of 1 then 2, rejection of 18 when
17 remain, pending reservations, rejection, owner and employee stock, cash and
credit, partial payments, later payments, simultaneous requests/decisions,
concurrent payment and approval, rounding, full returns, and legacy-data repair.

The existing invoice cards, styles, and navigation are preserved. Only the
existing return forms load and display sold/approved/pending/remaining quantities.
Return submissions and decisions require server confirmation; network failures
cannot manufacture locally approved stock.
