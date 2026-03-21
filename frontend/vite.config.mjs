import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const currentFilePath = fileURLToPath(import.meta.url);
const frontendDir = path.dirname(currentFilePath);

export default defineConfig({
  root: frontendDir,
  plugins: [react()],
  build: {
    outDir: path.join(frontendDir, "dist"),
    emptyOutDir: true,
  },
});
