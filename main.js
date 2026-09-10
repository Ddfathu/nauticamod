// Deno Deploy VLESS Server - High Reliability Outbound
// Entrypoint: main.js

const DOH_URL = "https://cloudflare-dns.com/dns-query";
const BACKUP_CF_IPS = ["104.16.248.249", "104.16.132.229", "172.67.73.1", "104.21.16.1"];

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

      // Tangani DNS UDP port 53 via DoH
      if (parsed.isUDP && parsed.port === 53) {
        handleDnsQuery(socket, parsed.rawClientData, parsed.responseHeader);
        return;
      }

      // Ambil path proxy jika formatnya /ip:port
      const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").split("?")[0];
      let customProxy = null;

      if (cleanPath.includes(":")) {
        const [ip, port] = cleanPath.split("@")[0].split(":");
        const p = parseInt(port, 10);
        if (ip && !isNaN(p)) {
          customProxy = { ip: ip.trim(), port: p };
        }
      }

      // 1. Coba konek lewat Custom Proxy jika disediakan (timeout keras 1.5 detik)
      if (customProxy) {
        try {
          tcpConn = await connectWithTimeout(customProxy, parsed.address, parsed.port, 1500);
        } catch (_) {
          tcpConn = null;
        }
      }

      // 2. Jika custom proxy gagal / tidak ada, langsung gunakan Fallback IP Cloudflare
      if (!tcpConn) {
        for (const cfIp of BACKUP_CF_IPS) {
          try {
            tcpConn = await connectWithTimeout({ ip: cfIp, port: 443 }, parsed.address, parsed.port, 2000);
            if (tcpConn) break;
          } catch (_) {}
        }
      }

      // 3. Fallback terakhir jika semua gagal
      if (!tcpConn) {
        tcpConn = await Deno.connect({ hostname: parsed.address, port: parsed.port });
      }

      if (parsed.responseHeader) {
        socket.send(parsed.responseHeader);
      }

      isEstablished = true;

      if (parsed.rawClientData?.byteLength > 0) {
        await tcpConn.write(parsed.rawClientData);
      }

      // Pipe data dari outbound balik ke client
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

function connectWithTimeout(proxy, targetHost, targetPort, ms) {
  return Promise.race([
    connectViaProxy(proxy, targetHost, targetPort),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
  ]);
}

async function connectViaProxy(proxy, targetHost, targetPort) {
  const conn = await Deno.connect({ hostname: proxy.ip, port: proxy.port });
  const req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nUser-Agent: Mozilla/5.0\r\nProxy-Connection: Keep-Alive\r\n\r\n`;
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

async function handleDnsQuery(socket, queryData, respHeader) {
  try {
    const res = await fetch(DOH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/dns-message" },
      body: queryData
    });
    if (res.ok && socket.readyState === WebSocket.OPEN) {
      const dnsBuf = new Uint8Array(await res.arrayBuffer());
      if (respHeader) {
        const full = new Uint8Array(respHeader.byteLength + dnsBuf.byteLength);
        full.set(respHeader, 0);
        full.set(dnsBuf, respHeader.byteLength);
        socket.send(full);
      } else {
        socket.send(dnsBuf);
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
<h2>⚡ DENO PROXY ACTIVE</h2>
<input id="u" value="${crypto.randomUUID()}"><br>
<button onclick="document.getElementById('res').innerText='vless://'+document.getElementById('u').value+'@${domain}:443?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=%2F#Deno';document.getElementById('res').style.display='block';">GENERATE LINK</button>
<div id="res" class="box" style="display:none;"></div>
</body></html>`;
}
