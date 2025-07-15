import type { NextConfig } from "next";

// Globale Umgebungsvariablen für die App / Global environment variables for the app
const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  },
};

export default nextConfig;
