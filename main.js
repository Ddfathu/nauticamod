// Deno Deploy VLESS Server with Working DNS Handler
// Entrypoint: main.js

const PRX_BANK_URL = "https://raw.githubusercontent.com/Ddfathu/nauticamod/refs/heads/main/proxy.txt";
const DOH_URL = "https://cloudflare-dns.com/dns-query";

let cachedProxyList = [];
let lastFetchTime = 0;

async function getFreshProxies() {
  const now = Date.now();
  if (cachedProxyList.length > 0 && now - lastFetchTime < 10 * 60 * 1000) {
    return cachedProxyList;
  }
  try {
    const res = await fetch(PRX_BANK_URL);
    if (res.ok) {
      const text = await res.text();
      const lines = text.split("\n").filter(Boolean);
      const list = lines.map(line => {
        const [ip, port, cc] = line.split(",");
        return { ip: ip?.trim(), port: parseInt(port?.trim(), 10) || 443, cc: cc?.trim()?.toUpperCase() };
      }).filter(p => p.ip && p.port);
      if (list.length > 0) {
        cachedProxyList = list;
        lastFetchTime = now;
        return cachedProxyList;
      }
    }
  } catch (_) {}
  return [{ ip: "104.16.248.249", port: 443, cc: "CF" }];
}

function getRandomProxy(list, country = "") {
  if (!list || list.length === 0) return { ip: "104.16.248.249", port: 443 };
  if (country) {
    const filtered = list.filter(p => p.cc === country.toUpperCase());
    if (filtered.length > 0) return filtered[Math.floor(Math.random() * filtered.length)];
  }
  return list[Math.floor(Math.random() * list.length)];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    handleWebSocketSession(socket, url);
    return response;
  }

  if (url.pathname === "/" || url.pathname === "/ui") {
    return new Response(renderUI(url.hostname), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  return new Response("Not Found", { status: 404 });
});

function handleWebSocketSession(socket, url) {
  let tcpConn = null;
  let isEstablished = false;

  socket.onmessage = async (event) => {
    if (typeof event.data === "string") return;
    const chunk = new Uint8Array(event.data);

    if (tcpConn && isEstablished) {
      try {
        await tcpConn.write(chunk);
      } catch (_) {
        socket.close();
      }
      return;
    }

    try {
      const parsed = parseClientHeader(chunk);
      if (!parsed) return socket.close();

      // Tangani query DNS UDP port 53
      if (parsed.isUDP && parsed.port === 53) {
        handleDnsQuery(socket, parsed.rawClientData, parsed.responseHeader);
        return;
      }

      const proxyList = await getFreshProxies();
      const rawPath = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").split("?")[0];
      let targetProxy = null;

      if (rawPath.includes(":")) {
        const parts = rawPath.split("@")[0].split(":");
        const ip = parts[0]?.trim();
        const port = parseInt(parts[1]?.trim(), 10);
        if (ip && !isNaN(port)) {
          targetProxy = { ip, port };
        }
      } else if (rawPath.length === 2) {
        targetProxy = getRandomProxy(proxyList, rawPath);
      }

      if (!targetProxy) {
        targetProxy = getRandomProxy(proxyList, "SG");
      }

      // Hubungkan outbound via CONNECT proxy, fallback ke proxy SG
      try {
        tcpConn = await connectViaProxy(targetProxy, parsed.address, parsed.port);
      } catch (_) {
        const fallback = getRandomProxy(proxyList, "SG");
        tcpConn = await connectViaProxy(fallback, parsed.address, parsed.port);
      }

      if (parsed.responseHeader) {
        socket.send(parsed.responseHeader);
      }

      isEstablished = true;

      if (parsed.rawClientData?.byteLength > 0) {
        await tcpConn.write(parsed.rawClientData);
      }

      (async () => {
        const buf = new Uint8Array(65536);
        try {
          while (true) {
            const bytesRead = await tcpConn.read(buf);
            if (bytesRead === null) break;
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(buf.subarray(0, bytesRead));
            } else break;
          }
        } catch (_) {
        } finally {
          socket.close();
        }
      })();

    } catch (_) {
      socket.close();
    }
  };

  socket.onclose = () => {
    if (tcpConn) try { tcpConn.close(); } catch (_) {}
  };
  socket.onerror = () => {
    if (tcpConn) try { tcpConn.close(); } catch (_) {}
  };
}

