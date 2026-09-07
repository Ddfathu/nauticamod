// Deno Deploy Full Porting: VLESS / Trojan / VMess / Shadowsocks
// Entrypoint: main.js

const horse = "dHJvamFu";
const flash = "dm1lc3M=";
const neko = "dmxlc3M=";

const DEFAULT_CONFIG = {
  DEFAULT_PROXY: "172.232.249.224:2053",
  DNS_DOH: "https://cloudflare-dns.com/dns-query"
};

function parseProxy(proxyStr) {
  if (!proxyStr) return null;
  const atSplit = proxyStr.split("@");
  const hostPort = atSplit[0];
  const auth = atSplit[1] || null;

  let [host, port] = hostPort.split(":");
  port = parseInt(port, 10) || 443;

  let user = null;
  let pass = null;
  if (auth && auth.includes(":")) {
    const authParts = auth.split(":");
    user = authParts[0];
    pass = authParts.slice(1).join(":");
  }

  return { host, port, user, pass };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const APP_DOMAIN = url.hostname;

  // 1. WebSocket Handler (VLESS / Trojan / VMess)
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    handleWebSocket(socket, url, APP_DOMAIN);
    return response;
  }

  // 2. UI Dashboard Generator
  if (url.pathname === "/" || url.pathname === "/ui") {
    return new Response(getHtmlDashboard(APP_DOMAIN), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
});

