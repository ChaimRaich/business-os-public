import type { MetadataRoute } from "next";
import { SHARE_FIELD, SHARE_PATH } from "@/lib/share-target";

// Makes the system installable, so that Android offers it in the "Share" sheet of other apps.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business OS",
    short_name: "Business OS",
    description: "ניהול עסק קטן ובינוני במקום אחד: מלאי, קמפיינים וראיית חשבון",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: SHARE_PATH,
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [{ name: SHARE_FIELD, accept: ["image/*", "application/pdf", ".pdf"] }],
      },
    },
  };
}
