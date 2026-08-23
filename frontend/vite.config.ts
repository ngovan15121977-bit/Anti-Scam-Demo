import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Render Static Sites can occasionally serve a deep-link before a dashboard
// rewrite rule has propagated. Emit an index.html in every client-side route
// directory so direct requests such as /login still load the React app.
const spaRoutes = [
  "terms",
  "privacy",
  "mission",
  "login",
  "register",
  "forgot-password",
  "confirm-location",
  "setup-pin",
  "setup-face",
  "dashboard",
  "transfer",
  "history",
  "me",
  "notifications",
  "help",
  "qr",
  "admin",
];

function emitSpaRouteEntries() {
  return {
    name: "emit-spa-route-entries",
    apply: "build" as const,
    closeBundle() {
      const indexPath = path.resolve(__dirname, "dist/index.html");
      if (!fs.existsSync(indexPath)) return;

      for (const route of spaRoutes) {
        const routeDirectory = path.resolve(__dirname, "dist", route);
        fs.mkdirSync(routeDirectory, { recursive: true });
        fs.copyFileSync(indexPath, path.join(routeDirectory, "index.html"));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), emitSpaRouteEntries()],
  // Local backend and frontend share the root .env. Vite still exposes only
  // variables prefixed with VITE_ to browser code, so backend secrets remain
  // server-only while VITE_GOOGLE_CLIENT_ID is available to the login page.
  envDir: path.resolve(__dirname, ".."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],  // ← THÊM DÒNG NÀY
  },
  server: {
    port: 5173,
    // Keep the HMR client pointed at the same local origin when Vite is
    // restarted or accessed through localhost in the browser.
    hmr: {
      protocol: "ws",
      host: "localhost",
      clientPort: 5173,
    },
    // Google Identity Services opens a popup and communicates with it via
    // postMessage; this policy allows that flow during local development.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
      "/media": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
