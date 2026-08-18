/* ARSENAL RANGE — WICK ARSENAL membership (PulseChain 369).
   Primary read: gunsOfOwner(address) -> (uint256[] ids, uint8[] types) in ONE
   call on the batch-reliable read RPC (same split as wick-arsenal's config:
   wallet-facing rpc vs g4mm4 read rpc). Fallback: ownerOf + gunTypeOf scans.
   THE RANGE IS MEMBERS ONLY — zero guns means the gate stays shut. */
(function (global) {
  'use strict';
  const GUNS_ADDR = '0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD';
  const MODS_ADDR = '0x004E6610ff47c6A6510DA446257822B37D26CD73'; // WICK MODS (free-mint attachments)
  const SEL_MODS_OF_OWNER = '0x8d56809a'; // modsOfOwner(address) -> (uint256[] ids, uint8[] types)
  const RPC_READ = 'https://rpc-pulsechain.g4mm4.io';
  const RPC_WALLET = 'https://rpc.pulsechain.com';
  const CHAIN_HEX = '0x171';
  const CACHE_MS = 10 * 60 * 1000;
  const SEL_GUNS_OF_OWNER = '0x25a88846'; // gunsOfOwner(address)
  const SEL_GUN_TYPE_OF = '0x605c01ec';   // gunTypeOf(uint256)
  const SEL_OWNER_OF = '0x6352211e';      // ownerOf(uint256)

  async function rpcCall(rpc, method, params) {
    const res = await fetch(rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'rpc error');
    return j.result;
  }
  const ethCall = (rpc, data, to) => rpcCall(rpc, 'eth_call', [{ to: to || GUNS_ADDR, data }, 'latest']);
  const word = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
  const wnum = (hex, i) => parseInt(word(hex, i), 16);

  // decode (uint256[] ids, uint8[] types)
  function decodeGunsOfOwner(hex) {
    if (!hex || hex === '0x' || hex.length < 2 + 64 * 4) return null;
    const o1 = wnum(hex, 0) / 32, o2 = wnum(hex, 1) / 32;
    const n1 = wnum(hex, o1), n2 = wnum(hex, o2);
    if (n1 !== n2 || n1 > 512) return null;
    const guns = [];
    for (let i = 0; i < n1; i++) {
      guns.push({ id: wnum(hex, o1 + 1 + i), type: wnum(hex, o2 + 1 + i) });
    }
    guns.sort((a, b) => a.id - b.id);
    return guns;
  }

  async function loadArsenal(addr) {
    const key = 'ar_arsenal_' + addr.toLowerCase();
    try {
      const c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && Date.now() - c.at < CACHE_MS) return c.guns;
    } catch (e) {}
    let guns = null;
    // primary: one call on the read RPC
    try {
      const data = SEL_GUNS_OF_OWNER + addr.toLowerCase().replace('0x', '').padStart(64, '0');
      guns = decodeGunsOfOwner(await ethCall(RPC_READ, data));
    } catch (e) {}
    if (!guns) { // fallback: ownerOf scan + per-gun type reads on the wallet RPC
      const me = addr.toLowerCase();
      const ids = [];
      const queue = [];
      for (let i = 1; i <= 101; i++) queue.push(i);
      async function worker() {
        while (queue.length) {
          const id = queue.shift();
          try {
            const r = await ethCall(RPC_WALLET, SEL_OWNER_OF + id.toString(16).padStart(64, '0'));
            if (r && r.length >= 66 && ('0x' + r.slice(-40)).toLowerCase() === me) ids.push(id);
          } catch (e) {}
        }
      }
      await Promise.all(Array.from({ length: 8 }, worker));
      guns = [];
      for (const id of ids.sort((a, b) => a - b)) {
        let type = 0;
        try {
          const r = await ethCall(RPC_WALLET, SEL_GUN_TYPE_OF + id.toString(16).padStart(64, '0'));
          if (r && r.length >= 66) type = parseInt(r.slice(-2), 16) || parseInt(r.slice(2), 16);
        } catch (e) {}
        guns.push({ id, type: type || 1 });
      }
    }
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), guns })); } catch (e) {}
    return guns;
  }

  // WICK MODS held by the wallet — [{id,type}], WITH repeats (two lasers = two
  // entries; each is a physical attachment that bolts to one gun). Failure →
  // empty list: attachments are a bonus, never a gate.
  async function loadMods(addr) {
    const key = 'ar_mods_' + addr.toLowerCase();
    try {
      const c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && Date.now() - c.at < CACHE_MS) return c.mods;
    } catch (e) {}
    let mods = [];
    const data = SEL_MODS_OF_OWNER + addr.toLowerCase().replace('0x', '').padStart(64, '0');
    for (const rpc of [RPC_READ, RPC_WALLET]) {
      try {
        const dec = decodeGunsOfOwner(await ethCall(rpc, data, MODS_ADDR)); // same (ids, types) shape
        if (dec) { mods = dec; break; }
      } catch (e) {}
    }
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), mods })); } catch (e) {}
    return mods;
  }

  async function connect() {
    const eth = global.ethereum;
    if (!eth) return { ok: false, err: 'NO WALLET DETECTED' };
    try {
      const accs = await eth.request({ method: 'eth_requestAccounts' });
      if (!accs || !accs.length) return { ok: false, err: 'NO ACCOUNT' };
      const addr = accs[0];
      try {
        const cid = await eth.request({ method: 'eth_chainId' });
        if (cid !== CHAIN_HEX) {
          try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); } catch (e) {}
        }
      } catch (e) {}
      const guns = await loadArsenal(addr);
      const mods = guns.length ? await loadMods(addr) : [];
      return { ok: true, addr, guns, mods, gunCount: guns.length };
    } catch (e) {
      return { ok: false, err: (e && e.message) || 'WALLET REFUSED' };
    }
  }

  global.AR_NFT = { connect, loadArsenal, loadMods, GUNS_ADDR, MODS_ADDR, ARSENAL_URL: 'https://mint.wick.pics' };
})(typeof window !== 'undefined' ? window : globalThis);
