import { connect } from "cloudflare:sockets";

// Variables
let serviceName = "";
let APP_DOMAIN = "";

let prxIP = "";
let cachedPrxList = [];

// Constant & Default Values
const horse = "dHJvamFu";
const flash = "dm1lc3M=";
const neko = "dmxlc3M=";
const v2 = "djJyYXk=";

const PORTS = [443, 80];
const PROTOCOLS = [atob(horse), atob(flash), atob(neko), "ss"];
const SUB_PAGE_URL = "https://foolvpn.web.id/nautica";

// Default Configs
const DEFAULT_CONFIG = {
  DNS_TYPE: "UDP",
  DOH_URL: "https://cloudflare-dns.com/dns-query",
  DNS_SERVER_ADDRESS: "8.8.8.8",
  DNS_SERVER_PORT: "53",
  UDP_MODE: "RELAY",
  UDP_RELAY_HOST: "udp-relay.hobihaus.space",
  UDP_RELAY_PORT: "7300",
  KV_PRX_URL: "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/kvProxyList.json",
  PRX_BANK_URL: "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/proxyList.txt",
  REVERSE_PRX_TARGET: "",
  DNS_HISTORY: [
    { type: "UDP", label: "Google DNS (8.8.8.8:53)", addr: "8.8.8.8", port: "53", isDefault: true },
    { type: "UDP", label: "Cloudflare DNS (1.1.1.1:53)", addr: "1.1.1.1", port: "53", isDefault: true },
    { type: "DOH", label: "Cloudflare DoH", dohUrl: "https://cloudflare-dns.com/dns-query", isDefault: true },
    { type: "DOH", label: "NextDNS DoH", dohUrl: "https://dns.nextdns.io/dns-query", isDefault: true }
  ],
  RELAY_HISTORY: [
    { label: "Hobihaus Relay (udp-relay.hobihaus.space:7300)", host: "udp-relay.hobihaus.space", port: "7300", isDefault: true },
    { label: "Railway Proxy (altaria.proxy.rlwy.net:57280)", host: "altaria.proxy.rlwy.net", port: "57280", isDefault: true }
  ],
  CUSTOM_PRX_LIST: []
};

const PRX_HEALTH_CHECK_API = "https://id1.foolvpn.web.id/api/v1/check";
const CONVERTER_URL = "https://api.foolvpn.web.id/convert";
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const CORS_HEADER_OPTIONS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Encrypted Stream Constants
const SALT_A1 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgS2V5X0xlbmd0aA==");
const SALT_A2 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2VfTGVuZ3Ro");
const SALT_A3 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgS2V5");
const SALT_A4 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2U=");
const SALT_B1 = atob("QUVBRCBSZXNwIEhlYWRlciBMZW4gSVY=");
const SALT_B2 = atob("QUVBRCBSZXNwIEhlYWRlciBMZW4gSVY=");
const SALT_B3 = atob("QUVBRCBSZXNwIEhlYWRlciBLZXk=");
const SALT_B4 = atob("QUVBRCBSZXNwIEhlYWRlciBJVg==");

async function getConfig(env) {
  let kvConfig = {};
  if (env.CONFIG_KV) {
    try {
      const stored = await env.CONFIG_KV.get("APP_CONFIG", { type: "json" });
      if (stored) kvConfig = stored;
    } catch (e) {
      console.error("Gagal membaca KV:", e);
    }
  }

  return {
    DNS_TYPE: kvConfig.DNS_TYPE || env.DNS_TYPE || DEFAULT_CONFIG.DNS_TYPE,
    DOH_URL: kvConfig.DOH_URL || env.DOH_URL || DEFAULT_CONFIG.DOH_URL,
    DNS_SERVER_ADDRESS: kvConfig.DNS_SERVER_ADDRESS || env.DNS_SERVER_ADDRESS || DEFAULT_CONFIG.DNS_SERVER_ADDRESS,
    DNS_SERVER_PORT: parseInt(kvConfig.DNS_SERVER_PORT || env.DNS_SERVER_PORT || DEFAULT_CONFIG.DNS_SERVER_PORT),
    UDP_MODE: kvConfig.UDP_MODE || env.UDP_MODE || DEFAULT_CONFIG.UDP_MODE,
    UDP_RELAY_HOST: kvConfig.UDP_RELAY_HOST || env.UDP_RELAY_HOST || DEFAULT_CONFIG.UDP_RELAY_HOST,
    UDP_RELAY_PORT: parseInt(kvConfig.UDP_RELAY_PORT || env.UDP_RELAY_PORT || DEFAULT_CONFIG.UDP_RELAY_PORT),
    KV_PRX_URL: kvConfig.KV_PRX_URL || env.KV_PRX_URL || DEFAULT_CONFIG.KV_PRX_URL,
    PRX_BANK_URL: kvConfig.PRX_BANK_URL || env.PRX_BANK_URL || DEFAULT_CONFIG.PRX_BANK_URL,
    REVERSE_PRX_TARGET: kvConfig.REVERSE_PRX_TARGET || DEFAULT_CONFIG.REVERSE_PRX_TARGET,
    DNS_HISTORY: kvConfig.DNS_HISTORY || DEFAULT_CONFIG.DNS_HISTORY,
    RELAY_HISTORY: kvConfig.RELAY_HISTORY || DEFAULT_CONFIG.RELAY_HISTORY,
    CUSTOM_PRX_LIST: kvConfig.CUSTOM_PRX_LIST || DEFAULT_CONFIG.CUSTOM_PRX_LIST
  };
}

async function getKVPrxList(kvPrxUrl) {
  if (!kvPrxUrl) throw new Error("No URL Provided!");
  const kvPrx = await fetch(kvPrxUrl);
  return kvPrx.status == 200 ? await kvPrx.json() : {};
}

async function getPrxList(prxBankUrl, customPrxList = []) {
  let combined = [];

  if (prxBankUrl) {
    try {
      const prxBank = await fetch(prxBankUrl);
      if (prxBank.status == 200) {
        const text = (await prxBank.text()) || "";
        const prxString = text.split("\n").filter(Boolean);
        cachedPrxList = prxString
          .map((entry) => {
            const [prxIP, prxPort, country, org] = entry.split(",");
            return {
              prxIP: prxIP || "Unknown",
              prxPort: prxPort || "Unknown",
              country: country || "Unknown",
              org: org || "Unknown Org",
            };
          })
          .filter(Boolean);
        combined = [...cachedPrxList];
      }
    } catch (e) {
      console.error("Gagal mengambil Proxy Bank TXT:", e);
    }
  }

  if (customPrxList && customPrxList.length > 0) {
    combined = [...customPrxList, ...combined];
  }

  return combined;
}

