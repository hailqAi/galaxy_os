# Service visit, claim, and replacement workflow

Status: `PARTIAL`.

Service Visits are scoped through their Service Ticket, Project and Customer.
Scheduling rejects closed tickets, technicians must have an active
organization membership, and start/complete transitions are validated at the
backend. Warranty Claims validate the Warranty Asset snapshot at the ticket's
reported date; goodwill requires its dedicated permission. Approved claims
create one idempotent Warranty Replacement aggregate.

Replacement currently records the approved decision and stock-pending state.
Reservation, Issue, Visit, defective Return, replacement installation and new
Warranty Asset commands remain before this workflow is `COMPLETE`.

Supplier submission is recorded as `MANUAL`, `EMAIL_EXTERNAL`,
`PORTAL_EXTERNAL`, or `API`. The application does not claim an external
submission occurred without the corresponding integration and reference.
