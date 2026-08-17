import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tunnels and forwarded ports arrive with a hostname Vite has never heard of
  // and are refused with "Blocked request" unless it is told to expect them.
  // This only ever serves a static maze game, so there is nothing behind it for
  // a DNS-rebinding attack to reach.
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
})
