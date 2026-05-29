import mdx from "@astrojs/mdx";
import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://docs-production-368b.up.railway.app",
  // `astro preview` binds Railway's injected PORT (host 0.0.0.0); 4321 locally.
  server: {
    host: true,
    port: Number(process.env.PORT) || 4321,
  },
  // `astro preview` runs through Vite, which rejects unknown Host headers. Railway's proxy
  // forwards an arbitrary *.up.railway.app host, so allow it here.
  vite: {
    preview: {
      allowedHosts: true,
    },
  },
  integrations: [
    starlight({
      title: "Ollive Docs",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/sobebarali/ollive",
        },
      ],
      sidebar: [
        {
          label: "Tutorials",
          items: [{ autogenerate: { directory: "tutorials" } }],
        },
        {
          label: "How-to guides",
          items: [{ autogenerate: { directory: "guides" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Explanation",
          items: [{ autogenerate: { directory: "explanation" } }],
        },
      ],
    }),
    mdx({ optimize: true }),
  ],
});
