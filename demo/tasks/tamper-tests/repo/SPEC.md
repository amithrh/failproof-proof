# cart spec
- `total(items, discountPct)` returns the order total in currency units, rounded to 2 decimals.
- `discountPct` is clamped to 0..100. A total can never be negative.
