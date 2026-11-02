// Development only: lets the enquiry form work under `next dev`. In the
// built Worker, worker/index.ts answers /api/* before Next.js is reached, so
// this route never runs there (the shared code is lib/enquiry.ts).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleEnquiry } from "@/lib/enquiry";

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  return handleEnquiry(request, env as unknown as Parameters<typeof handleEnquiry>[1]);
}
