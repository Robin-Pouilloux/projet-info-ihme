import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const backend = `http://localhost:${env.API_PORT || "8001"}`;

  return {
    base: env.BASE_PATH || "/",
    envDir: "..",
    plugins: [react()],
    server: {
      proxy: {
        "/api": backend,
        "/docs": backend,
        "/openapi.json": backend,
      },
    },
  };
});
