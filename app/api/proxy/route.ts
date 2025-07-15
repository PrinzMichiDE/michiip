import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Proxy-API für m3u8/.ts Streams
// Proxy API for m3u8/.ts streams
//
// Query-Parameter: ?url=https://.../stream.m3u8
//
// Diese Route leitet den Stream mit User-Agent 'VAVOO/2.6' weiter.
// This route proxies the stream with User-Agent 'VAVOO/2.6'.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    // Fehlermeldung für fehlende URL / Error message for missing URL
    return NextResponse.json({
      error: {
        de: 'Parameter "url" fehlt.',
        en: 'Missing "url" parameter.'
      }
    }, { status: 400 });
  }

  try {
    // Proxy-Request mit speziellem User-Agent / Proxy request with custom user-agent
    const response = await fetch(targetUrl, {
      headers: {
        'user-agent': 'VAVOO/2.6',
        // Optional: weitere Header übernehmen / Optionally forward more headers
      },
    });

    // Stream Response weiterleiten / Forward stream response
    const headers = new Headers(response.headers);
    headers.set('x-proxied-by', 'iptv-proxy');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    // Fehlerbehandlung / Error handling
    return NextResponse.json({
      error: {
        de: 'Proxy-Fehler: ' + (error as Error).message,
        en: 'Proxy error: ' + (error as Error).message
      }
    }, { status: 502 });
  }
} 