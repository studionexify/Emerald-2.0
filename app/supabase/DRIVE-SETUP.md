# Photos & bills in Google Drive — one-time setup (≈10 min)

Files go to the owner's Google Drive through the `drive-media` Edge Function. The database stores only a short reference per file.

1. **Google Cloud project** (console.cloud.google.com, free): enable **Google Drive API**.
2. **OAuth consent screen**: External, add your Google account as owner, scope `.../auth/drive.file`.
   **Publish the app ("In production")** — in "Testing" mode Google expires the refresh token after 7 days and uploads stop.
   `drive.file` is a non-sensitive scope, so publishing needs no Google review.
3. **Credentials → OAuth client ID** → type *Web application*, redirect URI `https://developers.google.com/oauthplayground`.
4. **Refresh token**: open developers.google.com/oauthplayground → ⚙ → "Use your own OAuth credentials" (paste client ID/secret) →
   scope `https://www.googleapis.com/auth/drive.file` → Authorize → "Exchange authorization code for tokens" → copy the **refresh token**.
5. **Drive folder**: nothing to do — the function creates an *Emerald files* folder in that Google account on the first upload and reuses it.
6. **Supabase secrets** (Dashboard → Edge Functions → Secrets, or CLI):
   ```
   supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… GOOGLE_REFRESH_TOKEN=…
   supabase functions deploy drive-media
   ```
7. Open Emerald and sign in. Photos already saved inside records are moved to Drive automatically on first sign-in.

The refresh token stops working if you revoke Emerald's access in your Google account or change the account password with "sign out everywhere". Repeat step 4 then.

---

# Nexder (design library): extra one-time setup

Nexder reuses the same Google credential, but files never pass through Supabase or Cloudflare storage:

| What | Where it lives | Free-plan guard |
|---|---|---|
| Records (name, number, Drive ids) | Supabase database (normal sync) | tiny |
| Original photos and design files (up to GBs) | Google Drive, browser → Google directly (resumable, 16 MB chunks) | the function refuses an upload that would leave < 1 GB free; Nexder shows the meter |
| Small preview picture per photo | private Supabase Storage bucket `nexder-previews` | each ≤ 300 KB; the app stops at 900 MB of the 1 GB |
| Downloads | Cloudflare Worker `/nexder-dl` streams from Drive to the browser | only that route runs code (100,000 requests/day free); everything else is free static assets |

1. Run migration `supabase/migrations/0006_nexder.sql` (bucket, policies, the `nexder_referenced` helper).
2. Deploy the function: `supabase functions deploy nexder-drive` (uses the existing `GOOGLE_*` secrets).
3. Make one secret and give it to both sides (Supabase seals download tickets with it, the Worker opens them):
   ```
   openssl rand -base64 32
   supabase secrets set NEXDER_TICKET_KEY=<that value>
   npx wrangler secret put NEXDER_TICKET_KEY        # same value, on the emerald-2-0 Worker
   ```
4. Deploy the site as usual (the Worker ships with it, see `wrangler.jsonc` and `src/worker.ts`).
5. Open Nexder → Storage → **Check Google Drive**. It uploads 1 KB, downloads it back through the Worker, compares and deletes it.

Deleting a design moves its Drive folder to Drive's trash (and the design to the Bin). Restoring from the Bin brings it back; deleting it from the Bin
(or the 7-day expiry) deletes the folder and previews for good. The function only deletes what no record or Bin entry still points at,
and clears abandoned uploads (older than a day, referenced by nothing) once a day.

Roles: owner, partner and manager can add, change, download and delete. Operator and accountant can see designs and previews, and share them, but the
function refuses to give them download links. The CA has no access.

## Sync: the newest edit wins (no question asked)

Every change carries the time it was made (`edited_at`, migration `0007_last_edit_wins.sql`). If a device was offline and another changed the same record
meanwhile, the newer edit stays, whichever device reaches the cloud last; the other device then takes the cloud copy. Deleting counts as an edit too.
A device's first connection takes what the cloud has and sends up anything only that device has. It no longer asks which copy to keep.
