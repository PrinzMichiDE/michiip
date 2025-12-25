import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Nutze Node.js Runtime für echtes Streaming / Use Node.js runtime for real streaming
export const runtime = 'nodejs';

// In-Memory-Cache für Auth-Token (nur für Server-Laufzeit) / In-memory cache for auth token (server runtime only)
let cachedAuth: { token: string; expires: number } | null = null;

// Hilfsfunktion: Hole neuen vavoo_auth-Token / Helper: fetch new vavoo_auth token
async function fetchVavooAuth(): Promise<string> {
  console.log('[Proxy][Auth] Lade Vec-Liste / Fetching vec list...');
  const vecListRes = await fetch('https://mastaaa1987.github.io/repo/veclist.json');
  if (!vecListRes.ok) {
    console.error('[Proxy][Auth] Fehler beim Laden der Vec-Liste / Error loading vec list', vecListRes.status, vecListRes.statusText);
    throw new Error('Fehler beim Laden der Vec-Liste / Error loading vec list');
  }
  const data = await vecListRes.json();
  const vecList: string[] = Array.isArray(data.value) ? data.value : [];
  if (!Array.isArray(vecList) || vecList.length === 0) {
    console.error('[Proxy][Auth] Vec-Liste leer / Vec list empty');
    throw new Error('Vec-Liste leer / Vec list empty');
  }
  const vec = vecList[Math.floor(Math.random() * vecList.length)];
  console.log('[Proxy][Auth] Verwende Vec / Using vec:', vec);

  console.log('[Proxy][Auth] Fordere signed-Token von VAVOO an / Requesting signed token from VAVOO...');
  const pingRes = await fetch('https://www.vavoo.tv/api/box/ping2', {
    method: 'POST',
    headers: {
      'User-Agent': 'VAVOO/2.6',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ vec }),
  });
  if (!pingRes.ok) {
    console.error('[Proxy][Auth] Fehler beim Auth-Request / Auth request failed', pingRes.status, pingRes.statusText);
    throw new Error('Fehler beim Auth-Request / Auth request failed');
  }
  const pingText = await pingRes.text();
  const match = pingText.match(/signed":"(.*?)"/);
  if (!match) {
    console.error('[Proxy][Auth] Kein signed-Token gefunden / No signed token found', pingText);
    throw new Error('Kein signed-Token gefunden / No signed token found');
  }
  console.log('[Proxy][Auth] signed-Token erhalten / signed token received:', match[1]);
  return match[1];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    console.warn('[Proxy] Kein URL-Parameter / No url parameter');
    return NextResponse.json({
      error: {
        de: 'Parameter "url" fehlt.',
        en: 'Missing "url" parameter.'
      }
    }, { status: 400 });
  }

  const now = Date.now();
  if (!cachedAuth || cachedAuth.expires < now) {
    try {
      console.log('[Proxy][Auth] Kein gültiger Token im Cache, fordere neuen an / No valid token in cache, requesting new one...');
      const signed = await fetchVavooAuth();
      cachedAuth = {
        token: signed,
        expires: now + 15 * 60 * 1000,
      };
      console.log('[Proxy][Auth] Token gecached bis / Token cached until:', new Date(cachedAuth.expires).toISOString());
    } catch (error) {
      console.error('[Proxy][Auth] Fehler beim Authentifizieren / Auth error:', error);
      return NextResponse.json({
        error: {
          de: 'Fehler beim Authentifizieren: ' + (error as Error).message,
          en: 'Auth error: ' + (error as Error).message
        }
      }, { status: 502 });
    }
  }

  let urlWithAuth: string;
  try {
    const urlObj = new URL(targetUrl);
    urlObj.searchParams.set('n', '1');
    urlObj.searchParams.set('b', '5');
    urlObj.searchParams.set('vavoo_auth', cachedAuth.token + '=');
    urlWithAuth = urlObj.toString();
    console.log('[Proxy] Baue Ziel-URL mit Auth / Build target url with auth:', urlWithAuth);
  } catch (e) {
    console.error('[Proxy] Ungültige URL / Invalid url:', targetUrl, e);
    return NextResponse.json({
      error: {
        de: 'Ungültige URL.',
        en: 'Invalid URL.'
      }
    }, { status: 400 });
  }

  try {
    console.log('[Proxy] Starte Proxy-Request / Start proxy request:', urlWithAuth);
    const response = await fetch(urlWithAuth, {
      headers: {
        'user-agent': 'VAVOO/2.6',
      },
    });
    console.log('[Proxy] Antwort vom Ziel erhalten / Received response from target:', response.status, response.statusText);

    const headers = new Headers(response.headers);
    headers.set('x-proxied-by', 'iptv-proxy');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('[Proxy] Fehler beim Weiterleiten / Proxy error:', error);
    return NextResponse.json({
      error: {
        de: 'Proxy-Fehler: ' + (error as Error).message,
        en: 'Proxy error: ' + (error as Error).message
      }
    }, { status: 502 });
  }
} 