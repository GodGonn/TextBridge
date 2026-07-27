import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TextBridge",
    short_name: "TextBridge",
    description: "Send text and files between your devices instantly.",
    start_url: "/",
    display: "standalone",
    background_color: "#07110d",
    theme_color: "#10b981",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          { name: "files", accept: ["image/*", "video/*", "audio/*", "text/*", "application/pdf", "application/octet-stream"] },
        ],
      },
    },
  };
}
