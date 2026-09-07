// Deno Deploy Native VLESS WebSocket Proxy
const UUID = "1f37ac4f-fdd0-49df-9406-1eda70a1d512"; // Samakan dengan UUID kamu

Deno.serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Deno VLESS Server Active", { status: 200 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    // WebSocket terbuka
  };

  let tcpConn = null;

  socket.onmessage = async (event) => {
    if (typeof event.data === "string") return;

    const buffer = new Uint8Array(event.data);

    // Jika socket TCP ke web luar sudah terbentuk, teruskan data
    if (tcpConn) {
      try {
        await tcpConn.write(buffer);
      } catch (e) {
        socket.close();
      }
      return;
    }

    // Parsing Header VLESS Sederhana
    try {
      if (buffer.byteLength < 24) return socket.close();
      
      const version = buffer[0];
      const optLength = buffer[17];
      const command = buffer[18 + optLength]; // 1 = TCP

      if (command !== 1) return socket.close();

      const portIndex = 18 + optLength + 1;
      const port = (buffer[portIndex] << 8) | buffer[portIndex + 1];

      let addressIndex = portIndex + 2;
      const addrType = buffer[addressIndex];
      let address = "";

      if (addrType === 1) { // IPv4
        address = `${buffer[addressIndex + 1]}.${buffer[addressIndex + 2]}.${buffer[addressIndex + 3]}.${buffer[addressIndex + 4]}`;
        addressIndex += 5;
      } else if (addrType === 2) { // Domain
        const domainLen = buffer[addressIndex + 1];
        address = new TextDecoder().decode(buffer.slice(addressIndex + 2, addressIndex + 2 + domainLen));
        addressIndex += 2 + domainLen;
      } else {
        return socket.close();
      }

      const clientData = buffer.slice(addressIndex);

      // Buka koneksi TCP keluar via Deno API
      tcpConn = await Deno.connect({ hostname: address, port: port });

      // Kirim balik respon header VLESS (2 byte: Version 0, Addon 0)
      socket.send(new Uint8Array([version, 0]));

      if (clientData.byteLength > 0) {
        await tcpConn.write(clientData);
      }

      // Pipe data dari web target kembali ke DarkTunnel via WebSocket
      (async () => {
        const buf = new Uint8Array(32768);
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
        } catch (err) {
          // Koneksi selesai/putus
        } finally {
          socket.close();
        }
      })();

    } catch (err) {
      socket.close();
    }
  };

  socket.onclose = () => {
    if (tcpConn) {
      try { tcpConn.close(); } catch (e) {}
    }
  };

  socket.onerror = () => {
    if (tcpConn) {
      try { tcpConn.close(); } catch (e) {}
    }
  };

  return response;
});
