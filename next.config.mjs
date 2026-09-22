/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  distDir: process.env.CADENCE_DIST_DIR || ".next",
};
export default config;
