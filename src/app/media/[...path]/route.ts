import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_MEDIA_DIR, storageConfigured } from "@/lib/media/images";

const SEGMENT = /^[a-z0-9-]{1,80}(\.webp)?$/;

/** Local stand-in for the CDN when object storage is not configured (dev, e2e). */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...path]">) {
  if (storageConfigured()) return new Response(null, { status: 404 });
  const parts = (await ctx.params).path;
  if (parts.length !== 2 || !parts.every((p) => SEGMENT.test(p)) || !parts[1]!.endsWith(".webp")) {
    return new Response(null, { status: 404 });
  }
  try {
    const data = await readFile(path.join(LOCAL_MEDIA_DIR, ...parts));
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
