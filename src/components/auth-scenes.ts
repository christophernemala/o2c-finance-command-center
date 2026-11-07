/**
 * Left-panel photography and copy for the sign-in screens.
 * Photos: Unsplash (https://unsplash.com/license), self-hosted under public/auth because the CSP allows only same-origin images.
 */
export const authScenes = {
  signin: { image: "/auth/signin.jpg", width: 1600, height: 1067, position: "50% 40%", eyebrow: "Order to cash, closed", headline: "Every invoice, every payment, one loop.", body: "Receivables, cash application, collections and credit in one accountable workspace." },
  signup: { image: "/auth/signup.jpg", width: 1600, height: 1067, position: "50% 50%", eyebrow: "Start your workspace", headline: "Built for finance teams that close fast.", body: "Request access for your team. An administrator reviews every new workspace." },
  otp: { image: "/auth/otp.jpg", width: 1600, height: 1067, position: "50% 50%", eyebrow: "Verify it’s you", headline: "One code. Your books stay yours.", body: "Codes are single use, expire quickly and are checked on the server." },
  forgot: { image: "/auth/forgot.jpg", width: 1600, height: 1068, position: "60% 50%", eyebrow: "Account recovery", headline: "Locked out? Get back in, securely.", body: "Recovery runs through your verified work email or your administrator." },
  reset: { image: "/auth/reset.jpg", width: 1600, height: 1600, position: "50% 50%", eyebrow: "Secure your access", headline: "A new password. Same protected vault.", body: "Passwords are set only through a verified, single-use link." },
} as const;
export type AuthScene = keyof typeof authScenes;
