import { connection } from "next/server";
import { ResetPasswordView } from "@/components/recovery-pages";
export const metadata = { title: "Reset password" };
export default async function Page() {
  await connection(); // render per request so the CSP nonce reaches the page scripts
  return <ResetPasswordView/>;
}
