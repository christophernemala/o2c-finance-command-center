import Link from "next/link";
import { KeyRound, LockKeyhole, Mail, UserRoundCheck } from "lucide-react";
import { AuthShell } from "./auth-shell";

/** Recovery guidance only. Self-service reset links are not implemented, so this page sends no email and changes no account. */
export function ForgotPasswordView() {
  return <AuthShell scene="forgot">
    <div className="mb-5 inline-flex rounded-xl bg-primary-soft p-3 text-primary"><KeyRound size={24} aria-hidden="true"/></div>
    <h1>Forgot password</h1>
    <p className="mt-3 leading-6 text-muted">Self-service reset links aren’t available yet. You can still get back in securely:</p>
    <ol className="mt-6 space-y-4">
      <li className="flex gap-3"><Mail size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true"/><span className="text-sm leading-6"><Link href="/login/code" className="font-semibold text-link underline underline-offset-4">Sign in with an email code</Link>. No password is needed, and the code is single use.</span></li>
      <li className="flex gap-3"><UserRoundCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true"/><span className="text-sm leading-6">Or ask your workspace administrator to restore your access.</span></li>
    </ol>
    <p className="mt-8 text-sm"><Link href="/login" className="font-semibold text-link underline underline-offset-4">← Back to sign in</Link></p>
  </AuthShell>;
}

/** Placeholder for the reset-link destination. No reset tokens exist yet, so it accepts no password and changes nothing. */
export function ResetPasswordView() {
  return <AuthShell scene="reset">
    <div className="mb-5 inline-flex rounded-xl bg-primary-soft p-3 text-primary"><LockKeyhole size={24} aria-hidden="true"/></div>
    <h1>Set a new password</h1>
    <p className="mt-3 leading-6 text-muted">Password reset links aren’t issued yet, so there is nothing to reset from here. When they are, a link from your verified work email will open this page.</p>
    <div role="status" className="mt-6 rounded-lg border border-line bg-surface-muted p-4 text-sm leading-6">To get back in now, <Link href="/login/code" className="font-semibold text-link underline underline-offset-4">sign in with an email code</Link> or ask your workspace administrator.</div>
    <p className="mt-8 text-sm"><Link href="/login" className="font-semibold text-link underline underline-offset-4">← Back to sign in</Link></p>
  </AuthShell>;
}
