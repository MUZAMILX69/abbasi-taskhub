# Files to upload to GitHub

Extract this ZIP. Its folders match your repository paths. Upload the FILES into
these exact paths; do not put the whole patch inside an extra folder.

## Replace existing files

| Path in GitHub | Change |
| --- | --- |
| src/App.jsx | Mobile notification button, push subscription integration, assignment alerts, sign-out cleanup |
| src/main.jsx | One immediate service-worker registration |
| public/sw.js | Mobile push handling, click-to-open, removal of stale old caches |
| index.html | Remove duplicate inline service-worker registration |
| .gitignore | Exclude private environment files and generated push secrets |

## Add new files

| Path in GitHub | Purpose |
| --- | --- |
| src/notifications.js | Mobile permission, service-worker alerts and push subscription management |
| .env.example | Public VAPID variable example; set its real value in hosting settings |
| generate-push-keys.mjs | Run on your PC once to generate public/private push keys |
| supabase/push-subscriptions.sql | Run once in Supabase SQL Editor |
| supabase/functions/send-task-push/index.ts | Deploy this Supabase Edge Function |
| supabase/config.toml | Function configuration; merge its section if you already have this file |
| PRODUCTION-SETUP.md | Follow this for keys, hosting variables, function, webhook and phone testing |
| CHANGED-FILES.md | This upload checklist |

## Delete

No files need deletion.

## Unchanged

package.json, package-lock.json, vite.config.js, CSS files, supabaseClient.js,
manifest and all logos are unchanged. No additional frontend dependency is needed.

The uploaded names App(8).jsx, main(1).jsx, sw(1).js and index(1).html were mapped
to the normal repository filenames shown above. Do not use the upload suffixes
in GitHub. This patch assumes your app is hosted at the domain root (/).

## Deploy in order

1. Upload the files listed above to their GitHub paths.
2. Run the SQL; generate keys on your PC; configure and deploy the Supabase function;
   create its database webhook. See PRODUCTION-SETUP.md for exact steps.
3. Add VITE_VAPID_PUBLIC_KEY to Vercel's production environment variables and
   redeploy. For a fresh Vercel project, use Vite, build command npm run build,
   output directory dist, and Node 22.12+ or a supported newer version.
4. Open the app on each employee phone and press My Profile > Enable / Test
   Notifications. Test assignment alerts with the phone locked.

Upload neither node_modules nor dist, and never upload push-secrets.env.
Replacing the frontend alone fixes local mobile display; background alerts need
all of the server setup. The server code is included but has not been deployed
into your Supabase project by this patch.
