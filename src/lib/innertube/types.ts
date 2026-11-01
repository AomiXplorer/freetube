/** Domain models shared by the parsers, API routes and UI. */

export type Thumbnail = { url: string; width?: number; height?: number };

export type ChannelRef = {
  id?: string;
  name: string;
  handle?: string;
  avatar?: Thumbnail[];
  subscribers?: string;
  verified?: boolean;
  url?: string;
};

export type VideoKind = "video" | "short" | "live" | "upcoming";

export type VideoSummary = {
  id: string;
  kind: VideoKind;
  title: string;
  thumbnails: Thumbnail[];
  channel: ChannelRef;
  durationSeconds?: number;
  durationText?: string;
  viewCountText?: string;
  views?: number;
  publishedText?: string;
  description?: string;
  badges?: string[];
};

export type CategoryChip = {
  title: string;
  params?: string;
  browseId?: string;
  selected?: boolean;
};

export type HomeFeed = {
  chips: CategoryChip[];
  sections: { title?: string; items: VideoSummary[] }[];
  continuation?: string;
};

export type VideoStreamFormat = {
  itag: number;
  url: string;
  mimeType: string;
  qualityLabel?: string;
  height?: number;
  width?: number;
  fps?: number;
  bitrate?: number;
  contentLength?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  codecs?: string;
  audioQuality?: string;
};

export type CaptionTrack = {
  language: string;
  label: string;
  baseUrl: string;
  isAutomatic: boolean;
};

export type Chapter = {
  title: string;
  startSeconds: number;
  thumbnails?: Thumbnail[];
};

export type VideoDetails = {
  id: string;
  title: string;
  description: string;
  channel: ChannelRef;
  views?: number;
  viewCountText?: string;
  likeCountText?: string;
  publishedText?: string;
  durationSeconds?: number;
  thumbnails: Thumbnail[];
  keywords?: string[];
  isLive: boolean;
  isUpcoming: boolean;
  isAgeRestricted: boolean;
  playable: boolean;
  playabilityReason?: string;
  chapters: Chapter[];
  captions: CaptionTrack[];
  category?: string;
};

export type StreamInfo = {
  formats: VideoStreamFormat[];
  /** Durability hint for the client: signed googlevideo URLs expire. */
  expiresAt?: number;
  hlsManifestUrl?: string;
  dashManifestUrl?: string;
};

export type WatchNext = {
  details: VideoDetails;
  streams: StreamInfo | null;
  commentsContinuation?: string;
  related: VideoSummary[];
};

export type Comment = {
  id: string;
  author: string;
  authorAvatar?: Thumbnail[];
  authorChannelId?: string;
  content: string;
  publishedText?: string;
  likeCountText?: string;
  replyCount?: number;
  isPinned?: boolean;
  isOwner?: boolean;
  isHearted?: boolean;
};

export type CommentsPage = {
  comments: Comment[];
  continuation?: string;
  disabled: boolean;
};

export type PlaylistSummary = {
  id: string;
  title: string;
  videoCount?: number;
  thumbnails: Thumbnail[];
  channel?: ChannelRef;
};

export type ChannelPage = {
  id: string;
  title: string;
  handle?: string;
  description?: string;
  avatar?: Thumbnail[];
  banner?: Thumbnail[];
  subscribers?: string;
  videoCountText?: string;
  verified?: boolean;
  tabs: { title: string; params?: string }[];
  videos: VideoSummary[];
  shorts: VideoSummary[];
  playlists: PlaylistSummary[];
  continuation?: string;
};

export type GuideEntry = {
  title: string;
  browseId?: string;
  url?: string;
  icon?: string;
  items?: GuideEntry[];
  isPrimary?: boolean;
};

export type SearchPage = {
  query: string;
  videos: VideoSummary[];
  channels: ChannelRef[];
  playlists: PlaylistSummary[];
  continuation?: string;
};

export type PlaylistPage = {
  id: string;
  title: string;
  description?: string;
  channel?: ChannelRef;
  videoCount?: number;
  views?: string;
  videos: VideoSummary[];
  continuation?: string;
};
