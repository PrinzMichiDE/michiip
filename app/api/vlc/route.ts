import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Route: /api/vlc
// Gibt eine optimierte m3u8-Playlist für VLC zurück, die /api/stream/[streamid] nutzt.
// Returns an optimized m3u8 playlist for VLC using /api/stream/[streamid].

const VAVOO_URL = 'https://www.vavoo.to/live2/index?output=json';

export const runtime = 'nodejs';

// Hilfsfunktion: Mapping aus rytec.channels.xml laden / Helper: load mapping from rytec.channels.xml
async function loadTvgNameMap(): Promise<Record<string, { id: string, name: string }>> {
  const xml = await fs.readFile(path.join(process.cwd(), 'rytec.channels.xml'), 'utf-8');
  const map: Record<string, { id: string, name: string }> = {};
  // Regex: <!-- ... --><channel id="...">...<!-- KANALNAME -->
  const regex = /<channel id="([^"]+)">[^<]*<\/channel><!--\s*([^<]+?)\s*-->/g;
  let match;
  while ((match = regex.exec(xml))) {
    const id = match[1];
    const name = match[2].replace(/\s*\(\d+\)\s*$/, '').trim(); // Klammern entfernen wie in Playlist
    if (!map[name]) map[name] = { id, name };
  }
  return map;
}

// Hilfsfunktion: Kodinerds-M3U parsen / Helper: parse Kodinerds M3U
async function loadKodinerdsM3U(): Promise<Array<{ name: string, tvgId: string, tvgName: string, tvgLogo: string, url: string }>> {
  try {
    const m3u = await fs.readFile(path.join(process.cwd(), 'kodinerds.m3u'), 'utf-8');
    const entries: Array<{ name: string, tvgId: string, tvgName: string, tvgLogo: string, url: string }> = [];
    const lines = m3u.split(/\r?\n/);
    let current: any = {};
    for (const line of lines) {
      if (line.startsWith('#EXTINF')) {
        const tvgId = (line.match(/tvg-id="([^"]*)"/) || [])[1] || '';
        const tvgName = (line.match(/tvg-name="([^"]*)"/) || [])[1] || '';
        const tvgLogo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
        const name = line.split(',').pop()?.trim() || '';
        current = { name, tvgId, tvgName, tvgLogo };
      } else if (line && !line.startsWith('#')) {
        entries.push({ ...current, url: line.trim() });
        current = {};
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    // Kanalliste von VAVOO laden / Fetch channel list from VAVOO
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

    // tvg-name/tvg-id-Mapping laden / Load tvg-name/tvg-id mapping
    let tvgMap: Record<string, { id: string, name: string }> = {};
    try {
      tvgMap = await loadTvgNameMap();
    } catch (e) {}

    // Kodinerds-M3U laden / Load Kodinerds M3U
    const kodinerds = await loadKodinerdsM3U();

    // Sender zusammenfassen / Group channels by name
    const channelMap: Record<string, { ids: string[], urls: string[], tvg: { id: string, name: string } | null, kodinerds: Array<{ url: string, tvgId: string, tvgName: string, tvgLogo: string }> }> = {};
    for (const channel of data) {
      let name = channel.name || 'Unknown';
      name = name.replace(/\s*\(\d+\)\s*$/, '');
      const url = channel.url;
      if (!url) continue;
      // Stream-ID extrahieren / Extract stream id
      const match = url.match(/play\/(\d+)/);
      const streamid = match ? match[1] : null;
      if (!streamid) continue;
      // tvg-Infos bestimmen / Determine tvg info
      const tvg = tvgMap[name] || null;
      if (!channelMap[name]) channelMap[name] = { ids: [], urls: [], tvg, kodinerds: [] };
      channelMap[name].ids.push(streamid);
      channelMap[name].urls.push(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/stream/${streamid}`);
    }
    // Kodinerds-Streams zuordnen / Assign Kodinerds streams
    for (const entry of kodinerds) {
      // Matching nach tvg-name, tvg-id oder Name / Match by tvg-name, tvg-id or name
      let key = entry.tvgName || entry.tvgId || entry.name;
      key = key.replace(/\s*\(\d+\)\s*$/, '');
      if (!channelMap[key]) channelMap[key] = { ids: [], urls: [], tvg: null, kodinerds: [] };
      channelMap[key].kodinerds.push({ url: entry.url, tvgId: entry.tvgId, tvgName: entry.tvgName, tvgLogo: entry.tvgLogo });
    }

    // m3u8-Header
    let m3u = '#EXTM3U\n';

    // Für jeden Sender nur einen Eintrag, mit Fallback-IDs als Pipe / One entry per channel, with fallback IDs as pipe
    for (const [name, info] of Object.entries(channelMap)) {
      const tvgId = info.tvg?.id || (info.kodinerds[0]?.tvgId ?? '');
      const tvgName = info.tvg?.name || (info.kodinerds[0]?.tvgName ?? '');
      // Logo-URL nach Github-Schema oder Kodinerds / Logo url by github schema or kodinerds
      const tvgLogo = tvgId
        ? `https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/germany/${tvgId}.png`
        : (info.kodinerds[0]?.tvgLogo ?? '');
      // IDs für Fallbacks / IDs for fallback
      const allIds = [
        ...info.ids,
        ...info.kodinerds
          .map(e => {
            const m = e.url.match(/\/api\/stream\/(\d+)/);
            return m ? m[1] : null;
          })
          .filter(Boolean)
      ];
      // Kodinerds-Externe URLs (keine Proxy-ID) / Kodinerds external URLs (no proxy id)
      const externalKodinerds = info.kodinerds.filter(e => !e.url.match(/\/api\/stream\/(\d+)/));
      // Hauptzeile mit Fallback-IDs / Main line with fallback IDs
      if (allIds.length > 0) {
        const streamUrl = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/stream/${allIds.join('|')}`;
        m3u += `#EXTINF:-1${tvgId ? ` tvg-id=\"${tvgId}\"` : ''}${tvgName ? ` tvg-name=\"${tvgName}\"` : ''}${tvgLogo ? ` tvg-logo=\"${tvgLogo}\"` : ''},${name}\n${streamUrl}\n`;
      }
      // Externe Kodinerds-Streams als eigene Zeile / External Kodinerds streams as own line
      for (const ext of externalKodinerds) {
        const extName = ext.tvgName || 'Unknown';
        m3u += `#EXTINF:-1${ext.tvgId ? ` tvg-id=\"${ext.tvgId}\"` : ''}${ext.tvgName ? ` tvg-name=\"${ext.tvgName}\"` : ''}${ext.tvgLogo ? ` tvg-logo=\"${ext.tvgLogo}\"` : ''},${extName}\n${ext.url}\n`;
      }
    }

    // m3u8 als Text zurückgeben / Return m3u8 as text
    return new Response(m3u, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-mpegURL; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vlc-playlist.m3u8"',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: {
        de: 'Fehler beim Generieren der VLC-Playlist: ' + (error as Error).message,
        en: 'Error generating VLC playlist: ' + (error as Error).message
      }
    }, { status: 500 });
  }
} 