// Reverse Proxy Handler
async function reverseWeb(request, target, targetPath) {
  if (!target || target.trim() === "") target = "example.com";
  const targetUrl = new URL(request.url);
  const targetChunk = target.split(":");

  targetUrl.hostname = targetChunk[0];
  targetUrl.port = targetChunk[1]?.toString() || "443";
  targetUrl.pathname = targetPath || targetUrl.pathname;

  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.set("Host", targetUrl.hostname);
  modifiedHeaders.set("X-Forwarded-Host", request.headers.get("Host"));

  const modifiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: modifiedHeaders,
    body: request.body,
    redirect: "follow"
  });

  const response = await fetch(modifiedRequest);

  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(CORS_HEADER_OPTIONS)) {
    newResponse.headers.set(key, value);
  }
  newResponse.headers.set("X-Proxied-By", "Cloudflare Worker");

  return newResponse;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      APP_DOMAIN = url.hostname;
      serviceName = APP_DOMAIN.split(".")[0];

      const currentConfig = await getConfig(env);

      if (url.pathname === "/api/get-proxy-list") {
        const list = await getPrxList(currentConfig.PRX_BANK_URL, currentConfig.CUSTOM_PRX_LIST);
        return new Response(JSON.stringify(list), {
          headers: { ...CORS_HEADER_OPTIONS, "Content-Type": "application/json" }
        });
      }

      // Template HTML Dashboard
      const htmlContent = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nautica Worker Dashboard</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0d1117; color: #f8fafc; padding: 16px; margin: 0; display: flex; justify-content: center; }
          .card { background-color: #161b22; padding: 20px; border-radius: 12px; width: 100%; max-width: 500px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); border: 1px solid #30363d; }
          h2 { margin-top: 0; color: #38bdf8; font-size: 1.2rem; text-align: center; }
          h3 { color: #38bdf8; font-size: 1rem; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #30363d; padding-bottom: 4px; }
          label { font-size: 0.8rem; font-weight: 600; color: #8b949e; display: block; margin-top: 10px; margin-bottom: 4px; }
          input, select { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #fff; box-sizing: border-box; font-size: 0.85rem; }
          input:focus, select:focus { outline: none; border-color: #38bdf8; }
          
          .btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
          .btn-mode { padding: 10px; border: 1px solid #30363d; border-radius: 6px; background: #21262d; color: #58a6ff; font-weight: bold; cursor: pointer; font-size: 0.8rem; transition: 0.2s; text-align: center; }
          .btn-mode:hover { background: #30363d; color: #79c0ff; }
          .btn-mode.rev { color: #e3b341; }
          .btn-mode.cdn { color: #bc8cff; }

          .btn-gen { background-color: #238636; color: white; width: 100%; padding: 10px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 10px; }
          .btn-gen:hover { background-color: #2ea043; }
          .btn-copy { background-color: #30363d; padding: 6px 12px; border: none; border-radius: 4px; color: #58a6ff; font-size: 0.75rem; cursor: pointer; float: right; }
          .btn-del { background-color: #da3633; color: white; padding: 6px 12px; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer; margin-top: 6px; display: inline-block; }
          
          .status { margin-top: 14px; font-size: 0.85rem; text-align: center; }
          .success { color: #3fb950; }
          .error { color: #f85149; }
          .out-box { background: #0d1117; border: 1px solid #30363d; padding: 10px; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 0.78rem; margin-top: 8px; color: #c9d1d9; }
          .tab-btn { display: inline-block; padding: 8px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px 6px 0 0; cursor: pointer; font-size: 0.8rem; font-weight: 600; margin-right: 2px; }
          .tab-btn.active { background: #161b22; border-bottom: 1px solid #161b22; color: #38bdf8; }
          .custom-box { background: #0d1117; border: 1px dashed #38bdf8; padding: 10px; border-radius: 6px; margin-top: 8px; }
          .prx-item { background: #0d1117; border: 1px solid #30363d; padding: 8px 12px; border-radius: 6px; margin-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; }

          .status-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background-color: rgba(46, 160, 67, 0.15);
            border: 1px solid rgba(46, 160, 67, 0.4);
            color: #3fb950;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            margin-bottom: 14px;
          }
          .pulse-dot {
            width: 8px;
            height: 8px;
            background-color: #2ea043;
            border-radius: 50%;
            box-shadow: 0 0 0 0 rgba(46, 160, 67, 0.7);
            animation: pulse 1.6s infinite;
          }
          @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 160, 67, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(46, 160, 67, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 160, 67, 0); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="status-badge">
            <span class="pulse-dot"></span>
            Server ini online, silakan buat konfig
          </div>

          <h2>⚡ DDFATHUVLES CONFIG GENERATOR</h2>
          <div style="margin-bottom: 14px; text-align: center;">
            <div class="tab-btn active" onclick="switchTab('gen')">⚡ Generator</div>
            <div class="tab-btn" onclick="switchTab('add-prx')">➕ Add Proxy</div>
            <div class="tab-btn" onclick="switchTab('settings')">⚙️ Settings (KV)</div>
          </div>

          <!-- TAB 1: GENERATOR CONFIG -->
          <div id="tab-gen">
            <label>UUID / PASS:</label>
            <input type="text" id="gen_uuid" value="${crypto.randomUUID()}">

            <label>BUG HOST (SNI / CDN):</label>
            <input type="text" id="gen_bug" value="api.quipper.com" placeholder="contoh: api.quipper.com">

            <!-- HANYA PAKAI DROPDOWN PORT TARGET (OTOMATIS TENTUKAN TLS/NTLS) -->
            <label>PORT TARGET:</label>
            <select id="gen_port">
              <option value="443" selected>443 (TLS / HTTPS)</option>
              <option value="80">80 (NTLS / HTTP)</option>
              <option value="8080">8080 (NTLS Alternate)</option>
              <option value="8443">8443 (TLS Alternate)</option>
            </select>

            <label style="margin-top: 8px;">🔍 CARI / FILTER PROXY:</label>
            <input type="text" id="gen_search" placeholder="Ketik ALL atau ID / SG / US..." onkeyup="filterProxyList()">

            <label style="margin-top: 8px;">PILIH TARGET PROXY IP:</label>
            <select id="gen_proxy_select" onchange="toggleCustomProxyInput()">
              <option value="CUSTOM">✏️ Custom / Manual Proxy Input</option>
            </select>

            <div id="custom_proxy_field">
              <label>Custom Proxy IP & Port:</label>
              <input type="text" id="gen_ip_custom" value="172.232.249.224:2053" placeholder="contoh: 172.232.249.224:2053">
            </div>

            <!-- BUTTON GROUPS -->
            <h3>▌ BUG SNI (NORMAL / STANDAR)</h3>
            <div class="btn-grid">
              <button type="button" class="btn-mode" onclick="makeSingleConfig('VLESS_STD')">VLESS STD</button>
              <button type="button" class="btn-mode" onclick="makeSingleConfig('TROJAN_STD')">TROJAN STD</button>
            </div>

            <h3>▌ BUG SNI (REVERSE)</h3>
            <div class="btn-grid">
              <button type="button" class="btn-mode rev" onclick="makeSingleConfig('VLESS_REV')">VLESS REV</button>
              <button type="button" class="btn-mode rev" onclick="makeSingleConfig('TROJAN_REV')">TROJAN REV</button>
            </div>

            <h3>▌ BUG CDN (PROXY PROT)</h3>
            <div class="btn-grid">
              <button type="button" class="btn-mode cdn" onclick="makeSingleConfig('VLESS_CDN')">VLESS CDN</button>
              <button type="button" class="btn-mode cdn" onclick="makeSingleConfig('TROJAN_CDN')">TROJAN CDN</button>
            </div>

            <div id="gen_results" style="display:none; margin-top: 16px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong id="result_title" style="font-size:0.85rem; color:#38bdf8;">RESULT CONFIG:</strong>
                <button type="button" class="btn-copy" onclick="copyText('out_result')">[COPY]</button>
              </div>
              <div class="out-box" id="out_result"></div>
            </div>
          </div>

          <!-- TAB 2: TAMBAH PROXY BARU -->
          <div id="tab-add-prx" style="display: none;">
            <h3>➕ Daftarkan Custom Proxy Baru</h3>
            <form id="addProxyForm">
              <label>IP Proxy (Tanpa Port!):</label>
              <input type="text" id="new_prx_ip" placeholder="contoh: 172.232.249.224" required>

              <label>Port Proxy:</label>
              <input type="number" id="new_prx_port" placeholder="contoh: 2053" value="2053" required>

              <label>Kode Negara (CC):</label>
              <input type="text" id="new_prx_cc" placeholder="contoh: ID / SG / US" value="ID" required>

              <label>Nama ISP / Org / Label:</label>
              <input type="text" id="new_prx_org" placeholder="contoh: Custom-VPS-Saya" value="My-Server">

              <button type="submit" class="btn-gen">💾 Simpan Proxy Baru Ke KV</button>
            </form>

            <h3 style="margin-top: 20px;">📋 Daftar Custom Proxy Tersimpan</h3>
            <div id="custom_prx_container"></div>
          </div>

          <!-- TAB 3: SETTINGS KV -->
          <div id="tab-settings" style="display: none;">
            <form id="configForm">
              <h3>🌐 DNS Settings</h3>
              <label>Pilih Preset / Riwayat DNS dari KV:</label>
              <select id="dns_select" onchange="handleDnsSelectChange()">
                <option value="DEFAULT_SCRIPT">⚙️ Default Script (Reset ke 8.8.8.8)</option>
              </select>
              <button type="button" id="btn_delete_dns" class="btn-del" style="display:none;" onclick="deleteSelectedDns()">🗑️ Hapus Preset DNS Ini</button>

              <div id="dns_custom_fields" class="custom-box" style="display: none;">
                <label>Protokol DNS:</label>
                <select id="DNS_TYPE" onchange="toggleDohInput()">
                  <option value="UDP">UDP Standard</option>
                  <option value="DOH">DNS over HTTPS (DoH)</option>
                </select>

                <div id="doh_field" style="display: none;">
                  <label>DoH Resolver URL Custom:</label>
                  <input type="url" id="DOH_URL" value="${currentConfig.DOH_URL}">
                </div>

                <div id="udp_fields">
                  <label>DNS Server Address (UDP) Custom:</label>
                  <input type="text" id="DNS_SERVER_ADDRESS" value="${currentConfig.DNS_SERVER_ADDRESS}">

                  <label>DNS Server Port (UDP) Custom:</label>
                  <input type="number" id="DNS_SERVER_PORT" value="${currentConfig.DNS_SERVER_PORT}">
                </div>
              </div>

              <h3>📡 UDP Handling & Relay</h3>
              <label>Mode UDP Routing:</label>
              <select id="UDP_MODE" onchange="toggleRelayDisplay()">
                <option value="RELAY" ${currentConfig.UDP_MODE === 'RELAY' ? 'selected' : ''}>UDP Relay Server</option>
                <option value="NATIVE" ${currentConfig.UDP_MODE === 'NATIVE' ? 'selected' : ''}>Native Outbound Direct</option>
              </select>

              <div id="relay_wrapper">
                <label>Pilih Preset / Riwayat UDP Relay dari KV:</label>
                <select id="relay_select" onchange="handleRelaySelectChange()">
                  <option value="DEFAULT_SCRIPT">⚙️ Default Script (Reset ke udp-relay.hobihaus.space)</option>
                </select>
                <button type="button" id="btn_delete_relay" class="btn-del" style="display:none;" onclick="deleteSelectedRelay()">🗑️ Hapus Preset Relay Ini</button>

                <div id="relay_custom_fields" class="custom-box" style="display: none;">
                  <label>UDP Relay Host Custom:</label>
                  <input type="text" id="UDP_RELAY_HOST" value="${currentConfig.UDP_RELAY_HOST}">

                  <label>UDP Relay Port Custom:</label>
                  <input type="number" id="UDP_RELAY_PORT" value="${currentConfig.UDP_RELAY_PORT}">
                </div>
              </div>

              <h3>🔗 General Configurations</h3>
              <label>Reverse Proxy Target Domain (Boleh Kosong):</label>
              <input type="text" id="REVERSE_PRX_TARGET" value="${currentConfig.REVERSE_PRX_TARGET}" placeholder="contoh: google.com">

              <label>Proxy Bank TXT URL:</label>
              <input type="url" id="PRX_BANK_URL" value="${currentConfig.PRX_BANK_URL}" required>

              <label>KV Proxy List JSON URL:</label>
              <input type="url" id="KV_PRX_URL" value="${currentConfig.KV_PRX_URL}" required>

              <button type="submit" class="btn-gen">Simpan Konfigurasi Ke KV</button>
            </form>
          </div>

          <div id="status" class="status"></div>
        </div>

        <script>
          const currentWorkerHost = "${APP_DOMAIN}";
          let rawProxyList = [];
          let currentConfig = ${JSON.stringify(currentConfig)};

          const DEFAULT_SCRIPT_DNS = { type: "UDP", addr: "8.8.8.8", port: "53" };
          const DEFAULT_SCRIPT_RELAY = { host: "udp-relay.hobihaus.space", port: "7300" };

          window.addEventListener('DOMContentLoaded', async () => {
            loadProxyList();
            renderDnsOptions();
            renderRelayOptions();
            renderCustomProxyList();
            toggleRelayDisplay();
          });

          function renderCustomProxyList() {
            const container = document.getElementById('custom_prx_container');
            container.innerHTML = '';

            if (!currentConfig.CUSTOM_PRX_LIST || currentConfig.CUSTOM_PRX_LIST.length === 0) {
              container.innerHTML = '<div style="font-size:0.8rem; color:#8b949e; margin-top:8px;">Belum ada proxy kustom tersimpan.</div>';
              return;
            }

            currentConfig.CUSTOM_PRX_LIST.forEach((p, idx) => {
              const item = document.createElement('div');
              item.className = 'prx-item';
              item.innerHTML = '<div><strong>[' + p.country + '] ' + p.prxIP + ':' + p.prxPort + '</strong> <br><span style="font-size:0.75rem; color:#8b949e;">' + p.org + '</span></div>' +
                '<button type="button" class="btn-del" onclick="deleteCustomProxy(' + idx + ')">🗑️ Hapus</button>';
              container.appendChild(item);
            });
          }

          document.getElementById('addProxyForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            let ip = document.getElementById('new_prx_ip').value.trim();
            const port = document.getElementById('new_prx_port').value.trim();
            const cc = document.getElementById('new_prx_cc').value.trim().toUpperCase();
            const org = document.getElementById('new_prx_org').value.trim() || 'Custom-Proxy';

            if (ip.includes(':')) {
              ip = ip.split(':')[0];
            }

            if (!ip || !port) return;

            const newEntry = { prxIP: ip, prxPort: port, country: cc, org: org };

            currentConfig.CUSTOM_PRX_LIST = currentConfig.CUSTOM_PRX_LIST.filter(p => !(p.prxIP === ip && p.prxPort === port));
            currentConfig.CUSTOM_PRX_LIST.unshift(newEntry);

            await saveDirectPayloadToKV({ CUSTOM_PRX_LIST: currentConfig.CUSTOM_PRX_LIST });
          });

          async function deleteCustomProxy(idx) {
            if (confirm('Hapus proxy kustom ini dari KV?')) {
              currentConfig.CUSTOM_PRX_LIST.splice(idx, 1);
              await saveDirectPayloadToKV({ CUSTOM_PRX_LIST: currentConfig.CUSTOM_PRX_LIST });
            }
          }

          function renderDnsOptions() {
            const select = document.getElementById('dns_select');
            select.innerHTML = '<option value="DEFAULT_SCRIPT">⚙️ Default Script (Reset ke 8.8.8.8)</option>';

            currentConfig.DNS_HISTORY.forEach((item, index) => {
              const opt = document.createElement('option');
              opt.value = index;
              opt.innerText = (item.type === 'DOH' ? '[DoH] ' : '[UDP] ') + item.label;

              if (item.type === currentConfig.DNS_TYPE) {
                if (item.type === 'DOH' && item.dohUrl === currentConfig.DOH_URL) {
                  opt.selected = true;
                } else if (item.type === 'UDP' && item.addr === currentConfig.DNS_SERVER_ADDRESS && item.port == currentConfig.DNS_SERVER_PORT) {
                  opt.selected = true;
                }
              }
              select.appendChild(opt);
            });

            const customOpt = document.createElement('option');
            customOpt.value = 'CUSTOM';
            customOpt.innerText = '✏️ Custom Input DNS Baru...';
            select.appendChild(customOpt);

            handleDnsSelectChange();
          }

          function handleDnsSelectChange() {
            const val = document.getElementById('dns_select').value;
            const customBox = document.getElementById('dns_custom_fields');
            const delBtn = document.getElementById('btn_delete_dns');

            if (val === 'DEFAULT_SCRIPT') {
              customBox.style.display = 'none';
              delBtn.style.display = 'none';
              document.getElementById('DNS_TYPE').value = DEFAULT_SCRIPT_DNS.type;
              document.getElementById('DNS_SERVER_ADDRESS').value = DEFAULT_SCRIPT_DNS.addr;
              document.getElementById('DNS_SERVER_PORT').value = DEFAULT_SCRIPT_DNS.port;
              toggleDohInput();
            } else if (val === 'CUSTOM') {
              customBox.style.display = 'block';
              delBtn.style.display = 'none';
            } else {
              customBox.style.display = 'none';
              const idx = parseInt(val);
              const selectedItem = currentConfig.DNS_HISTORY[idx];
              document.getElementById('DNS_TYPE').value = selectedItem.type;
              if (selectedItem.type === 'DOH') {
                document.getElementById('DOH_URL').value = selectedItem.dohUrl;
              } else {
                document.getElementById('DNS_SERVER_ADDRESS').value = selectedItem.addr;
                document.getElementById('DNS_SERVER_PORT').value = selectedItem.port;
              }
              toggleDohInput();
              delBtn.style.display = selectedItem.isDefault ? 'none' : 'inline-block';
            }
          }

          async function deleteSelectedDns() {
            const val = document.getElementById('dns_select').value;
            if (val === 'CUSTOM' || val === 'DEFAULT_SCRIPT') return;
            const idx = parseInt(val);

            if (confirm('Yakin ingin menghapus preset DNS ini dari KV?')) {
              currentConfig.DNS_HISTORY.splice(idx, 1);
              await saveDirectPayloadToKV({ DNS_HISTORY: currentConfig.DNS_HISTORY });
            }
          }

          function toggleDohInput() {
            const type = document.getElementById('DNS_TYPE').value;
            document.getElementById('doh_field').style.display = type === 'DOH' ? 'block' : 'none';
            document.getElementById('udp_fields').style.display = type === 'UDP' ? 'block' : 'none';
          }

          function renderRelayOptions() {
            const select = document.getElementById('relay_select');
            select.innerHTML = '<option value="DEFAULT_SCRIPT">⚙️ Default Script (Reset ke udp-relay.hobihaus.space)</option>';

            currentConfig.RELAY_HISTORY.forEach((item, index) => {
              const opt = document.createElement('option');
              opt.value = index;
              opt.innerText = item.label;

              if (item.host === currentConfig.UDP_RELAY_HOST && item.port == currentConfig.UDP_RELAY_PORT) {
                opt.selected = true;
              }
              select.appendChild(opt);
            });

            const customOpt = document.createElement('option');
            customOpt.value = 'CUSTOM';
            customOpt.innerText = '✏️ Custom Input Relay Baru...';
            select.appendChild(customOpt);

            handleRelaySelectChange();
          }

          function handleRelaySelectChange() {
            const val = document.getElementById('relay_select').value;
            const customBox = document.getElementById('relay_custom_fields');
            const delBtn = document.getElementById('btn_delete_relay');

            if (val === 'DEFAULT_SCRIPT') {
              customBox.style.display = 'none';
              delBtn.style.display = 'none';
              document.getElementById('UDP_RELAY_HOST').value = DEFAULT_SCRIPT_RELAY.host;
              document.getElementById('UDP_RELAY_PORT').value = DEFAULT_SCRIPT_RELAY.port;
            } else if (val === 'CUSTOM') {
              customBox.style.display = 'block';
              delBtn.style.display = 'none';
            } else {
              customBox.style.display = 'none';
              const idx = parseInt(val);
              const selectedItem = currentConfig.RELAY_HISTORY[idx];
              document.getElementById('UDP_RELAY_HOST').value = selectedItem.host;
              document.getElementById('UDP_RELAY_PORT').value = selectedItem.port;
              delBtn.style.display = selectedItem.isDefault ? 'none' : 'inline-block';
            }
          }

          async function deleteSelectedRelay() {
            const val = document.getElementById('relay_select').value;
            if (val === 'CUSTOM' || val === 'DEFAULT_SCRIPT') return;
            const idx = parseInt(val);

            if (confirm('Yakin ingin menghapus server UDP Relay ini dari KV?')) {
              currentConfig.RELAY_HISTORY.splice(idx, 1);
              await saveDirectPayloadToKV({ RELAY_HISTORY: currentConfig.RELAY_HISTORY });
            }
          }

          function toggleRelayDisplay() {
            const mode = document.getElementById('UDP_MODE').value;
            document.getElementById('relay_wrapper').style.display = mode === 'RELAY' ? 'block' : 'none';
          }

          async function loadProxyList() {
            const select = document.getElementById('gen_proxy_select');
            try {
              const res = await fetch('/api/get-proxy-list');
              rawProxyList = await res.json();
              renderProxyOptions(rawProxyList);
            } catch (e) {
              console.error('Gagal load list proxy:', e);
            }
          }

          function renderProxyOptions(list) {
            const select = document.getElementById('gen_proxy_select');
            select.innerHTML = '<option value="CUSTOM">✏️ Custom / Manual Proxy Input</option>';

            if (list && list.length > 0) {
              list.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.prxIP + ':' + p.prxPort;
                opt.innerText = '[' + p.country + '] ' + p.prxIP + ':' + p.prxPort + ' (' + p.org + ')';
                select.appendChild(opt);
              });
            }
            toggleCustomProxyInput();
          }

          function filterProxyList() {
            const query = document.getElementById('gen_search').value.trim().toUpperCase();

            if (query === '' || query === 'ALL') {
              renderProxyOptions(rawProxyList);
              return;
            }

            const filtered = rawProxyList.filter(p => {
              const country = (p.country || '').toUpperCase();
              const org = (p.org || '').toUpperCase();
              const ip = (p.prxIP || '').toUpperCase();
              return country.includes(query) || org.includes(query) || ip.includes(query);
            });

            renderProxyOptions(filtered);
          }

          function toggleCustomProxyInput() {
            const val = document.getElementById('gen_proxy_select').value;
            document.getElementById('custom_proxy_field').style.display = (val === 'CUSTOM') ? 'block' : 'none';
          }

          function switchTab(tab) {
            document.getElementById('tab-gen').style.display = tab === 'gen' ? 'block' : 'none';
            document.getElementById('tab-add-prx').style.display = tab === 'add-prx' ? 'block' : 'none';
            document.getElementById('tab-settings').style.display = tab === 'settings' ? 'block' : 'none';
            const btns = document.querySelectorAll('.tab-btn');
            btns[0].classList.toggle('active', tab === 'gen');
            btns[1].classList.toggle('active', tab === 'add-prx');
            btns[2].classList.toggle('active', tab === 'settings');
          }

          // GENERATE SINGLE CONFIG DENGAN AUTOMATIC PORT DETECT
          function makeSingleConfig(mode) {
            let bug = document.getElementById('gen_bug').value.trim();
            if (bug.includes(':')) {
              bug = bug.split(':')[0];
            }

            const selectedPort = document.getElementById('gen_port').value;

            const proxySelect = document.getElementById('gen_proxy_select').value;
            let proxy = '';

            if (proxySelect === 'CUSTOM') {
              proxy = document.getElementById('gen_ip_custom').value.trim();
            } else {
              proxy = proxySelect;
            }

            if (!proxy) {
              alert('Silakan tentukan/pilih IP Proxy!');
              return;
            }

            const uuid = document.getElementById('gen_uuid').value.trim();
            const pathStr = '/' + proxy;

            // OTOMATIS: Jika Port 80/8080 maka NTLS (security=none), jika Port 443/8443 maka TLS (security=tls)
            const isNTLS = (selectedPort === '80' || selectedPort === '8080');
            const secMode = isNTLS ? 'none' : 'tls';

            let finalLink = '';
            let titleText = '';

            switch (mode) {
              case 'VLESS_STD':
                titleText = 'DDFATHU-VLESS-SNI-WS (STD)';
                finalLink = "vless://" + uuid + "@" + bug + ":" + selectedPort + "?encryption=none&type=ws&host=" + currentWorkerHost + "&path=" + encodeURIComponent(pathStr) + "&security=" + secMode + (secMode === 'tls' ? "&sni=" + currentWorkerHost : "") + "#VLESS-STD-" + bug;
                break;
              case 'TROJAN_STD':
                titleText = 'DDFATHU-TROJAN-SNI-WS (STD)';
                finalLink = "trojan://" + uuid + "@" + bug + ":" + selectedPort + "?type=ws&host=" + currentWorkerHost + "&path=" + encodeURIComponent(pathStr) + "&security=" + secMode + (secMode === 'tls' ? "&sni=" + currentWorkerHost : "") + "#Trojan-STD-" + bug;
                break;

              case 'VLESS_REV':
                titleText = 'DDFATHU-VLESS-SNI-WS (REV)';
                finalLink = "vless://" + uuid + "@" + currentWorkerHost + ":" + selectedPort + "?encryption=none&type=ws&host=" + bug + "&path=" + encodeURIComponent(pathStr) + "&security=" + secMode + (secMode === 'tls' ? "&sni=" + bug : "") + "#VLESS-REV-" + bug;
                break;
              case 'TROJAN_REV':
                titleText = 'DDFATHU-TROJAN-SNI-WS (REV)';
                finalLink = "trojan://" + uuid + "@" + currentWorkerHost + ":" + selectedPort + "?type=ws&host=" + bug + "&path=" + encodeURIComponent(pathStr) + "&security=" + secMode + (secMode === 'tls' ? "&sni=" + bug : "") + "#Trojan-REV-" + bug;
                break;

              case 'VLESS_CDN':
                titleText = 'DDFATHU-VLESS-CDN-NTLS';
                finalLink = "vless://" + uuid + "@" + bug + ":" + selectedPort + "?encryption=none&type=ws&host=" + currentWorkerHost + "&path=" + encodeURIComponent(pathStr) + "&security=" + secMode + "#VLESS-CDN-" + bug;
                break;
              case 'TROJAN_CDN':
                titleText = 'DDFATHU-TROJAN-CDN-NTLS';
                finalLink = "trojan://" + uuid + "@" + bug + ":" + selectedPort + "?type=ws&host=" + currentWorkerHost + "&path=" + encodeURIComponent(pathStr) + "&security=" + secMode + "#Trojan-CDN-" + bug;
                break;
            }

            document.getElementById('result_title').innerText = titleText;
            document.getElementById('out_result').innerText = finalLink;
            document.getElementById('gen_results').style.display = 'block';
          }

          function copyText(id) {
            const text = document.getElementById(id).innerText;
            navigator.clipboard.writeText(text);
            alert('Copied to clipboard!');
          }

          async function saveDirectPayloadToKV(partialData) {
            const statusDiv = document.getElementById('status');
            statusDiv.className = 'status';
            statusDiv.innerText = 'Menyimpan ke KV...';

            const payload = { ...currentConfig, ...partialData };

            try {
              const res = await fetch('/api/save-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const result = await res.json();
              if (res.ok && result.success) {
                statusDiv.className = 'status success';
                statusDiv.innerText = '✅ Berhasil Disimpan!';
                setTimeout(() => location.reload(), 1000);
              } else {
                throw new Error(result.message || 'Gagal menyimpan');
              }
            } catch (err) {
              statusDiv.className = 'status error';
              statusDiv.innerText = '❌ Error: ' + err.message;
            }
          }

          document.getElementById('configForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const dnsSelectVal = document.getElementById('dns_select').value;
            let finalDnsType = 'UDP';
            let finalDohUrl = document.getElementById('DOH_URL').value.trim();
            let finalDnsAddr = document.getElementById('DNS_SERVER_ADDRESS').value.trim();
            let finalDnsPort = document.getElementById('DNS_SERVER_PORT').value.trim();

            if (dnsSelectVal === 'DEFAULT_SCRIPT') {
              finalDnsType = DEFAULT_SCRIPT_DNS.type;
              finalDnsAddr = DEFAULT_SCRIPT_DNS.addr;
              finalDnsPort = DEFAULT_SCRIPT_DNS.port;
            } else if (dnsSelectVal !== 'CUSTOM') {
              const item = currentConfig.DNS_HISTORY[parseInt(dnsSelectVal)];
              finalDnsType = item.type;
              if (item.type === 'DOH') finalDohUrl = item.dohUrl;
              else { finalDnsAddr = item.addr; finalDnsPort = item.port; }
            } else {
              finalDnsType = document.getElementById('DNS_TYPE').value;
            }

            const relaySelectVal = document.getElementById('relay_select').value;
            let finalRelayHost = document.getElementById('UDP_RELAY_HOST').value.trim();
            let finalRelayPort = document.getElementById('UDP_RELAY_PORT').value.trim();

            if (relaySelectVal === 'DEFAULT_SCRIPT') {
              finalRelayHost = DEFAULT_SCRIPT_RELAY.host;
              finalRelayPort = DEFAULT_SCRIPT_RELAY.port;
            } else if (relaySelectVal !== 'CUSTOM') {
              const item = currentConfig.RELAY_HISTORY[parseInt(relaySelectVal)];
              finalRelayHost = item.host;
              finalRelayPort = item.port;
            }

            let updatedDnsHistory = [...currentConfig.DNS_HISTORY];
            if (dnsSelectVal === 'CUSTOM') {
              const newDnsEntry = finalDnsType === 'DOH' 
                ? { type: 'DOH', label: 'DoH: ' + finalDohUrl, dohUrl: finalDohUrl }
                : { type: 'UDP', label: 'UDP: ' + finalDnsAddr + ':' + finalDnsPort, addr: finalDnsAddr, port: finalDnsPort };
              
              const exists = updatedDnsHistory.some(h => JSON.stringify(h) === JSON.stringify(newDnsEntry));
              if (!exists) updatedDnsHistory.push(newDnsEntry);
            }

            let updatedRelayHistory = [...currentConfig.RELAY_HISTORY];
            if (relaySelectVal === 'CUSTOM') {
              const newRelayEntry = { label: 'Relay: ' + finalRelayHost + ':' + finalRelayPort, host: finalRelayHost, port: finalRelayPort };
              const exists = updatedRelayHistory.some(h => JSON.stringify(h) === JSON.stringify(newRelayEntry));
              if (!exists) updatedRelayHistory.push(newRelayEntry);
            }

            await saveDirectPayloadToKV({
              DNS_TYPE: finalDnsType,
              DOH_URL: finalDohUrl,
              DNS_SERVER_ADDRESS: finalDnsAddr,
              DNS_SERVER_PORT: finalDnsPort,
              UDP_MODE: document.getElementById('UDP_MODE').value,
              UDP_RELAY_HOST: finalRelayHost,
              UDP_RELAY_PORT: finalRelayPort,
              REVERSE_PRX_TARGET: document.getElementById('REVERSE_PRX_TARGET').value.trim(),
              PRX_BANK_URL: document.getElementById('PRX_BANK_URL').value.trim(),
              KV_PRX_URL: document.getElementById('KV_PRX_URL').value.trim(),
              DNS_HISTORY: updatedDnsHistory,
              RELAY_HISTORY: updatedRelayHistory
            });
          });
        </script>
      </body>
      </html>
      `;

      // Path '/ui'
      if (url.pathname === "/ui") {
        return new Response(htmlContent, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Path Utama (Domain tanpa /ui)
      const targetReversePrx = currentConfig.REVERSE_PRX_TARGET;

      if (url.pathname === "/") {
        if (!targetReversePrx || targetReversePrx === "example.com" || targetReversePrx.trim() === "") {
          return new Response(htmlContent, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      }

      // API Simpan Konfigurasi KV
      if (url.pathname === "/api/save-config" && request.method === "POST") {
        if (!env.CONFIG_KV) {
          return new Response(
            JSON.stringify({ success: false, message: "Binding CONFIG_KV belum diset di Cloudflare Worker!" }),
            { status: 400, headers: { ...CORS_HEADER_OPTIONS, "Content-Type": "application/json" } }
          );
        }

        const body = await request.json();

        let oldConfig = {};
        try {
          const stored = await env.CONFIG_KV.get("APP_CONFIG", { type: "json" });
          if (stored) oldConfig = stored;
        } catch (e) {}

        const mergedConfig = { ...DEFAULT_CONFIG, ...oldConfig, ...body };
        await env.CONFIG_KV.put("APP_CONFIG", JSON.stringify(mergedConfig));

        return new Response(
          JSON.stringify({ success: true, message: "Pengaturan berhasil disimpan ke KV." }),
          { status: 200, headers: { ...CORS_HEADER_OPTIONS, "Content-Type": "application/json" } }
        );
      }

      const upgradeHeader = request.headers.get("Upgrade");

      // Handle VPN Traffic (WebSocket)
      if (upgradeHeader === "websocket") {
        const prxMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);

        if (url.pathname.length == 3 || url.pathname.match(",")) {
          const prxKeys = url.pathname.replace("/", "").toUpperCase().split(",");
          const prxKey = prxKeys[Math.floor(Math.random() * prxKeys.length)];
          const kvPrx = await getKVPrxList(currentConfig.KV_PRX_URL);

          prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];

          return await websocketHandler(request, currentConfig);
        } else if (prxMatch) {
          prxIP = prxMatch[1];
          return await websocketHandler(request, currentConfig);
        }
      }

      if (url.pathname.startsWith("/sub")) {
        return Response.redirect(SUB_PAGE_URL + `?host=${APP_DOMAIN}`, 301);
      } else if (url.pathname.startsWith("/check")) {
        const target = url.searchParams.get("target").split(":");
        const result = await checkPrxHealth(target[0], target[1] || "443");

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            ...CORS_HEADER_OPTIONS,
            "Content-Type": "application/json",
          },
        });
      } else if (url.pathname.startsWith("/api/v1")) {
        const apiPath = url.pathname.replace("/api/v1", "");

        if (apiPath.startsWith("/sub")) {
          const filterCC = url.searchParams.get("cc")?.split(",") || [];
          const filterPort = url.searchParams.get("port")?.split(",") || PORTS;
          const filterVPN = url.searchParams.get("vpn")?.split(",") || PROTOCOLS;
          const filterLimit = parseInt(url.searchParams.get("limit")) || 10;
          const filterFormat = url.searchParams.get("format") || "raw";
          const fillerDomain = url.searchParams.get("domain") || APP_DOMAIN;

          const prxBankUrl = url.searchParams.get("prx-list") || currentConfig.PRX_BANK_URL;
          const prxList = await getPrxList(prxBankUrl, currentConfig.CUSTOM_PRX_LIST)
            .then((prxs) => {
              if (filterCC.length) {
                return prxs.filter((prx) => filterCC.includes(prx.country));
              }
              return prxs;
            })
            .then((prxs) => {
              shuffleArray(prxs);
              return prxs;
            });

          const uuid = crypto.randomUUID();
          const result = [];
          for (const prx of prxList) {
            const uri = new URL(`${atob(horse)}://${fillerDomain}`);
            uri.searchParams.set("encryption", "none");
            uri.searchParams.set("type", "ws");
            uri.searchParams.set("host", APP_DOMAIN);

            for (const port of filterPort) {
              for (const protocol of filterVPN) {
                if (result.length >= filterLimit) break;

                uri.protocol = protocol;
                uri.port = port.toString();
                if (protocol == "ss") {
                  uri.username = btoa(`none:${uuid}`);
                  uri.searchParams.set(
                    "plugin",
                    `${atob(v2)}-plugin${port == 80 ? "" : ";tls"};mux=0;mode=websocket;path=/${prx.prxIP}-${
                      prx.prxPort
                    };host=${APP_DOMAIN}`,
                  );
                } else {
                  uri.username = uuid;
                }

                uri.searchParams.set("security", port == 443 ? "tls" : "none");
                uri.searchParams.set("sni", port == 80 && protocol == atob(neko) ? "" : APP_DOMAIN);
                uri.searchParams.set("path", `/${prx.prxIP}-${prx.prxPort}`);

                uri.hash = `${result.length + 1} ${getFlagEmoji(prx.country)} ${prx.org} WS ${
                  port == 443 ? "TLS" : "NTLS"
                } [${serviceName}]`;
                result.push(uri.toString());
              }
            }
          }

          let finalResult = "";
          switch (filterFormat) {
            case "raw":
              finalResult = result.join("\n");
              break;
            case atob(v2):
              finalResult = btoa(result.join("\n"));
              break;
            case atob(neko):
            case "sfa":
            case "bfr":
              const res = await fetch(CONVERTER_URL, {
                method: "POST",
                body: JSON.stringify({
                  url: result.join(","),
                  format: filterFormat,
                  template: "cf",
                }),
              });
              if (res.status == 200) {
                finalResult = await res.text();
              } else {
                return new Response(res.statusText, {
                  status: res.status,
                  headers: {
                    ...CORS_HEADER_OPTIONS,
                  },
                });
              }
              break;
          }

          return new Response(finalResult, {
            status: 200,
            headers: {
              ...CORS_HEADER_OPTIONS,
            },
          });
        } else if (apiPath.startsWith("/myip")) {
          return new Response(
            JSON.stringify({
              ip:
                request.headers.get("cf-connecting-ipv6") ||
                request.headers.get("cf-connecting-ip") ||
                request.headers.get("x-real-ip"),
              colo: request.headers.get("cf-ray")?.split("-")[1],
              ...request.cf,
            }),
            {
              headers: {
                ...CORS_HEADER_OPTIONS,
              },
            },
          );
        }
      }

      return await reverseWeb(request, targetReversePrx);
    } catch (err) {
      return new Response(`An error occurred: ${err.toString()}`, {
        status: 500,
        headers: {
          ...CORS_HEADER_OPTIONS,
        },
      });
    }
  },
};

async function websocketHandler(request, config) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);

  webSocket.accept();

  let addressLog = "";
  let portLog = "";
  const log = (info, event) => {
    console.log(`[${addressLog}:${portLog}] ${info}`, event || "");
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

  let remoteSocketWrapper = {
    value: null,
  };
  let isDNS = false;

  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          if (isDNS) {
            if (config.DNS_TYPE === "DOH") {
              return handleDoHOutbound(config.DOH_URL, chunk, webSocket, null, log);
            }
            return handleUDPOutbound(
              config.DNS_SERVER_ADDRESS,
              config.DNS_SERVER_PORT,
              chunk,
              webSocket,
              null,
              log,
              config
            );
          }

          if (remoteSocketWrapper.value) {
            const writer = remoteSocketWrapper.value.writable.getWriter();
            await writer.write(chunk);
            writer.releaseLock();
            return;
          }

          const protocol = await protocolSniffer(chunk);
          let protocolHeader;

          if (protocol === atob(horse)) {
            protocolHeader = readHorseHeader(chunk);
          } else if (protocol === atob(flash)) {
            protocolHeader = await readStreamHeader(chunk);
          } else if (protocol === atob(neko)) {
            protocolHeader = readNekoHeader(chunk);
          } else if (protocol === "ss") {
            protocolHeader = readSsHeader(chunk);
          } else {
            throw new Error("Unknown Protocol!");
          }

          addressLog = protocolHeader.addressRemote;
          portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? "UDP" : "TCP"}`;

          if (protocolHeader.hasError) {
            throw new Error(protocolHeader.message);
          }

          let responseHeader = protocolHeader.version;
          if (protocol === atob(flash) && protocolHeader.needsResponse) {
            responseHeader = await generateStreamResponseHeader(
              protocolHeader.responseOptions,
              protocolHeader.encKey,
              protocolHeader.encIv,
            );
          }

          if (protocolHeader.isUDP) {
            if (protocolHeader.portRemote === 53) {
              isDNS = true;
              if (config.DNS_TYPE === "DOH") {
                return handleDoHOutbound(config.DOH_URL, chunk, webSocket, responseHeader, log);
              }
              return handleUDPOutbound(
                config.DNS_SERVER_ADDRESS,
                config.DNS_SERVER_PORT,
                chunk,
                webSocket,
                responseHeader,
                log,
                config
              );
            }

            return handleUDPOutbound(
              protocolHeader.addressRemote,
              protocolHeader.portRemote,
              chunk,
              webSocket,
              responseHeader,
              log,
              config
            );
          }

          handleTCPOutBound(
            remoteSocketWrapper,
            protocolHeader.addressRemote,
            protocolHeader.portRemote,
            protocolHeader.rawClientData,
            webSocket,
            responseHeader,
            log,
          );
        },
        close() {
          log(`readableWebSocketStream is close`);
        },
        abort(reason) {
          log(`readableWebSocketStream is abort`, JSON.stringify(reason));
        },
      }),
    )
    .catch((err) => {
      log("readableWebSocketStream pipeTo error", err);
    });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function protocolSniffer(buffer) {
  if (buffer.byteLength >= 62) {
    const horseDelimiter = new Uint8Array(buffer.slice(56, 60));
    if (horseDelimiter[0] === 0x0d && horseDelimiter[1] === 0x0a) {
      if (horseDelimiter[2] === 0x01 || horseDelimiter[2] === 0x03 || horseDelimiter[2] === 0x7f) {
        if (horseDelimiter[3] === 0x01 || horseDelimiter[3] === 0x03 || horseDelimiter[3] === 0x04) {
          return atob(horse);
        }
      }
    }
  }

  if (buffer.byteLength >= 18) {
    const version = new Uint8Array(buffer.slice(0, 1))[0];
    if (version === 0) {
      const protocolUuid = new Uint8Array(buffer.slice(1, 17));
      if (arrayBufferToHex(protocolUuid).match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) {
        return atob(neko);
      }
    }
  }

  if (buffer.byteLength >= 42) {
    const firstByte = new Uint8Array(buffer.slice(0, 1))[0];
    if (firstByte === 0x01 || firstByte === 0x03 || firstByte === 0x04) {
      return "ss";
    }
    return atob(flash);
  }

  return "ss";
}

async function generateStreamResponseHeader(responseOptions, encKey, encIv) {
  try {
    const key = (await sha256(encKey)).slice(0, 16);
    const lengthKey = (await kdf(key, [SALT_B1])).slice(0, 16);
    const lengthIv = (await kdf(key, [SALT_B2])).slice(0, 12);

    const lengthData = new Uint8Array([0, 4]);
    const encryptedLength = await aesGcmEncrypt(lengthKey, lengthIv, lengthData, new Uint8Array(0));

    const headerPayload = new Uint8Array([responseOptions[0], 0x00, 0x00, 0x00]);
    const payloadKey = (await kdf(key, [SALT_B3])).slice(0, 16);
    const payloadIv = (await kdf(key, [SALT_B4])).slice(0, 12);

    const encryptedPayload = await aesGcmEncrypt(payloadKey, payloadIv, headerPayload, new Uint8Array(0));

    const response = new Uint8Array(encryptedLength.length + encryptedPayload.length);
    response.set(encryptedLength, 0);
    response.set(encryptedPayload, encryptedLength.length);

    return response;
  } catch (e) {
    console.error("VMess Response Header Error:", e);
    return new Uint8Array(0);
  }
}

async function readStreamHeader(buffer) {
  try {
    const uuidString = "00000000-0000-0000-0000-000000000000";
    const uuidBytes = new Uint8Array(
      uuidString
        .replace(/-/g, "")
        .match(/.{1,2}/g)
        .map((byte) => parseInt(byte, 16)),
    );

    const authKey = await md5(
      uuidBytes,
      new TextEncoder().encode(atob("YzQ4NjE5ZmUtOGYwMi00OWUwLWI5ZTktZWRmNzYzZTE3ZTIx")),
    );

    const authId = new Uint8Array(buffer.slice(0, 16));
    const encryptedLength = new Uint8Array(buffer.slice(16, 34));
    const nonce = new Uint8Array(buffer.slice(34, 42));

    const lengthKey = (await kdf(authKey, [SALT_A1, authId, nonce])).slice(0, 16);
    const lengthIv = (await kdf(authKey, [SALT_A2, authId, nonce])).slice(0, 12);

    const lengthBytes = await aesGcmDecrypt(lengthKey, lengthIv, encryptedLength, authId);
    const headerLength = (lengthBytes[0] << 8) | lengthBytes[1];

    const encryptedHeader = new Uint8Array(buffer.slice(42, 42 + headerLength + 16));

    const payloadKey = (await kdf(authKey, [SALT_A3, authId, nonce])).slice(0, 16);
    const payloadIv = (await kdf(authKey, [SALT_A4, authId, nonce])).slice(0, 12);

    const headerPayload = await aesGcmDecrypt(payloadKey, payloadIv, encryptedHeader, authId);

    const view = new DataView(headerPayload.buffer);
    let offset = 0;

    const version = view.getUint8(offset);
    offset += 1;
    if (version !== 1) {
      return { hasError: true, message: `Invalid protocol version: ${version}` };
    }

    const encIv = new Uint8Array(headerPayload.slice(offset, offset + 16));
    offset += 16;

    const encKey = new Uint8Array(headerPayload.slice(offset, offset + 16));
    offset += 16;

    const options = new Uint8Array(headerPayload.slice(offset, offset + 4));
    offset += 4;

    const cmd = view.getUint8(offset);
    offset += 1;
    const isUDP = cmd !== 0x01;

    const portRemote = view.getUint16(offset, false);
    offset += 2;

    const addressType = view.getUint8(offset);
    offset += 1;
    let addressRemote = "";

    switch (addressType) {
      case 1:
        addressRemote = `${view.getUint8(offset)}.${view.getUint8(offset + 1)}.${view.getUint8(offset + 2)}.${view.getUint8(offset + 3)}`;
        offset += 4;
        break;
      case 2:
      case 3:
        const domainLength = view.getUint8(offset);
        offset += 1;
        addressRemote = new TextDecoder().decode(headerPayload.slice(offset, offset + domainLength));
        offset += domainLength;
        break;
      case 4:
        const ipv6Parts = [];
        for (let i = 0; i < 8; i++) {
          ipv6Parts.push(view.getUint16(offset + i * 2, false).toString(16));
        }
        addressRemote = ipv6Parts.join(":");
        offset += 16;
        break;
      default:
        return { hasError: true, message: `Invalid address type: ${addressType}` };
    }

    const rawDataIndex = 42 + headerLength + 16;

    return {
      hasError: false,
      addressRemote,
      addressType,
      portRemote,
      rawDataIndex,
      rawClientData: buffer.slice(rawDataIndex),
      version: new Uint8Array([options[0], 0]),
      isUDP,
      needsResponse: true,
      responseOptions: options,
      encKey: encKey,
      encIv: encIv,
    };
  } catch (e) {
    return {
      hasError: true,
      message: "Stream header parsing failed: " + e.message,
    };
  }
}

function readSsHeader(ssBuffer) {
  const view = new DataView(ssBuffer);

  const addressType = view.getUint8(0);
  let addressLength = 0;
  let addressValueIndex = 1;
  let addressValue = "";

  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 3:
      addressLength = new Uint8Array(ssBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 4:
      addressLength = 16;
      const dataView = new DataView(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `Invalid addressType for SS: ${addressType}`,
      };
  }

  if (!addressValue) {
    return {
      hasError: true,
      message: `Destination address empty, address type is: ${addressType}`,
    };
  }

  const portIndex = addressValueIndex + addressLength;
  const portBuffer = ssBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: portIndex + 2,
    rawClientData: ssBuffer.slice(portIndex + 2),
    version: null,
    isUDP: portRemote == 53,
  };
}

function readNekoHeader(buffer) {
  const version = new Uint8Array(buffer.slice(0, 1));
  let isUDP = false;

  const optLength = new Uint8Array(buffer.slice(17, 18))[0];

  const cmd = new Uint8Array(buffer.slice(18 + optLength, 18 + optLength + 1))[0];
  if (cmd === 1) {
  } else if (cmd === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${cmd} is not supported`,
    };
  }
  const portIndex = 18 + optLength + 1;
  const portBuffer = buffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  let addressIndex = portIndex + 2;
  const addressBuffer = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1));

  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 2:
      addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3:
      addressLength = 16;
      const dataView = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invild addressType is ${addressType}`,
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `addressValue is empty, addressType is ${addressType}`,
    };
  }

  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    rawClientData: buffer.slice(addressValueIndex + addressLength),
    version: new Uint8Array([version[0], 0]),
    isUDP: isUDP,
  };
}

function readHorseHeader(buffer) {
  const dataBuffer = buffer.slice(58);
  if (dataBuffer.byteLength < 6) {
    return {
      hasError: true,
      message: "invalid request data",
    };
  }

  let isUDP = false;
  const view = new DataView(dataBuffer);
  const cmd = view.getUint8(0);
  if (cmd == 3) {
    isUDP = true;
  } else if (cmd != 1) {
    throw new Error("Unsupported command type!");
  }

  let addressType = view.getUint8(1);
  let addressLength = 0;
  let addressValueIndex = 2;
  let addressValue = "";
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 3:
      addressLength = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 4:
      addressLength = 16;
      const dataView = new DataView(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invalid addressType is ${addressType}`,
      };
  }

  if (!addressValue) {
    return {
      hasError: true,
      message: `address is empty, addressType is ${addressType}`,
    };
  }

  const portIndex = addressValueIndex + addressLength;
  const portBuffer = dataBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: portIndex + 4,
    rawClientData: dataBuffer.slice(portIndex + 4),
    version: null,
    isUDP: isUDP,
  };
}

async function handleTCPOutBound(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
  webSocket,
  responseHeader,
  log,
) {
  async function connectAndWrite(address, port) {
    const tcpSocket = connect({
      hostname: address,
      port: port,
    });
    remoteSocket.value = tcpSocket;
    log(`connected to ${address}:${port}`);
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData);
    writer.releaseLock();

    return tcpSocket;
  }

  async function retry() {
    const tcpSocket = await connectAndWrite(
      prxIP.split(/[:=-]/)[0] || addressRemote,
      prxIP.split(/[:=-]/)[1] || portRemote,
    );
    tcpSocket.closed
      .catch((error) => {
        console.log("retry tcpSocket closed error", error);
      })
      .finally(() => {
        safeCloseWebSocket(webSocket);
      });
    remoteSocketToWS(tcpSocket, webSocket, responseHeader, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);

  remoteSocketToWS(tcpSocket, webSocket, responseHeader, retry, log);
}

async function handleDoHOutbound(dohUrl, dataChunk, webSocket, responseHeader, log) {
  try {
    let protocolHeader = responseHeader;

    const dohResponse = await fetch(dohUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        "Accept": "application/dns-message",
      },
      body: dataChunk,
    });

    if (dohResponse.ok && webSocket.readyState === WS_READY_STATE_OPEN) {
      const dnsResponseBuffer = await dohResponse.arrayBuffer();
      
      if (protocolHeader) {
        webSocket.send(await new Blob([protocolHeader, dnsResponseBuffer]).arrayBuffer());
      } else {
        webSocket.send(dnsResponseBuffer);
      }
    }
  } catch (e) {
    console.error(`Error handling DoH Outbound: ${e.message}`);
  }
}

