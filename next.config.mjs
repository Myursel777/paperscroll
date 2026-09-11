/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build output folder. Overridable so a production build for the tests can
  // sit next to a running dev server instead of both writing to .next:
  //   NEXT_DIST_DIR=.next-test npm run build
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};
export default nextConfig;
