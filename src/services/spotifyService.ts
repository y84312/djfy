import axios from 'axios';

const getAccessToken = () => {
  const match = document.cookie.match(new RegExp('(^| )spotify_access_token=([^;]+)'));
  return match ? match[2] : null;
};

const spotifyApi = axios.create({
  baseURL: '/api/spotify',
});

spotifyApi.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const searchArtists = async (query: string) => {
  const response = await spotifyApi.get('search', {
    params: { q: query, type: 'artist', limit: 5 },
  });
  return response.data.artists.items;
};

export const getArtistTopTracks = async (artistId: string) => {
  const response = await spotifyApi.get(`artists/${artistId}/top-tracks`, {
    params: { market: 'US' },
  });
  return response.data.tracks;
};

export const getAudioFeatures = async (trackIds: string[]) => {
  const response = await spotifyApi.get('audio-features', {
    params: { ids: trackIds.join(',') },
  });
  return response.data.audio_features;
};
