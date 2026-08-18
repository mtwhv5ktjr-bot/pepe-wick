/* CONTINENTAL SIEGE — NFT holder detection (PulseChain 369).
   KJP GEAR (markers + BABA YAGA gatling) + WICK ARSENAL guns (the actual gun
   art in your operatives' hands, ≤+10% DPS envelope). One-call reads on the
   batch-reliable read RPC — gunsOfOwner / gearOfOwner return ids AND types —
   with an ownerOf scan fallback. Fully optional: the game is 100% playable with
   no wallet; every path here fails soft. */
(function (global) {
  'use strict';
  const GEAR_ADDR = '0x6BdED56bA6F0d8062e056062D47F41ac735d5d10';
  const GUNS_ADDR = '0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD';
  const RPC_READ = 'https://rpc-pulsechain.g4mm4.io';
  const RPC_WALLET = 'https://rpc.pulsechain.com';
  const CHAIN_HEX = '0x171'; // 369
  const CACHE_MS = 10 * 60 * 1000;
  const SEL_GUNS_OF_OWNER = '0x25a88846'; // gunsOfOwner(address) -> (uint256[] ids, uint8[] types)
  const SEL_GEAR_OF_OWNER = '0xfce8c498'; // gearOfOwner(address) -> (uint256[] ids, uint8[] types)
  const SEL_OWNER_OF = '0x6352211e';

  async function rpcCall(rpc, method, params) {
    const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'rpc error');
    return j.result;
  }
  const ethCall = (rpc, to, data) => rpcCall(rpc, 'eth_call', [{ to, data }, 'latest']);
  const wnum = (hex, i) => parseInt(hex.slice(2 + i * 64, 2 + (i + 1) * 64), 16);
  function decodeIdsTypes(hex) {
    if (!hex || hex === '0x' || hex.length < 2 + 64 * 4) return null;
    const o1 = wnum(hex, 0) / 32, o2 = wnum(hex, 1) / 32;
    const n1 = wnum(hex, o1), n2 = wnum(hex, o2);
    if (n1 !== n2 || n1 > 512) return null;
    const out = [];
    for (let i = 0; i < n1; i++) out.push({ id: wnum(hex, o1 + 1 + i), type: wnum(hex, o2 + 1 + i) });
    return out.sort((a, b) => a.id - b.id);
  }
  async function scan721(addr, contract, maxId) {
    const me = addr.toLowerCase(), ids = [], queue = [];
    for (let i = 1; i <= maxId; i++) queue.push(i);
    async function worker() {
      while (queue.length) {
        const id = queue.shift();
        try { const r = await ethCall(RPC_WALLET, contract, SEL_OWNER_OF + id.toString(16).padStart(64, '0')); if (r && r.length >= 66 && ('0x' + r.slice(-40)).toLowerCase() === me) ids.push(id); } catch (e) {}
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker));
    return ids.sort((a, b) => a - b).map(id => ({ id, type: 0 }));
  }
  async function loadOwned(addr, contract, selector, cacheKey, maxId) {
    const key = cacheKey + addr.toLowerCase();
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < CACHE_MS) return c.items; } catch (e) {}
    let items = null;
    const data = selector + addr.toLowerCase().replace('0x', '').padStart(64, '0');
    for (const rpc of [RPC_READ, RPC_WALLET]) { try { items = decodeIdsTypes(await ethCall(rpc, contract, data)); if (items) break; } catch (e) {} }
    if (!items) items = await scan721(addr, contract, maxId);
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), items })); } catch (e) {}
    return items;
  }
  async function connect() {
    const eth = global.ethereum;
    if (!eth) return { ok: false, err: 'NO WALLET DETECTED' };
    try {
      const accs = await eth.request({ method: 'eth_requestAccounts' });
      if (!accs || !accs.length) return { ok: false, err: 'NO ACCOUNT' };
      const addr = accs[0];
      try { const cid = await eth.request({ method: 'eth_chainId' }); if (cid !== CHAIN_HEX) { try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); } catch (e) {} } } catch (e) {}
      const [gear, guns] = await Promise.all([
        loadOwned(addr, GEAR_ADDR, SEL_GEAR_OF_OWNER, 'cs_gear2_', 100),
        loadOwned(addr, GUNS_ADDR, SEL_GUNS_OF_OWNER, 'cs_guns2_', 101),
      ]);
      return { ok: true, addr, gear, guns, count: gear.length, gunCount: guns.length, gearIds: gear.map(g => g.id), gunIds: guns.map(g => g.id), gunTypes: [...new Set(guns.map(g => g.type).filter(Boolean))] };
    } catch (e) { return { ok: false, err: (e && e.message) || 'WALLET REFUSED' }; }
  }
  global.CS_NFT = { connect, loadOwned, GEAR_ADDR, GUNS_ADDR };
})(typeof window !== 'undefined' ? window : globalThis);