async function handleUDPOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader, log, config) {
  try {
    let protocolHeader = responseHeader;
    let tcpSocket;

    if (config.UDP_MODE === "NATIVE") {
      tcpSocket = connect({
        hostname: targetAddress,
        port: targetPort,
      });

      const writer = tcpSocket.writable.getWriter();
      await writer.write(dataChunk);
      writer.releaseLock();
    } else {
      const relayHost = config.UDP_RELAY_HOST || "udp-relay.hobihaus.space";
      const relayPort = config.UDP_RELAY_PORT || 7300;

      tcpSocket = connect({
        hostname: relayHost,
        port: relayPort,
      });

      const header = `udp:${targetAddress}:${targetPort}`;
      const headerBuffer = new TextEncoder().encode(header);
      const separator = new Uint8Array([0x7c]);
      const relayMessage = new Uint8Array(headerBuffer.length + separator.length + dataChunk.byteLength);
      relayMessage.set(headerBuffer, 0);
      relayMessage.set(separator, headerBuffer.length);
      relayMessage.set(new Uint8Array(dataChunk), headerBuffer.length + separator.length);

      const writer = tcpSocket.writable.getWriter();
      await writer.write(relayMessage);
      writer.releaseLock();
    }

    await tcpSocket.readable.pipeTo(
      new WritableStream({
        async write(chunk) {
          if (webSocket.readyState === WS_READY_STATE_OPEN) {
            if (protocolHeader) {
              webSocket.send(await new Blob([protocolHeader, chunk]).arrayBuffer());
              protocolHeader = null;
            } else {
              webSocket.send(chunk);
            }
          }
        },
        close() {
          log(`UDP connection to ${targetAddress} closed`);
        },
        abort(reason) {
          console.error(`UDP connection aborted due to ${reason}`);
        },
      }),
    );
  } catch (e) {
    console.error(`Error while handling UDP outbound: ${e.message}`);
  }
}

