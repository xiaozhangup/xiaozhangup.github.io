const ORIGIN = 'https://blog.xiaozhangup.me';
const headers = { 'Access-Control-Allow-Origin': ORIGIN, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/now-playing') return reply({ error: 'Not found' }, 404);
    try {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
      });
      if (!tokenResponse.ok) return reply({ error: 'Spotify authorization unavailable' }, 502);
      const { access_token } = await tokenResponse.json();
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${access_token}` } });
      if (response.status === 204) return reply({ playing: false });
      if (!response.ok) return reply({ error: 'Spotify unavailable' }, 502);
      const data = await response.json();
      if (!data.is_playing || !data.item || data.currently_playing_type !== 'track') return reply({ playing: false });
      return reply({ playing: true, title: data.item.name, artist: data.item.artists.map(a => a.name).join(', '), cover: data.item.album.images[1]?.url || data.item.album.images[0]?.url, url: data.item.external_urls.spotify });
    } catch {
      return reply({ error: 'Spotify unavailable' }, 502);
    }
  },
};
