# Data-change rule (Emerald)

- Spool weights (`grams`, `gross`, `tare`, `size`) change only through a person's action in Emerald or a Claude session acting on an explicit owner decision.
- App code: any weight write must run inside `asHuman(via, fn)` (`app/src/data/inventory.ts`); unstamped writes are refused on the device and in the database (`records_z_guard`, migration 0008).
- Claude sessions: never change spool data unless the owner asked for that exact change in the session. Then, in the same SQL call: `select set_config('emerald.actor', 'claude: <owner request>', true);` before the update. Every change is kept in `public.record_history`.
- Print usage goes in `consumption` rows, never by editing spool grams.