function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event) => {
        if (readableStreamCancel) {
          return;
        }
        const message = event.data;
        controller.enqueue(message);
      });
      webSocketServer.addEventListener("close", () => {
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });
      webSocketServer.addEventListener("error", (err) => {
        log("webSocketServer has error");
        controller.error(err);
      });
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },

    pull(controller) {},
    cancel(reason) {
      if (readableStreamCancel) {
        return;
      }
      log(`ReadableStream was canceled, due to ${reason}`);
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    },
  });

  return stream;
}

async function remoteSocketToWS(remoteSocket, webSocket, responseHeader, retry, log) {
  let header = responseHeader;
  let hasIncomingData = false;

  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          hasIncomingData = true;
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            controller.error("webSocket.readyState is not open");
            return;
          }
          if (header && header.byteLength > 0) {
            const combined = new Uint8Array(header.byteLength + chunk.byteLength);
            combined.set(new Uint8Array(header), 0);
            combined.set(new Uint8Array(chunk), header.byteLength);
            webSocket.send(combined.buffer);
            header = null;
          } else {
            webSocket.send(chunk);
          }
        },
        close() {
          log(`remoteConnection!.readable is close`);
        },
        abort(reason) {
          console.error(`remoteConnection!.readable abort`, reason);
        },
      })
    )
    .catch((error) => {
      console.error(`remoteSocketToWS exception`, error);
      safeCloseWebSocket(webSocket);
    });

  if (!hasIncomingData && retry) {
    log(`retry`);
    retry();
  }
}

