// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  WICK MODS — free-mint gun ATTACHMENTS for PEPE WICK (PulseChain, chainId 369).

  - FREE mint (gas only), HOLDERS ONLY: every WICK Arsenal gun NFT grants
    exactly 3 mod mints. 1 gun = 3 mints, 10 guns = 30. No gun, no mint.
  - The allowance belongs to the GUN, not the wallet (gunMintsUsed[gunId]) —
    cycling one gun through fresh wallets re-mints NOTHING: a spent gun stays
    spent when it changes hands. This is the whole anti-farm design.
  - MAX_SUPPLY = 300 (101 guns x 3 = 303 max entitlement — effectively everyone
    can mint full allowance, first come first served on the last few).
  - 6 attachment types, each mapping to a REAL mechanic in the game:
      1 LASER SIGHT    (Common)   spread x0.35 — near-laser accuracy
      2 HOLLOW POINTS  (Common)   +15% damage
      3 HAIR TRIGGER   (Uncommon) +15% fire rate
      4 LONG BARREL    (Uncommon) +30% bullet velocity, +5% damage
      5 AP ROUNDS      (Rare)     +1 pierce
      6 DRAGONS BREATH (Epic)     +1 projectile per shot
    Fixed pool: 90 / 80 / 60 / 45 / 20 / 5.
  - Type is drawn at mint from the remaining pool (free items don't need the
    guns' blind commit-reveal; prevrandao entropy is plenty when price = 0).
  - In game: equip 1 WICK Arsenal gun + up to 3 DISTINCT mod types. Duplicates
    don't stack.
  - Fully self-contained ERC-721 with on-chain SVG metadata — no IPFS, no server.
  - modTypeOf(id) / modsOfOwner(addr) let the game read a wallet's attachments.
*/

interface IWickGunsMin {
  function gunsOfOwner(address) external view returns (uint256[] memory ids, uint8[] memory types);
}

library B64m {
  bytes internal constant T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function encode(bytes memory data) internal pure returns (string memory) {
    if (data.length == 0) return "";
    uint256 enclen = 4 * ((data.length + 2) / 3);
    bytes memory result = new bytes(enclen);
    bytes memory tbl = T;
    uint256 i; uint256 j;
    for (; i + 3 <= data.length; i += 3) {
      uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i+1])) << 8) | uint256(uint8(data[i+2]));
      result[j++] = tbl[(n >> 18) & 63]; result[j++] = tbl[(n >> 12) & 63];
      result[j++] = tbl[(n >> 6) & 63];  result[j++] = tbl[n & 63];
    }
    if (data.length - i == 1) {
      uint256 n = uint256(uint8(data[i])) << 16;
      result[j++] = tbl[(n >> 18) & 63]; result[j++] = tbl[(n >> 12) & 63];
      result[j++] = "="; result[j++] = "=";
    } else if (data.length - i == 2) {
      uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i+1])) << 8);
      result[j++] = tbl[(n >> 18) & 63]; result[j++] = tbl[(n >> 12) & 63];
      result[j++] = tbl[(n >> 6) & 63];  result[j++] = "=";
    }
    return string(result);
  }
}

