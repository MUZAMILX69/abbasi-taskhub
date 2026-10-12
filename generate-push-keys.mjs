import { createECDH, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const publicKey = ecdh.getPublicKey().toString("base64url");
const privateKey = ecdh.getPrivateKey().toString("base64url");
const secret = randomBytes(32).toString("hex");
writeFileSync("push-secrets.env", [
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${privateKey}`,
  "VAPID_SUBJECT=mailto:REPLACE_WITH_YOUR_REAL_EMAIL",
  `TASK_PUSH_WEBHOOK_SECRET=${secret}`,
  "",
].join("\n"), { flag: "wx", mode: 0o600 });
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
console.log("Private server secrets saved to push-secrets.env. Edit the email before uploading to Supabase. Do not commit this file. Generate only once and keep the same keys.");