function safeCloseWebSocket(socket) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
  }
}

async function checkPrxHealth(prxIP, prxPort) {
  const req = await fetch(`${PRX_HEALTH_CHECK_API}?ip=${prxIP}:${prxPort}`);
  return await req.json();
}

function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { error: null };
  }
  try {
    base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    const decode = atob(base64Str);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    return { error };
  }
}

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function shuffleArray(array) {
  let currentIndex = array.length;

  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
}

function getFlagEmoji(isoCode) {
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// CRYPTO HELPERS (LOGIKA VMESS PADA WORKER)
async function md5(...inputs) {
  const combined = new Uint8Array(inputs.reduce((acc, input) => acc + input.length, 0));
  let offset = 0;
  for (const input of inputs) {
    combined.set(new Uint8Array(input), offset);
    offset += input.length;
  }
  const hashBuffer = await crypto.subtle.digest("MD5", combined);
  return new Uint8Array(hashBuffer);
}

async function sha256(input) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(hashBuffer);
}

async function kdf(key, path) {
  async function hmacSha256(key, data) {
    const hmacKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", hmacKey, data);
    return new Uint8Array(signature);
  }

  async function recursiveHash(keyBytes, innerHashFn) {
    return async (data) => {
      const ipad = new Uint8Array(64);
      const opad = new Uint8Array(64);

      ipad.set(keyBytes.slice(0, Math.min(64, keyBytes.length)));
      opad.set(keyBytes.slice(0, Math.min(64, keyBytes.length)));

      for (let i = 0; i < 64; i++) {
        ipad[i] ^= 0x36;
        opad[i] ^= 0x5c;
      }

      const innerData = new Uint8Array(ipad.length + data.length);
      innerData.set(ipad);
      innerData.set(data, ipad.length);
      const innerResult = await innerHashFn(innerData);

      const outerData = new Uint8Array(opad.length + innerResult.length);
      outerData.set(opad);
      outerData.set(innerResult, opad.length);
      return await innerHashFn(outerData);
    };
  }

  const sha256Hash = async (data) => {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  };

  let currentHashFn = await recursiveHash(new TextEncoder().encode("VMess AEAD KDF"), sha256Hash);

  for (const salt of path) {
    const saltBytes = typeof salt === "string" ? new TextEncoder().encode(salt) : new Uint8Array(salt);
    currentHashFn = await recursiveHash(saltBytes, currentHashFn);
  }

  return await currentHashFn(key);
}

async function aesGcmDecrypt(key, nonce, data, aad) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, cryptoKey, data);
    return new Uint8Array(decrypted);
  } catch (e) {
    throw new Error("AEAD decryption failed: " + e.message);
  }
}

async function aesGcmEncrypt(key, nonce, data, aad) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"]);

  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, cryptoKey, data);
  return new Uint8Array(encrypted);
}
