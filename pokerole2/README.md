# Pokérole 2 — Data drops

Drop a spreadsheet here named `evolutions.xlsx` (or `.csv`) with the columns
below to bulk-update species evolution speeds/methods.

## Required columns

| Column            | Required | Notes                                                          |
| ----------------- | -------- | -------------------------------------------------------------- |
| `name`            | yes      | Species name as stored in `public.species.name` (case-insensitive). |
| `evolution_kind`  | yes      | `time` · `item` · `other`                                      |
| `evolution_speed` | for time | `fast` (5) · `medium` (15) · `slow` (45)                       |
| `evolution_text`  | for item/other | Free text — e.g. `"Leaf Stone"`, `"Trade holding Metal Coat"`. |

Aliases accepted for `evolution_speed`: `f` / `m` / `s`, `fast/medium/slow`,
`5/15/45` (interpreted as the matching speed).

## How to apply

After dropping `evolutions.xlsx` (or `.csv`) into this folder, run:

```bash
node pokerole2/import_evolutions.mjs
```

The script:

- Reads the first sheet of `pokerole2/evolutions.xlsx`, falling back to
  `pokerole2/evolutions.csv`.
- Builds an `evolution_method` JSON `{ kind, speed?, text? }` per row.
- Updates `public.species.evolution_method` by matching `name`
  (case-insensitive). Rows without a matching species are reported but skipped.

Run with `DRY_RUN=1` to preview without writing.
