import { Spinner } from "@/components/ui/controls";
export default function Loading() { return <main id="main" className="grid min-h-screen place-items-center"><p role="status" className="inline-flex items-center gap-2 text-muted"><Spinner size={18}/>Loading your authenticated workspace…</p></main>; }
