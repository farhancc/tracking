/**
 * Generates a VAPID key pair for Web Push. Paste the output into .env.local
 * (development) or the hosting environment (production). Changing the keys
 * invalidates every existing push subscription; devices must re-enable push.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
