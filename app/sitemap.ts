import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://zeromaka.com",
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://zeromaka.com/login",
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
