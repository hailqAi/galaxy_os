# Warehouse and inventory model

Status: not implemented.

The implementation must distinguish on-hand, available, reserved, in-transit, quality-hold, damaged, and issued quantities. Receipt and stock movement must update immutable transactions and balances atomically. Quality-hold stock cannot become available, and project reservations cannot be consumed elsewhere without an audited override.

No placeholder inventory tables were added: receipt, reservation, transfer, issue, return, and cycle count must ship as one working control surface.
