import { NextRequest, NextResponse } from 'next/server';

// Route: /api/stream/[streamid]
// Diese Route ermöglicht den direkten Aufruf eines Streams per ID, z.B. für VLC.
// This route allows direct stream access by ID, e.g. for VLC.

export const runtime = 'nodejs';

// Hilfsfunktion: Testet, ob ein Stream erreichbar ist / Helper: test if a stream is reachable
async function testStream(streamid: string): Promise<string | null> {
  const targetUrl = `https://vavoo.to/live2/play/${encodeURIComponent(streamid)}.ts`;
  const proxyUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  try {
    const res = await fetch(proxyUrl, { method: 'HEAD' });
    if (res.ok) return proxyUrl;
  } catch {}
  return null;
}

// Korrigierte Funktionssignatur für Next.js App Router mit Promise-params / Corrected function signature for Next.js App Router with Promise params
export async function GET(req: NextRequest, context: { params: Promise<{ streamid: string }> }) {
  const { streamid } = await context.params;
  if (!streamid) {
    return NextResponse.json({
      error: {
        de: 'Stream-ID fehlt.',
        en: 'Missing stream ID.'
      }
    }, { status: 400 });
  }

  // Fallback-Logik: Pipe-getrennte IDs nacheinander testen / Fallback logic: try pipe-separated IDs in order
  const ids = streamid.split('|').map(id => id.trim()).filter(Boolean);
  for (const id of ids) {
    // Teste Proxy-Stream / Test proxy stream
    const url = await testStream(id);
    if (url) {
      // Redirect auf funktionierenden Proxy-Stream / Redirect to working proxy stream
      return NextResponse.redirect(url, 307);
    }
  }

  // Kein Stream erreichbar / No stream available
  return NextResponse.json({
    error: {
      de: 'Kein Stream erreichbar.',
      en: 'No stream available.'
    }
  }, { status: 502 });
} 