async function connectViaProxy(proxy, targetHost, targetPort) {
  const conn = await Deno.connect({ hostname: proxy.ip, port: proxy.port });
  const req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nUser-Agent: DenoTunnel\r\nProxy-Connection: Keep-Alive\r\n\r\n`;
  await conn.write(new TextEncoder().encode(req));

  const buf = new Uint8Array(1024);
  const n = await conn.read(buf);
  if (!n) {
    try { conn.close(); } catch (_) {}
    throw new Error("Empty reply");
  }

  const res = new TextDecoder().decode(buf.subarray(0, n));
  if (!res.includes(" 200 ")) {
    try { conn.close(); } catch (_) {}
    throw new Error("Proxy reject");
  }

  return conn;
}

// Handler DNS UDP yang kompatibel dengan protokol VLESS
async function handleDnsQuery(socket, queryData, respHeader) {
  try {
    if (queryData.byteLength < 2) return;

    // Paket DNS UDP VLESS diawali dengan 2-byte length prefix
    const dnsLen = (queryData[0] << 8) | queryData[1];
    let rawDns;
    
    // Validasi apakah 2 byte pertama memang panjang paket
    if (dnsLen + 2 === queryData.byteLength) {
      rawDns = queryData.slice(2);
    } else {
      rawDns = queryData;
    }

    const res = await fetch(DOH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/dns-message" },
      body: rawDns
    });

    if (res.ok && socket.readyState === WebSocket.OPEN) {
      const dnsBuf = new Uint8Array(await res.arrayBuffer());
      const resLen = dnsBuf.byteLength;

      // Buat frame respons UDP: [2 byte length] + [DNS binary payload]
      const udpPayload = new Uint8Array(2 + resLen);
      udpPayload[0] = (resLen >> 8) & 0xff;
      udpPayload[1] = resLen & 0xff;
      udpPayload.set(dnsBuf, 2);

      if (respHeader) {
        const full = new Uint8Array(respHeader.byteLength + udpPayload.byteLength);
        full.set(respHeader, 0);
        full.set(udpPayload, respHeader.byteLength);
        socket.send(full);
      } else {
        socket.send(udpPayload);
      }
    }
  } catch (_) {}
}

function parseClientHeader(buffer) {
  if (buffer.byteLength < 18) return null;
  const version = buffer[0];
  if (version !== 0) return null;

  const optLength = buffer[17];
  const cmd = buffer[18 + optLength];
  const isUDP = cmd === 2;

  const portIndex = 18 + optLength + 1;
  const port = (buffer[portIndex] << 8) | buffer[portIndex + 1];

  let addrIndex = portIndex + 2;
  const addrType = buffer[addrIndex];
  let address = "";

  if (addrType === 1) {
    address = `${buffer[addrIndex + 1]}.${buffer[addrIndex + 2]}.${buffer[addrIndex + 3]}.${buffer[addrIndex + 4]}`;
    addrIndex += 5;
  } else if (addrType === 2) {
    const dLen = buffer[addrIndex + 1];
    address = new TextDecoder().decode(buffer.slice(addrIndex + 2, addrIndex + 2 + dLen));
    addrIndex += 2 + dLen;
  } else if (addrType === 3) {
    const parts = [];
    const view = new DataView(buffer.buffer, buffer.byteOffset + addrIndex + 1, 16);
    for (let i = 0; i < 8; i++) parts.push(view.getUint16(i * 2).toString(16));
    address = parts.join(":");
    addrIndex += 17;
  } else {
    return null;
  }

  return {
    address,
    port,
    isUDP,
    rawClientData: buffer.slice(addrIndex),
    responseHeader: new Uint8Array([version, 0])
  };
}

function renderUI(domain) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Deno VLESS</title>
<style>body{background:#0b0f19;color:#00ffcc;font-family:monospace;padding:20px;text-align:center;}
input{width:90%;max-width:400px;padding:10px;margin:8px;background:#000;border:1px solid #00ffcc;color:#fff;}
button{padding:10px 20px;background:#00ffcc;color:#000;font-weight:bold;border:none;cursor:pointer;}
.box{margin-top:15px;word-break:break-all;color:#39ff14;font-size:0.8rem;border:1px dashed #00ffcc;padding:10px;}
</style></head><body>
<h2>⚡ DENO PROXY BANK ACTIVE</h2>
<input id="u" value="${crypto.randomUUID()}"><br>
<button onclick="document.getElementById('res').innerText='vless://'+document.getElementById('u').value+'@${domain}:443?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=%2F#Deno';document.getElementById('res').style.display='block';">GENERATE LINK</button>
<div id="res" class="box" style="display:none;"></div>
</body></html>`;
}
