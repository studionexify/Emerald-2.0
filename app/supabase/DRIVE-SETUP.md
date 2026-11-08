# Photos & bills in Google Drive — one-time setup (≈10 min)

Files go to the owner's Google Drive through the `drive-media` Edge Function. The database stores only a short reference per file.

1. **Google Cloud project** (console.cloud.google.com, free): enable **Google Drive API**.
2. **OAuth consent screen**: External, add your Google account as owner, scope `.../auth/drive.file`.
   **Publish the app ("In production")** — in "Testing" mode Google expires the refresh token after 7 days and uploads stop.
   `drive.file` is a non-sensitive scope, so publishing needs no Google review.
3. **Credentials → OAuth client ID** → type *Web application*, redirect URI `https://developers.google.com/oauthplayground`.
4. **Refresh token**: open developers.google.com/oauthplayground → ⚙ → "Use your own OAuth credentials" (paste client ID/secret) →
   scope `https://www.googleapis.com/auth/drive.file` → Authorize → "Exchange authorization code for tokens" → copy the **refresh token**.
5. **Drive folder**: create a folder (e.g. *Emerald files*) in that same Google account. Its ID is the last part of the folder URL.
   With `drive.file`, the app can only see files it created plus this folder once you upload through it — create the folder **via the app**
   is not required; any folder you own works because uploads name it as parent.
6. **Supabase secrets** (Dashboard → Edge Functions → Secrets, or CLI):
   ```
   supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… GOOGLE_REFRESH_TOKEN=… DRIVE_FOLDER_ID=…
   supabase functions deploy drive-media
   ```
7. Open Emerald and sign in. Photos already saved inside records are moved to Drive automatically on first sign-in.

The refresh token stops working if you revoke Emerald's access in your Google account or change the account password with "sign out everywhere". Repeat step 4 then.
