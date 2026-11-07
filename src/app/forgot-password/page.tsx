import { connection } from "next/server";
import { ForgotPasswordView } from "@/components/recovery-pages";
export const metadata = { title: "Forgot password" };
export default async function Page() {
  await connection(); // render per request so the CSP nonce reaches the page scripts
  return <ForgotPasswordView/>;
}
