export interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  duration_ms: number;
  preview_url: string | null;
  tempo?: number;
  key?: number;
  mode?: number;
  energy?: number;
}

export interface Artist {
  id: string;
  name: string;
  images: { url: string }[];
}