contract WickMods {
  string public constant name = "WICK Mods";
  string public constant symbol = "WICKMOD";

  uint256 public constant MAX_SUPPLY = 300;
  uint256 public constant MINTS_PER_GUN = 3;
  uint256 public constant MAX_PER_TX = 30;      // 10 guns' worth in one go

  address public owner;
  bool public mintOpen;
  uint256 public totalSupply;
  IWickGunsMin public immutable gunsNft;        // WICK Arsenal — the mint ticket
  mapping(uint256 => uint8) public gunMintsUsed; // gunId -> 0..3, travels WITH the gun

  // remaining pool per type (index 0 unused): 90/80/60/45/20/5
  uint16[7] private _pool = [0, 90, 80, 60, 45, 20, 5];

  mapping(uint256 => address) private _ownerOf;
  mapping(address => uint256) private _balanceOf;
  mapping(uint256 => uint8) private _type;
  mapping(uint256 => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;

  mapping(address => uint256[]) private _owned;
  mapping(uint256 => uint256) private _ownedIndex;

  event Transfer(address indexed from, address indexed to, uint256 indexed id);
  event Approval(address indexed owner, address indexed spender, uint256 indexed id);
  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
  event Minted(address indexed to, uint256 indexed id, uint8 modType);

  constructor(address _guns) {
    owner = msg.sender;
    require(_guns.code.length > 0, "bad guns addr");   // a codeless address would brick every mint
    gunsNft = IWickGunsMin(_guns);
  }
  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
  function setMintOpen(bool v) external onlyOwner { mintOpen = v; }
  function transferOwnership(address to) external onlyOwner { require(to != address(0), "zero"); owner = to; }

  /// how many free mints this wallet's CURRENT guns still carry
  function allowanceOf(address a) public view returns (uint256 free) {
    (uint256[] memory ids, ) = gunsNft.gunsOfOwner(a);
    for (uint256 i = 0; i < ids.length; i++) {
      uint8 used = gunMintsUsed[ids[i]];
      if (used < MINTS_PER_GUN) free += MINTS_PER_GUN - used;
    }
  }

  // ---------------- mint (FREE, gun-gated) ----------------
  function mint(uint256 qty) external {
    require(mintOpen, "mint closed");
    require(qty >= 1 && qty <= MAX_PER_TX, "1-30 per tx");
    require(totalSupply + qty <= MAX_SUPPLY, "sold out");
    (uint256[] memory ids, ) = gunsNft.gunsOfOwner(msg.sender);
    require(ids.length > 0, "need a WICK Arsenal gun to mint");
    // charge the caller's guns, 3 mints each, oldest-held first
    uint256 need = qty;
    for (uint256 i = 0; i < ids.length && need > 0; i++) {
      uint8 used = gunMintsUsed[ids[i]];
      if (used >= MINTS_PER_GUN) continue;
      uint256 take = MINTS_PER_GUN - used;
      if (take > need) take = need;
      gunMintsUsed[ids[i]] = uint8(used + take);
      need -= take;
    }
    require(need == 0, "not enough gun allowance (3 per gun)");
    for (uint256 k = 0; k < qty; k++) {
      uint256 id = ++totalSupply;
      uint8 t = _draw(id);
      _type[id] = t;
      _mint(msg.sender, id);
      emit Minted(msg.sender, id, t);
    }
  }

  /// draw a type from the remaining pool, weighted by what's left
  function _draw(uint256 id) internal returns (uint8) {
    uint256 left = MAX_SUPPLY - id + 1;   // tokens not yet drawn INCLUDING this one
    uint256 r = uint256(keccak256(abi.encodePacked(block.prevrandao, blockhash(block.number - 1), msg.sender, id))) % left;
    for (uint8 t = 1; t <= 6; t++) {
      if (r < _pool[t]) { _pool[t]--; return t; }
      r -= _pool[t];
    }
    revert("pool empty"); // unreachable while totalSupply <= MAX_SUPPLY
  }

  // ---------------- game/read API ----------------
  function modTypeOf(uint256 id) external view returns (uint8) {
    require(_ownerOf[id] != address(0), "no token");
    return _type[id];
  }
  function modsOfOwner(address a) external view returns (uint256[] memory ids, uint8[] memory types) {
    ids = _owned[a];
    types = new uint8[](ids.length);
    for (uint256 i = 0; i < ids.length; i++) types[i] = _type[ids[i]];
  }
  function poolLeft() external view returns (uint16[7] memory) { return _pool; }

  // ---------------- ERC-721 core ----------------
  function balanceOf(address a) external view returns (uint256) { require(a != address(0), "zero"); return _balanceOf[a]; }
  function ownerOf(uint256 id) public view returns (address o) { o = _ownerOf[id]; require(o != address(0), "no token"); }

  function approve(address spender, uint256 id) external {
    address o = ownerOf(id);
    require(msg.sender == o || isApprovedForAll[o][msg.sender], "not auth");
    getApproved[id] = spender;
    emit Approval(o, spender, id);
  }
  function setApprovalForAll(address op, bool ok) external {
    isApprovedForAll[msg.sender][op] = ok;
    emit ApprovalForAll(msg.sender, op, ok);
  }
  function transferFrom(address from, address to, uint256 id) public {
    require(from == _ownerOf[id], "wrong from");
    require(to != address(0), "zero to");
    require(msg.sender == from || isApprovedForAll[from][msg.sender] || msg.sender == getApproved[id], "not auth");
    delete getApproved[id];
    _balanceOf[from]--; _balanceOf[to]++;
    _ownerOf[id] = to;
    _removeOwned(from, id); _addOwned(to, id);
    emit Transfer(from, to, id);
  }
  function safeTransferFrom(address from, address to, uint256 id) external { safeTransferFrom(from, to, id, ""); }
  function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
    transferFrom(from, to, id);
    require(to.code.length == 0 ||
      IERC721Receiver(to).onERC721Received(msg.sender, from, id, data) == IERC721Receiver.onERC721Received.selector,
      "unsafe recipient");
  }
  function supportsInterface(bytes4 iid) external pure returns (bool) {
    return iid == 0x01ffc9a7 || iid == 0x80ac58cd || iid == 0x5b5e139f; // 165, 721, 721Metadata
  }

  function _mint(address to, uint256 id) internal {
    require(_ownerOf[id] == address(0), "exists");
    _balanceOf[to]++; _ownerOf[id] = to; _addOwned(to, id);
    emit Transfer(address(0), to, id);
  }
  function _addOwned(address a, uint256 id) internal { _ownedIndex[id] = _owned[a].length; _owned[a].push(id); }
  function _removeOwned(address a, uint256 id) internal {
    uint256[] storage arr = _owned[a];
    uint256 i = _ownedIndex[id]; uint256 lastId = arr[arr.length - 1];
    arr[i] = lastId; _ownedIndex[lastId] = i; arr.pop(); delete _ownedIndex[id];
  }

  // ---------------- on-chain metadata ----------------
  function _meta(uint8 t) internal pure returns (string memory nm, string memory rar, string memory fx, string memory col) {
    if (t == 1) return ("LASER SIGHT",    "Common",   "spread x0.35 - laser accuracy",  "#7fd0ff");
    if (t == 2) return ("HOLLOW POINTS",  "Common",   "+15% damage",                    "#ff9d9d");
    if (t == 3) return ("HAIR TRIGGER",   "Uncommon", "+15% fire rate",                 "#ffd75e");
    if (t == 4) return ("LONG BARREL",    "Uncommon", "+30% bullet speed, +5% damage",  "#c8ffe0");
    if (t == 5) return ("AP ROUNDS",      "Rare",     "+1 pierce",                      "#b26bff");
    return             ("DRAGONS BREATH", "Epic",     "+1 projectile per shot",         "#ff6b3d");
  }

  function _glyph(uint8 t, string memory col) internal pure returns (string memory) {
    if (t == 1) return string(abi.encodePacked("<circle cx='200' cy='215' r='60' fill='none' stroke='", col, "' stroke-width='6'/><circle cx='200' cy='215' r='6' fill='", col, "'/><path d='M200 130 v40 M200 260 v40 M115 215 h40 M245 215 h40' stroke='", col, "' stroke-width='6'/>"));
    if (t == 2) return string(abi.encodePacked("<path d='M200 140 l38 66 v60 a38 38 0 0 1 -76 0 v-60 z' fill='", col, "' opacity='.85'/><circle cx='200' cy='250' r='16' fill='#0a0d14'/>"));
    if (t == 3) return string(abi.encodePacked("<path d='M165 150 h70 v55 h-30 l-14 90 h-26 l14 -90 h-14 z' fill='", col, "' opacity='.9'/>"));
    if (t == 4) return string(abi.encodePacked("<rect x='110' y='196' width='180' height='38' rx='12' fill='", col, "' opacity='.85'/><rect x='250' y='188' width='46' height='54' rx='10' fill='", col, "'/>"));
    if (t == 5) return string(abi.encodePacked("<path d='M200 135 l30 52 -30 118 -30 -118 z' fill='", col, "' opacity='.9'/><path d='M200 135 l30 52 h-60 z' fill='#e8ecf4'/>"));
    return string(abi.encodePacked("<path d='M200 130 c50 40 62 86 34 122 c-4 -18 -14 -28 -26 -34 c8 34 -6 58 -34 70 c6 -16 4 -30 -6 -44 c-8 12 -20 20 -34 22 c22 -44 8 -84 66 -136 z' fill='", col, "' opacity='.9'/>"));
  }

  function _u(uint256 v) internal pure returns (string memory) {
    if (v == 0) return "0";
    bytes memory b; while (v > 0) { b = abi.encodePacked(uint8(48 + v % 10), b); v /= 10; }
    return string(b);
  }

  function tokenURI(uint256 id) external view returns (string memory) {
    require(_ownerOf[id] != address(0), "no token");
    uint8 t = _type[id];
    (string memory nm, string memory rar, string memory fx, string memory col) = _meta(t);
    string memory svg = string(abi.encodePacked(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'>",
      "<rect x='4' y='4' width='392' height='552' rx='24' fill='#0b0e15'/>",
      "<rect x='7' y='7' width='386' height='546' rx='21' fill='#0a0e18' stroke='", col, "' stroke-width='4'/>",
      "<rect x='18' y='18' width='364' height='524' rx='14' fill='none' stroke='", col, "' stroke-width='1.2' opacity='.5'/>",
      "<text x='200' y='58' fill='", col, "' font-family='Impact,Arial' font-size='24' letter-spacing='3' text-anchor='middle'>WICK MODS</text>",
      _glyph(t, col),
      "<text x='200' y='360' fill='#e8ecf4' font-family='Impact,Arial' font-size='30' letter-spacing='2' text-anchor='middle'>", nm, "</text>",
      "<text x='200' y='392' fill='", col, "' font-family='Arial' font-size='15' letter-spacing='2' text-anchor='middle'>", rar, " ATTACHMENT</text>",
      "<rect x='60' y='418' width='280' height='40' rx='9' fill='", col, "' opacity='.14'/>",
      "<text x='200' y='444' fill='#e8ecf4' font-family='Arial' font-size='14' text-anchor='middle'>", fx, "</text>",
      "<text x='200' y='496' fill='#5f6b7c' font-family='Arial' font-size='11' letter-spacing='1.5' text-anchor='middle'>BOLTS ONTO ANY WICK ARSENAL GUN - 3 SLOTS</text>",
      "<text x='200' y='522' fill='#e9f0ff' font-family='Courier New,monospace' font-size='14' font-weight='bold' text-anchor='middle'>No ", _u(id), " / 300</text>",
      "</svg>"));
    string memory json = string(abi.encodePacked(
      '{"name":"', nm, ' #', _u(id), '","description":"WICK MODS - free-mint gun attachment for PEPE WICK. ', fx,
      '. Equip 1 gun + up to 3 distinct mods in-game at games.wick.pics/play.",',
      '"attributes":[{"trait_type":"Type","value":"', nm, '"},{"trait_type":"Rarity","value":"', rar, '"}],',
      '"image":"data:image/svg+xml;base64,', B64m.encode(bytes(svg)), '"}'));
    return string(abi.encodePacked("data:application/json;base64,", B64m.encode(bytes(json))));
  }
}

interface IERC721Receiver {
  function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}
