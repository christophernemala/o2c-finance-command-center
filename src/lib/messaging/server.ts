import "server-only";
import { emailSender } from "../email/server";
import type { ChannelSenders } from "../collections/send";
import { twilioConfig, twilioSender } from "./twilio";
export function collectionSenders(): ChannelSenders {
  const sms = twilioConfig(process.env, "sms"), whatsapp = twilioConfig(process.env, "whatsapp");
  return { email: emailSender(), sms: sms ? twilioSender(sms, "sms") : null, whatsapp: whatsapp ? twilioSender(whatsapp, "whatsapp") : null };
}
