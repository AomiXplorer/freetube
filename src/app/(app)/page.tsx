import type { Metadata } from "next";
import { HomeFeed } from "@/components/home/home-feed";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <HomeFeed />;
}
