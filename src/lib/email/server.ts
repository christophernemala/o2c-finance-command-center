import "server-only";
import { emailConfig, resendSender } from "./resend";
export function emailSender() { const config = emailConfig(); return config ? resendSender(config) : null; }
