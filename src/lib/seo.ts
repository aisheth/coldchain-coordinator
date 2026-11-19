export const meta = (title: string, description: string) => ({
  meta: [
    { title: `${title} · ColdTrack` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · ColdTrack` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
