import type { NextConfig } from "next";

// Every page here is personal to the signed-in visitor, so nothing is cached between people.
const nextConfig: NextConfig = {
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
