// Only the PUBLIC VAPID key belongs in Vite. Never put the private key here.
const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
let workerPromise;

function checkSupport() {
  if (!window.isSecureContext) throw new Error("Notifications require HTTPS (or localhost for testing).");
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Notifications are unsupported here. On iPhone/iPad (iOS 16.4+), add this app to the Home Screen and open it from there. On Android, use Chrome rather than an in-app browser.");
  }
}

export async function registerWorker() {
  checkSupport();
  if (!workerPromise) {
    workerPromise = (async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      let timeout;
      try {
        return await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Service worker did not activate. Check that /sw.js is served as JavaScript, then reload.")), 15000);
          }),
        ]);
      } finally { clearTimeout(timeout); }
    })().catch((error) => { workerPromise = undefined; throw error; });
  }
  return workerPromise;
}

export async function showMobileNotification(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await registerWorker();
  await registration.showNotification(title, {
    icon: "/logo-192.png", badge: "/logo-192.png",
    vibrate: [200, 100, 200], data: { url: "/" }, ...options,
  });
}

function decodeKey(value) {
  const padded = (value + "=".repeat((4 - value.length % 4) % 4))
    .replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function enableMobileNotifications(client, userId) {
  checkSupport();
  // Request permission before awaiting registration: keep the user's button gesture.
  const permission = Notification.permission === "granted"
    ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications were not allowed. Enable this site's notifications in browser/phone settings, then try again.");
  }
  const registration = await registerWorker();
  if (!publicKey) return {
    background: false,
    message: "Test notification sent. Open-app alerts are enabled. Background alerts are not configured: complete PRODUCTION-SETUP.md and add VITE_VAPID_PUBLIC_KEY to your hosting environment, then rebuild.",
  };
  if (!registration.pushManager) throw new Error("This browser cannot subscribe to background push notifications.");
  if (!userId) throw new Error("Sign in before enabling task alerts.");
  const key = decodeKey(publicKey);
  if (key.length !== 65) throw new Error("The VAPID public key is invalid. Copy the complete public key from the key generator.");
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = subscription?.options.applicationServerKey;
  if (subscription && previousKey &&
      Array.from(new Uint8Array(previousKey)).join() !== Array.from(key).join()) {
    const { error } = await client.from("push_subscriptions").delete()
      .eq("user_id", userId).eq("endpoint", subscription.endpoint);
    if (error) throw new Error(`Could not replace old push subscription: ${error.message}`);
    if (!(await subscription.unsubscribe())) throw new Error("Could not reset the previous push subscription. Try again.");
    subscription = null;
  }
  if (!subscription) subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: key,
  });
  const data = subscription.toJSON();
  const { error } = await client.from("push_subscriptions").upsert({
    user_id: userId, endpoint: subscription.endpoint,
    p256dh: data.keys.p256dh, auth: data.keys.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw new Error(`Phone permission is granted, but background registration was not saved: ${error.message}. Complete the database setup in PRODUCTION-SETUP.md.`);
  return { background: true, message: "Test notification sent and this device's push subscription saved. Background task alerts also require the deployed function and database webhook in PRODUCTION-SETUP.md." };
}

export async function hasSavedPushSubscription(client, userId) {
  if (!publicKey || !("Notification" in window) || Notification.permission !== "granted") return false;
  const registration = await registerWorker();
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) return false;
  const { data, error } = await client.from("push_subscriptions").select("endpoint")
    .eq("user_id", userId).eq("endpoint", subscription.endpoint).maybeSingle();
  return !error && !!data;
}

export async function removePushSubscription(client, userId) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  // Detach from the account before signing out so the next user does not get its tasks.
  const { error } = await client.from("push_subscriptions").delete()
    .eq("user_id", userId).eq("endpoint", subscription.endpoint);
  // Before SQL setup, there cannot be any saved server subscription.
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
  if (!(await subscription.unsubscribe())) throw new Error("Could not disable browser push. Please retry.");
}
