import type { Metadata } from "next";
import { PlaylistPage } from "@/components/library/playlist-page";

export const metadata: Metadata = { title: "Playlist" };

export default function Page() {
  return <PlaylistPage />;
}
