import { ImageResponse } from "next/og";

const SIZES: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
  "apple-touch-icon.png": { size: 180, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((file) => ({ file }));
}

/** App icons: concentric rings (a target), drawn at build time. Maskable icons keep the art inside the safe zone. */
export async function GET(_req: Request, ctx: RouteContext<"/icons/[file]">) {
  const { file } = await ctx.params;
  const spec = SIZES[file];
  if (!spec) return new Response("Not found", { status: 404 });
  const { size, maskable } = spec;
  const ring = (d: number, w: number) => (
    <div style={{ position: "absolute", width: d, height: d, borderRadius: d, border: `${w}px solid #ffffff` }} />
  );
  const art = maskable ? 0.6 : 0.78;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#171717", borderRadius: maskable ? 0 : size * 0.22, position: "relative" }}>
        {ring(size * art, size * 0.06)}
        {ring(size * art * 0.62, size * 0.06)}
        <div style={{ position: "absolute", width: size * art * 0.22, height: size * art * 0.22, borderRadius: size, background: "#ffffff" }} />
      </div>
    ),
    { width: size, height: size },
  );
}
