import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	// Dev-only: allow access through any host (local LAN IPs and
	// trycloudflare tunnels used for live demos). Irrelevant to the
	// production build.
	server: {
		allowedHosts: true,
	},
});
