/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so the landing page can be hosted on any CDN.
  output: process.env.NEXT_OUTPUT === "export" ? "export" : undefined,
  images: { unoptimized: true },
  // Relative asset paths for previews hosted under a sub-path (NEXT_ASSET_PREFIX=.)
  assetPrefix: process.env.NEXT_ASSET_PREFIX || undefined,
};
export default nextConfig;