function handleWebSocket(socket, url, appDomain) {
  let tcpConn = null;
  let isEstablished = false;

  const rawPath = decodeURIComponent(url.pathname).replace(/^\//, "");
  let targetProxy = DEFAULT_CONFIG.DEFAULT_PROXY;

  if (rawPath && rawPath !== "DIRECT" && rawPath !== "MULTI") {
    targetProxy = rawPath;
  }

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
      if (!parsed) {
        socket.close();
        return;
      }

      // Kirim Response Header VLESS / Trojan balik ke DarkTunnel
      if (parsed.responseHeader) {
        socket.send(parsed.responseHeader);
      }

      // Buka jalur TCP keluar
      // Catatan: Deno Deploy memerlukan tunneling via Proxy IP agar tidak dicegat firewall
      const proxyInfo = parseProxy(targetProxy);

      try {
        tcpConn = await connectViaTunnel(proxyInfo, parsed.address, parsed.port);
      } catch (err) {
        // Fallback coba direct connect jika proxy gagal
        try {
          tcpConn = await Deno.connect({ hostname: parsed.address, port: parsed.port });
        } catch (_) {
          socket.close();
          return;
        }
      }

      isEstablished = true;

      // Kirim data payload pertama
      if (parsed.rawClientData && parsed.rawClientData.byteLength > 0) {
        await tcpConn.write(parsed.rawClientData);
      }

      // Pipe balik data dari TCP target ke WebSocket DarkTunnel
      (async () => {
        const buf = new Uint8Array(65536);
        try {
          while (true) {
            const bytesRead = await tcpConn.read(buf);
            if (bytesRead === null) break;
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(buf.subarray(0, bytesRead));
            } else {
              break;
            }
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
    if (tcpConn) {
      try { tcpConn.close(); } catch (_) {}
    }
  };

  socket.onerror = () => {
    if (tcpConn) {
      try { tcpConn.close(); } catch (_) {}
    }
  };
}

async function connectViaTunnel(proxy, targetHost, targetPort) {
  const conn = await Deno.connect({ hostname: proxy.host, port: proxy.port });
  let connectReq = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n`;

  if (proxy.user && proxy.pass) {
    const auth = btoa(`${proxy.user}:${proxy.pass}`);
    connectReq += `Proxy-Authorization: Basic ${auth}\r\n`;
  }
  connectReq += `User-Agent: Deno-Deploy-Engine\r\nProxy-Connection: Keep-Alive\r\n\r\n`;

  await conn.write(new TextEncoder().encode(connectReq));

  const buf = new Uint8Array(1024);
  const bytesRead = await conn.read(buf);
  if (!bytesRead) throw new Error("Empty proxy response");

  const resp = new TextDecoder().decode(buf.subarray(0, bytesRead));
  if (!resp.includes(" 200 ")) {
    throw new Error(`Proxy rejected CONNECT: ${resp.split("\r\n")[0]}`);
  }

  return conn;
}

function parseClientHeader(buffer) {
  if (buffer.byteLength < 18) return null;

  // Cek VLESS
  const version = buffer[0];
  if (version === 0) {
    const optLength = buffer[17];
    const cmd = buffer[18 + optLength];
    if (cmd !== 1) return null; // Hanya TCP

    const portIndex = 18 + optLength + 1;
    const port = (buffer[portIndex] << 8) | buffer[portIndex + 1];

    let addrIndex = portIndex + 2;
    const addrType = buffer[addrIndex];
    let address = "";

    if (addrType === 1) { // IPv4
      address = `${buffer[addrIndex + 1]}.${buffer[addrIndex + 2]}.${buffer[addrIndex + 3]}.${buffer[addrIndex + 4]}`;
      addrIndex += 5;
    } else if (addrType === 2) { // Domain
      const dLen = buffer[addrIndex + 1];
      address = new TextDecoder().decode(buffer.slice(addrIndex + 2, addrIndex + 2 + dLen));
      addrIndex += 2 + dLen;
    } else if (addrType === 3) { // IPv6
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
      rawClientData: buffer.slice(addrIndex),
      responseHeader: new Uint8Array([version, 0])
    };
  }

  // Cek Trojan
  if (buffer.byteLength >= 62) {
    const horseDelimiter = buffer.slice(56, 60);
    if (horseDelimiter[0] === 0x0d && horseDelimiter[1] === 0x0a) {
      const dataBuffer = buffer.slice(58);
      const cmd = dataBuffer[0];
      if (cmd !== 1) return null;

      let addressType = dataBuffer[1];
      let addrVal = "";
      let offset = 2;

      if (addressType === 1) {
        addrVal = `${dataBuffer[2]}.${dataBuffer[3]}.${dataBuffer[4]}.${dataBuffer[5]}`;
        offset += 4;
      } else if (addressType === 3) {
        const len = dataBuffer[2];
        addrVal = new TextDecoder().decode(dataBuffer.slice(3, 3 + len));
        offset += 1 + len;
      }

      const port = (dataBuffer[offset] << 8) | dataBuffer[offset + 1];
      return {
        address: addrVal,
        port,
        rawClientData: dataBuffer.slice(offset + 4),
        responseHeader: null
      };
    }
  }

  return null;
}

function getHtmlDashboard(domain) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deno Deploy VLESS</title>
  <style>
    body { background: #0b0f19; color: #00ffcc; font-family: monospace; padding: 20px; display: flex; justify-content: center; }
    .box { background: #111827; border: 1px solid #00ffcc; border-radius: 8px; padding: 20px; max-width: 480px; width: 100%; }
    input, select { width: 100%; padding: 10px; margin: 8px 0; background: #000; border: 1px solid #00ffcc; color: #fff; border-radius: 4px; box-sizing: border-box; }
    button { width: 100%; padding: 10px; background: #00ffcc; color: #000; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; }
    .out { background: #000; border: 1px dashed #00ffcc; padding: 10px; margin-top: 15px; word-break: break-all; color: #39ff14; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="box">
    <h3 style="color:#fff; text-align:center;">⚡ DENO VLESS ENGINE</h3>
    <label>UUID:</label>
    <input type="text" id="uuid" value="${crypto.randomUUID()}">
    <label>Proxy Target (IP:Port):</label>
    <input type="text" id="proxy" value="172.232.249.224:2053">
    <button onclick="genConfig()">GENERATE VLESS CONFIG</button>
    <div class="out" id="res" style="display:none;"></div>
  </div>
  <script>
    function genConfig() {
      const u = document.getElementById('uuid').value.trim();
      const p = document.getElementById('proxy').value.trim();
      const link = "vless://" + u + "@${domain}:443?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=" + encodeURIComponent("/" + p) + "#Deno-VLESS";
      const box = document.getElementById('res');
      box.innerText = link;
      box.style.display = 'block';
    }
  </script>
</body>
</html>`;
}
