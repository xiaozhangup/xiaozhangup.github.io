const ORIGIN = 'https://blog.xiaozhangup.me';
const API = 'https://api.spotify.com/v1';
const headers = { 'Access-Control-Allow-Origin': ORIGIN, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
const reply = (data, status = 200, cacheControl = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Cache-Control': cacheControl } });

function trackDetails(track) {
  return {
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    cover: track.album.images[1]?.url || track.album.images[0]?.url,
    url: track.external_urls.spotify,
    duration_ms: track.duration_ms,
  };
}

async function nowPlaying(spotify) {
  const response = await spotify('/me/player/currently-playing');
  if (response.status === 204) return reply({ playing: false });
  if (!response.ok) return reply({ error: 'Spotify unavailable' }, 502);
  const data = await response.json();
  if (!data.is_playing || !data.item || data.currently_playing_type !== 'track') return reply({ playing: false });
  return reply({ playing: true, ...trackDetails(data.item), progress_ms: data.progress_ms });
}

function recentArtists(items) {
  const artists = new Map();
  for (const { track } of items) {
    for (const artist of track.artists) {
      if (artist.external_urls.spotify && !artists.has(artist.id)) {
        artists.set(artist.id, { name: artist.name, url: artist.external_urls.spotify });
      }
    }
  }
  return [...artists.values()].slice(0, 12);
}

async function listening(spotify, cacheKey, ctx) {
  const [recentResponse, artistsResponse] = await Promise.all([
    spotify('/me/player/recently-played?limit=30'),
    spotify('/me/top/artists?time_range=short_term&limit=12'),
  ]);

  const items = recentResponse.ok ? (await recentResponse.json()).items : null;
  const uniqueTracks = new Map();
  for (const { track } of items ?? []) {
    if (track.external_urls.spotify && !uniqueTracks.has(track.id)) {
      uniqueTracks.set(track.id, trackDetails(track));
    }
  }
  const tracks = items && [...uniqueTracks.values()].slice(0, 20);
  const artists = artistsResponse.ok
    ? (await artistsResponse.json()).items.map((artist) => ({
        name: artist.name,
        image: artist.images[1]?.url || artist.images[0]?.url,
        url: artist.external_urls.spotify,
      })).filter((artist) => artist.url)
    : items && recentArtists(items);

  if (!tracks && !artists) {
    const unauthorized = [recentResponse, artistsResponse].some((response) => response.status === 403);
    return reply({ error: unauthorized ? 'Spotify listening scopes required' : 'Spotify history unavailable' }, 502);
  }

  const response = reply({ tracks, artists, artistSource: artistsResponse.ok ? 'top' : 'recent' }, 200, 'public, max-age=120');
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !['/now-playing', '/listening'].includes(url.pathname)) return reply({ error: 'Not found' }, 404);
    try {
      const cacheKey = new Request(new URL('/listening', url));
      if (url.pathname === '/listening') {
        const cached = await caches.default.match(cacheKey);
        if (cached) return cached;
      }
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
      });
      if (!tokenResponse.ok) return reply({ error: 'Spotify authorization unavailable' }, 502);
      const { access_token } = await tokenResponse.json();
      const spotify = (path) => fetch(API + path, { headers: { Authorization: `Bearer ${access_token}` } });
      return await (url.pathname === '/listening' ? listening(spotify, cacheKey, ctx) : nowPlaying(spotify));
    } catch {
      return reply({ error: 'Spotify unavailable' }, 502);
    }
  },
};
