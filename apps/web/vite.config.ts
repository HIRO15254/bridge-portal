import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackRouter({}),
		react(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: "Bridge Portal",
				short_name: "Bridge Portal",
				description: "A Cloudflare-ready TypeScript application template",
				theme_color: "#171717",
			},
			pwaAssets: { disabled: false, config: true },
		}),
	],
	resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
	server: { port: 3001 },
});
