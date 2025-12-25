import { NextResponse } from 'next/server';

// API-Route zum Bereitstellen einer m3u-Liste über den eigenen Proxy
// API route to provide an m3u list via the own proxy
//
// Diese Route lädt die Kanalliste von vavoo.to, wandelt sie in m3u8 um und routet alle Streams über /api/proxy
// This route fetches the channel list from vavoo.to, converts it to m3u8 and routes all streams via /api/proxy

const VAVOO_URL = 'https://www.vavoo.to/live2/index?output=json';

export async function GET() {
  try {
    // Hole die Kanalliste von VAVOO / Fetch channel list from VAVOO
    const res = await fetch(VAVOO_URL);
    if (!res.ok) {
      return NextResponse.json({
        error: {
          de: 'Fehler beim Laden der Kanalliste.',
          en: 'Error loading channel list.'
        }
      }, { status: 502 });
    }
    const data = await res.json();

    // m3u8-Header
    let m3u = '#EXTM3U\n';

    // Für jeden Kanal einen Eintrag erzeugen / Create entry for each channel
    for (const channel of data) {
      // Name und Stream-URL extrahieren / Extract name and stream url
      const name = channel.name || 'Unknown';
      const url = channel.url;
      if (!url) continue;
      // Proxy-URL bauen / Build proxy url
      const proxyUrl = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/proxy?url=${encodeURIComponent(url)}`;
      m3u += `#EXTINF:-1,${name}\n${proxyUrl}\n`;
    }

    // m3u8 als Text zurückgeben / Return m3u8 as text
    return new Response(m3u, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-mpegURL; charset=utf-8',
        'Content-Disposition': 'attachment; filename="iptv-proxy.m3u8"',
      },
    });
  } catch (error) {
    // Fehlerbehandlung / Error handling
    return NextResponse.json({
      error: {
        de: 'Fehler beim Generieren der m3u-Liste: ' + (error as Error).message,
        en: 'Error generating m3u list: ' + (error as Error).message
      }
    }, { status: 500 });
  }
} 