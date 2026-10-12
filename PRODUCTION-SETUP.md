# Abbasi TaskHub production setup

These files fix mobile notification display and provide background Web Push.
Your previous app used `new Notification()`, which throws on most mobile browsers.
It also had buttons nested inside a button and a service-worker push handler with
no subscription or server sender. Keeping the screen awake does not provide
background push.

## 1. Copy the frontend files into your existing project

| File in this download | Destination in your existing Vite project |
| --- | --- |
| src/App.jsx | src/App.jsx (replace your App (16).jsx content) |
| src/main.jsx | src/main.jsx |
| src/notifications.js | src/notifications.js (new) |
| public/sw.js | public/sw.js |

Keep your CSS and manifest unchanged. Replace index.html with the supplied version to remove its duplicate service-worker registration. Your supplied App(1).css must
be named `src/App.css`, because App.jsx imports that name. Ensure the existing
manifest is `public/manifest.webmanifest` and the referenced logo files are
`public/logo-192.png` and `public/logo-512.png`. Both PNG icons are present and their dimensions were verified.
This is a patch for your existing project, not a standalone full project.
No new frontend npm package is required.

First deploy/rebuild the frontend over HTTPS, reload it on your phone, sign in,
and open My Profile > Enable / Test Notifications. Allow permission. You should
receive a test notification. Without the remaining steps, only task alerts while
the page is running are available. The test verifies local notification display,
not the server webhook.

## 2. Create the push subscription table

In your existing Supabase project, open SQL Editor and run the contents of
`supabase/push-subscriptions.sql` once. It creates the new table with policies
restricting each signed-in user to their own subscriptions. It also enables
Realtime for tasks. Existing tasks/users are not modified.

Your existing task SELECT/RLS policies must allow each employee to read their
assigned tasks for open-app Realtime updates. This patch does not loosen those
policies. Background sending uses the server's service-role key.

## 3. Generate the public/private push keys on your own PC

From the extracted download folder, run:

```powershell
node generate-push-keys.mjs
```

This prints the PUBLIC Vite variable and creates `push-secrets.env` containing
server secrets. Run it only once; save the keys privately. It refuses to overwrite
an existing secrets file. Edit `VAPID_SUBJECT` in that file to use your real email,
for example `mailto:you@example.com`.

Add the printed `VITE_VAPID_PUBLIC_KEY` value to your project `.env.local` for local
builds and to Vercel > Project > Settings > Environment Variables for the deployed
app. Rebuild/redeploy after adding it. The frontend value must match the server's
`VAPID_PUBLIC_KEY` exactly. Never put the private key, webhook secret, or a Supabase
service-role key into a VITE variable or commit push-secrets.env.

## 4. Deploy the Supabase Edge Function

You can use the Supabase Dashboard or the CLI below.

**Dashboard:** Create an Edge Function named `send-task-push`. Paste
`supabase/functions/send-task-push/index.ts` into its index.ts and deploy. Turn
OFF the function's legacy JWT verification setting, because this webhook uses
its own `x-task-push-secret` check. In Edge Functions > Secrets, add these values
from push-secrets.env:

- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT (your actual mailto email)
- TASK_PUSH_WEBHOOK_SECRET

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by hosted Supabase;
do not put them in your React code.

**CLI alternative:** Copy the provided `supabase` folder into your existing
project. If you already have config.toml, merge only the function section.
Run these commands from that project, using the keys file's correct path:

```powershell
npx supabase login
npx supabase link --project-ref ybjqqyocjfdnwejxkwwz
npx supabase secrets set --env-file push-secrets.env
npx supabase functions deploy send-task-push --no-verify-jwt
```

The function imports web-push itself; no npm install is needed in the React app.
It sends alerts for new assignments (INSERT) and reassignment to another user
(UPDATE). Completion and routine edits do not send another assignment alert.
Expired subscriptions are removed. Only supported Google, Mozilla, Apple, and
Windows HTTPS push destinations are accepted.

## 5. Create the database webhook (required)

In Supabase > Database > Webhooks, enable webhooks if needed and create ONE hook:

| Setting | Value |
| --- | --- |
| Name | task-assignment-push |
| Table | public.tasks |
| Events | INSERT and UPDATE |
| Method | POST |
| URL | https://ybjqqyocjfdnwejxkwwz.supabase.co/functions/v1/send-task-push |
| Timeout | 15000 ms |
| Header Content-Type | application/json |
| Header x-task-push-secret | Exact TASK_PUSH_WEBHOOK_SECRET from push-secrets.env |

Do not use the public Supabase publishable key as the webhook secret. Delete any
older duplicate task-push webhooks, so only one sends assignment alerts.

## 6. Enable each phone and verify real background delivery

1. On Android, open the HTTPS app in Chrome. On iPhone/iPad (iOS 16.4+), add it to
   the Home Screen and open that installed app.
2. Sign in as the employee, then My Profile > Enable / Test Notifications.
3. Confirm the page says the device's subscription was saved. In Supabase,
   push_subscriptions should have a row for that employee/device.
4. From another account/device, assign a NEW task to that employee. First test
   with their app open, then with it in the background and the screen locked.
5. Repeat on every employee phone. Signing out disables that device's subscription;
   enable again after signing back in. Multiple phones per employee are supported.

Keep internet access and browser/app notifications enabled. Sounds and vibration
are controlled by the phone/browser, Focus/Do Not Disturb, and notification
settings. Do not force-stop the browser; OS restrictions can delay or block push.

## If the test works but new tasks do not notify

- No subscription row: check the frontend public key, SQL setup and button error.
- No function invocation: the database webhook is missing or points to the wrong URL.
- Function returns 401: the webhook secret/header does not match the function secret.
- Function returns 500: check Edge Function logs and the required secrets/table.
- Response `devices: 0`: the assignee has not saved a subscription on this phone.
- Response `failed`: check function logs for push-provider failures/key mismatch.
- Response `expired`: re-enable notifications on the phone.
- Response `invalid_endpoint`: check the subscription's push-provider domain before
  explicitly extending the server's allowlist for that provider.
- Test cannot activate the worker: /sw.js must return this JavaScript file rather
  than your hosting site's HTML fallback. Reload after deployment.
- On iPhone, permission unavailable: use the installed Home Screen app on iOS 16.4+.

A push handler in sw.js cannot receive database changes by itself. The database
webhook, server sender and saved phone subscription are all necessary. Delivery
is best effort; this implementation has no durable retry queue. Missed tasks
remain visible when the employee opens the app again. Duplicate webhook calls
share a task notification tag but may still alert again.

## Validation and references

Validation completed on the full project:

- `npm ci --ignore-scripts --no-audit --no-fund` succeeded using the supplied lockfile.
- `npm run build` passed (Vite 8.3.4).
- `npm run lint` exited successfully: 11 warnings, no errors. Warnings concern
  React effects and hook dependencies; they do not block this build.
- Notification helper/worker tests passed with mocked browser and Supabase APIs.
- Server tests passed for authentication, assignment sending, skipped ordinary
  updates/obsolete assignments, and removal of expired subscriptions.
- Built manifest, service worker and icon dimensions verified.

The hosted Supabase function and delivery to a real phone have not been tested.
Complete the deployment test in step 6 before relying on background alerts.

- https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://supabase.com/docs/guides/database/webhooks
- https://supabase.com/docs/guides/functions/function-configuration
- https://github.com/web-push-libs/web-push
