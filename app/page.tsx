"use client";
import React, { useEffect, useState } from "react";

// Einfache Basic Auth im Frontend (Prompt) / Simple Basic Auth in frontend (prompt)
function useBasicAuth() {
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    const user = prompt("Benutzername / Username:");
    const pass = prompt("Passwort / Password:");
    // TODO: Passwörter sicherer prüfen oder über ENV / Check password securely or via ENV
    if (user === process.env.NEXT_PUBLIC_BASIC_USER && pass === process.env.NEXT_PUBLIC_BASIC_PASS) {
      setAuthorized(true);
    } else {
      alert("Zugang verweigert / Access denied");
      window.location.reload();
    }
  }, []);
  return authorized;
}

// Hilfsfunktion: m3u8 von API laden und parsen / Helper: fetch and parse m3u8 from API
async function fetchChannels(): Promise<Array<{ name: string; url: string; tvgLogo?: string }>> {
  const res = await fetch("/api/vlc");
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const channels: Array<{ name: string; url: string; tvgLogo?: string }> = [];
  let current: any = {};
  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      const logo = (line.match(/tvg-logo=\"([^\"]*)\"/) || [])[1] || undefined;
      const name = line.split(",").pop()?.trim() || "";
      current = { name, tvgLogo: logo };
    } else if (line && !line.startsWith("#")) {
      channels.push({ ...current, url: line.trim() });
      current = {};
    }
  }
  return channels;
}

export default function HomePage() {
  const authorized = useBasicAuth();
  const [channels, setChannels] = useState<Array<{ name: string; url: string; tvgLogo?: string }>>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (authorized) {
      fetchChannels().then(setChannels);
    }
  }, [authorized]);

  if (!authorized) return null;

  // Filtere Kanäle nach Suchbegriff / Filter channels by search
  const filtered = channels.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ fontFamily: "sans-serif", background: "#181c24", color: "#fff", minHeight: "100vh", padding: 0, margin: 0 }}>
      <h1 style={{ textAlign: "center" }}>IPTV Player</h1>
      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ flex: 1, padding: 16, maxWidth: 350 }}>
          <input
            type="text"
            placeholder="Suche / Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "none", marginBottom: 12 }}
          />
          <div style={{ maxHeight: 600, overflowY: "auto" }}>
            {filtered.map((c, i) => (
              <div
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  display: "flex", alignItems: "center", cursor: "pointer", padding: 8, borderRadius: 4,
                  background: selected === i ? "#2a3140" : "transparent", marginBottom: 4
                }}
              >
                {c.tvgLogo && <img src={c.tvgLogo} alt="logo" style={{ width: 32, height: 32, marginRight: 8, borderRadius: 4 }} />}
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 2, padding: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {selected !== null && filtered[selected] && (
            <>
              <h2>{filtered[selected].name}</h2>
              <video
                key={filtered[selected].url}
                src={filtered[selected].url}
                controls
                autoPlay
                style={{ width: "100%", maxWidth: 700, background: "#000", borderRadius: 8 }}
              />
            </>
          )}
          {selected === null && <p>Bitte wähle einen Sender aus. / Please select a channel.</p>}
        </div>
      </div>
    </div>
  );
}
