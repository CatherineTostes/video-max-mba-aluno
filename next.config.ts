import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // These packages locate their platform binary relative to their own files on
  // disk. Bundled, that lookup breaks — so they are loaded from node_modules.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "@ffprobe-installer/ffprobe"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
