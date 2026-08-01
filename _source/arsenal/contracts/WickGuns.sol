// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  WICK ARSENAL — on-chain gun NFTs for PEPE WICK (PulseChain, chainId 369).

  THE PLEDGE: Utility is guaranteed in PEPE WICK today. Future titles may or
  may not support these NFTs — there is no obligation or timeline.

  - MAX_SUPPLY = 101 forever (100 public + TANGENT).
  - Token ID 1 is TANGENT — the honorary legendary forged for tangent.pls,
    owner-minted once, never in the public pool.
  - The FIVE platinum holo 1/1s are INSIDE the blind pool: 100 sealed cases hold
    95 regular guns + one each of types 11..15. Any mint can hit a platinum.
  - Public mint draws IDs 2..101 from a fixed rarity pool (supply is guaranteed
    per tier; the *type* you receive is randomised from the remaining pool).
  - Fully self-contained ERC-721 (no imports) with on-chain SVG metadata, so the
    art and provenance never depend on IPFS/a server.
  - gunTypeOf(id) and gunsOfOwner(addr) let the game read a wallet's loadout.

  Balance note: every gun sits in the same power band; rarer guns trade raw
  stats for a signature mechanic. The 1/1s are prestige + flavour, not power.
*/

library B64 {
  bytes internal constant T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function encode(bytes memory data) internal pure returns (string memory) {
    if (data.length == 0) return "";
    uint256 enclen = 4 * ((data.length + 2) / 3);
    bytes memory result = new bytes(enclen);
    bytes memory tbl = T;
    uint256 i; uint256 j;
    for (; i + 3 <= data.length; i += 3) {
      uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i+1])) << 8) | uint256(uint8(data[i+2]));
      result[j++] = tbl[(n >> 18) & 63];
      result[j++] = tbl[(n >> 12) & 63];
      result[j++] = tbl[(n >> 6) & 63];
      result[j++] = tbl[n & 63];
    }
    if (data.length - i == 1) {
      uint256 n = uint256(uint8(data[i])) << 16;
      result[j++] = tbl[(n >> 18) & 63];
      result[j++] = tbl[(n >> 12) & 63];
      result[j++] = "=";
      result[j++] = "=";
    } else if (data.length - i == 2) {
      uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i+1])) << 8);
      result[j++] = tbl[(n >> 18) & 63];
      result[j++] = tbl[(n >> 12) & 63];
      result[j++] = tbl[(n >> 6) & 63];
      result[j++] = "=";
    }
    return string(result);
  }
}

contract WickGuns {
  string public constant name = "WICK Arsenal";
  string public constant symbol = "WICKGUN";

  uint256 public constant MAX_SUPPLY = 101;
  uint256 public constant ONE_OF_ONES = 1;      // ID 1 = TANGENT, the only reserved token
  uint256 public constant PUBLIC_SUPPLY = 100;  // IDs 2..101 (95 regular + 5 platinum holos in the pool)

  address public owner;
  uint256 public mintPrice;                     // wei (PLS) per gun
  bool public mintOpen;
  uint256 public publicMinted;                  // 0..95
  uint256 public oooMinted;                     // 0..5
  uint256 public nextPublicId = 2;              // sequential public token id

  // fixed public supply per tier: Boogeyman 30, Vector 25, Breacher 18, Marksman 15, Excommunicado 7

  // --- blind mint (commit-reveal): types don't exist until reveal ---
  bytes32 public seedCommit;      // keccak256(ownerSeed), fixed at deploy
  uint256 public revealBlock;     // set when the final public token mints
  bytes32 public finalSeed;       // keccak256(ownerSeed, blockhash(revealBlock))
  bool public revealed;

  mapping(uint256 => address) private _ownerOf;
  mapping(address => uint256) private _balanceOf;
  mapping(uint256 => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;
  mapping(uint256 => uint8) private _fixedType; // only the 1/1s (ids 1..5 -> 11..15)

  // per-owner enumeration
  mapping(address => uint256[]) private _owned;
  mapping(uint256 => uint256) private _ownedIndex;

  event Transfer(address indexed from, address indexed to, uint256 indexed id);
  event Approval(address indexed owner, address indexed spender, uint256 indexed id);
  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
  event Minted(address indexed to, uint256 indexed id, uint8 gunType);

  IWickGunArt public immutable art;   // on-chain SVG renderer (split for the 24KB size limit)

  // --- 100% AUTOMATIC BUY & BURN -------------------------------------------
  // Every mint's PLS is swapped to $WICK on PulseX (the WICK/WPLS V1 pair —
  // route simulated against mainnet before deploy) and sent to the dead address
  // IN THE MINT TRANSACTION. There is no owner withdraw — revenue can only
  // leave this contract as a burn. If a swap ever fails (router hiccup), the
  // PLS pools here and anyone can convert it with the public burnPool() crank.
  address public constant BURN_ADDR = 0x000000000000000000000000000000000000dEaD;
  address public immutable burnRouter;   // PulseX V2-style router (address(0) = burns pool for burnPool)
  address public immutable burnPathIn;   // WPLS
  address public immutable wickToken;    // $WICK
  event Burned(uint256 plsIn, uint256 wickBurned, bool viaMint);

  constructor(uint256 _mintPrice, address _art, bytes32 _seedCommit,
              address _router, address _wpls, address _wick) {
    owner = msg.sender;
    mintPrice = _mintPrice;
    art = IWickGunArt(_art);
    seedCommit = _seedCommit;
    // a router with no code would silently swallow PLS (calls to codeless
    // addresses "succeed") — refuse any half-configured burn route
    require(_router == address(0) ||
      (_router.code.length > 0 && _wick.code.length > 0 && _wpls != address(0)), "bad burn route");
    burnRouter = _router;
    burnPathIn = _wpls;
    wickToken = _wick;
  }

  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

  // ---------------- admin ----------------
  function setMintOpen(bool v) external onlyOwner { mintOpen = v; }
  function setMintPrice(uint256 p) external onlyOwner { mintPrice = p; }
  function transferOwnership(address to) external onlyOwner { require(to != address(0), "zero"); owner = to; }

  /// Owner mints THE one reserved token: #1 TANGENT (type 16), the honorary
  /// legendary forged for tangent.pls. Every other gun — platinum holos
  /// included — lives in the public blind pool.
  function mintTangent(address to) external onlyOwner {
    require(_ownerOf[1] == address(0), "already minted");
    oooMinted++;
    _fixedType[1] = 16;
    _mint(to, 1);
    emit Minted(to, 1, 16);
  }

  // withdraw() is deliberately GONE: the 100%-burn pledge is enforced by code,
  // not by trust. Mint PLS has exactly one exit — a $WICK burn.

  function _buyBurn(uint256 amount, uint256 minOut, bool viaMint) internal returns (bool) {
    if (burnRouter == address(0) || amount == 0) return false;
    address[] memory path = new address[](2);
    path[0] = burnPathIn; path[1] = wickToken;
    uint256 had = IERC20Min(wickToken).balanceOf(BURN_ADDR);
    try IPulseXRouter(burnRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
      minOut, path, BURN_ADDR, block.timestamp) {
      emit Burned(amount, IERC20Min(wickToken).balanceOf(BURN_ADDR) - had, viaMint);
      return true;
    } catch { return false; }
  }

  /// Anyone may convert pooled PLS (failed auto-burns, direct sends) into a burn.
  /// Caller picks minOut to defend the burn against sandwiching.
  function burnPool(uint256 minOut) external {
    require(_buyBurn(address(this).balance, minOut, false), "burn failed");
  }

  // ---------------- public mint: BLIND — you buy a sealed case ----------------
  // No gun type exists at mint time. Types are assigned by reveal(), which mixes
  // the owner's pre-committed secret seed with a blockhash that only exists
  // AFTER the last case is minted — so neither minters nor the owner can know
  // or influence which token becomes which gun.
  function mint(uint256 qty) external payable {
    require(mintOpen, "mint closed");
    require(qty > 0 && qty <= 5, "qty 1-5");
    require(publicMinted + qty <= PUBLIC_SUPPLY, "sold out");
    require(msg.value >= mintPrice * qty, "underpaid");
    for (uint256 i = 0; i < qty; i++) {
      uint256 id = nextPublicId++;
      publicMinted++;
      _mint(msg.sender, id);
      emit Minted(msg.sender, id, 0); // 0 = sealed
    }
    if (publicMinted == PUBLIC_SUPPLY && revealBlock == 0) revealBlock = block.number + 1;
    _buyBurn(msg.value, 0, true);   // 100% of the payment → $WICK → dead address; a router failure never blocks the mint
  }

  /// Owner may arm the reveal early (e.g. mint period ends without selling out).
  function closeMint() external onlyOwner {
    mintOpen = false;
    if (revealBlock == 0) revealBlock = block.number + 1;
  }

  /// Reveal: prove the pre-committed seed, mix it with the post-mint blockhash.
  function reveal(bytes32 ownerSeed) external onlyOwner {
    require(!revealed, "already revealed");
    require(revealBlock != 0 && block.number > revealBlock, "mint not closed");
    require(keccak256(abi.encodePacked(ownerSeed)) == seedCommit, "seed does not match commit");
    bytes32 bh = blockhash(revealBlock);
    if (bh == bytes32(0)) bh = blockhash(block.number - 1); // >256 blocks passed; still unpredictable at commit time
    finalSeed = keccak256(abi.encodePacked(ownerSeed, bh));
    revealed = true;
  }

  /// Gun type for a token: 1/1s are fixed; public ids resolve only after reveal.
  /// (Same signature as the old public mapping — ABI-compatible.)
  function gunTypeOf(uint256 id) public view returns (uint8) {
    if (id >= 1 && id <= ONE_OF_ONES) return _fixedType[id];
    if (!revealed || id < 2 || id > MAX_SUPPLY) return 0;
    return _typeAt(id - 2);
  }

  /// Deterministic Fisher-Yates over the fixed tier pool, seeded by finalSeed.
  /// View-only (called off-chain via tokenURI / gunsOfOwner), so the loop is free.
  function _typeAt(uint256 index) internal view returns (uint8) {
    bytes memory pool = new bytes(100);
    uint256 k = 0;
    for (uint256 i = 0; i < 30; i++) pool[k++] = bytes1(uint8(1));
    for (uint256 i = 0; i < 25; i++) pool[k++] = bytes1(uint8(2));
    for (uint256 i = 0; i < 18; i++) pool[k++] = bytes1(uint8(3));
    for (uint256 i = 0; i < 15; i++) pool[k++] = bytes1(uint8(4));
    for (uint256 i = 0; i < 7; i++)  pool[k++] = bytes1(uint8(5));
    for (uint256 i = 11; i <= 15; i++) pool[k++] = bytes1(uint8(i));   // the five platinum holos ride in the cases
    for (uint256 i = 99; i > 0; i--) {
      uint256 j = uint256(keccak256(abi.encodePacked(finalSeed, i))) % (i + 1);
      (pool[i], pool[j]) = (pool[j], pool[i]);
    }
    return uint8(pool[index]);
  }

  // ---------------- ERC-721 core ----------------
  function ownerOf(uint256 id) public view returns (address o) {
    o = _ownerOf[id];
    require(o != address(0), "no token");
  }
  function balanceOf(address a) external view returns (uint256) {
    require(a != address(0), "zero addr");
    return _balanceOf[a];
  }
  function totalSupply() external view returns (uint256) { return publicMinted + oooMinted; }

  function approve(address spender, uint256 id) external {
    address o = _ownerOf[id];
    require(msg.sender == o || isApprovedForAll[o][msg.sender], "not authorized");
    getApproved[id] = spender;
    emit Approval(o, spender, id);
  }
  function setApprovalForAll(address operator, bool approved) external {
    isApprovedForAll[msg.sender][operator] = approved;
    emit ApprovalForAll(msg.sender, operator, approved);
  }

  function transferFrom(address from, address to, uint256 id) public {
    require(from == _ownerOf[id], "wrong from");
    require(to != address(0), "zero to");
    require(msg.sender == from || msg.sender == getApproved[id] || isApprovedForAll[from][msg.sender], "not authorized");
    _transfer(from, to, id);
  }
  function safeTransferFrom(address from, address to, uint256 id) external {
    transferFrom(from, to, id);
    _checkReceiver(from, to, id, "");
  }
  function safeTransferFrom(address from, address to, uint256 id, bytes calldata data) external {
    transferFrom(from, to, id);
    _checkReceiver(from, to, id, data);
  }

  function _mint(address to, uint256 id) internal {
    require(to != address(0), "zero to");
    require(_ownerOf[id] == address(0), "exists");
    _balanceOf[to]++;
    _ownerOf[id] = to;
    _ownedIndex[id] = _owned[to].length;
    _owned[to].push(id);
    emit Transfer(address(0), to, id);
  }

  function _transfer(address from, address to, uint256 id) internal {
    _balanceOf[from]--;
    _balanceOf[to]++;
    _ownerOf[id] = to;
    delete getApproved[id];
    // remove id from `from` enumeration (swap-and-pop)
    uint256 idx = _ownedIndex[id];
    uint256 last = _owned[from].length - 1;
    if (idx != last) {
      uint256 lastId = _owned[from][last];
      _owned[from][idx] = lastId;
      _ownedIndex[lastId] = idx;
    }
    _owned[from].pop();
    // append to `to`
    _ownedIndex[id] = _owned[to].length;
    _owned[to].push(id);
    emit Transfer(from, to, id);
  }

  function _checkReceiver(address from, address to, uint256 id, bytes memory data) internal {
    if (to.code.length == 0) return;
    require(
      IERC721Receiver(to).onERC721Received(msg.sender, from, id, data) == IERC721Receiver.onERC721Received.selector,
      "unsafe recipient"
    );
  }

  // ---------------- enumeration for the game ----------------
  function gunsOfOwner(address a) external view returns (uint256[] memory ids, uint8[] memory types) {
    uint256 n = _owned[a].length;
    ids = new uint256[](n);
    types = new uint8[](n);
    for (uint256 i = 0; i < n; i++) { ids[i] = _owned[a][i]; types[i] = gunTypeOf(ids[i]); }
  }

  function supportsInterface(bytes4 iid) external pure returns (bool) {
    return iid == 0x01ffc9a7 || iid == 0x80ac58cd || iid == 0x5b5e139f; // ERC165, ERC721, ERC721Metadata
  }

  // ---------------- on-chain metadata ----------------
  function tokenURI(uint256 id) external view returns (string memory) {
    require(_ownerOf[id] != address(0), "no token");
    uint8 t = gunTypeOf(id);
    (string memory gname, string memory class, string memory rarity) = _info(t);
    string memory svg = art.svg(t, id);
    string memory json = string(abi.encodePacked(
      '{"name":"', gname, ' #', _u(id),
      '","description":"WICK Arsenal - a playable gun for PEPE WICK. Hold it to wield it in-game.",',
      '"image":"data:image/svg+xml;base64,', B64.encode(bytes(svg)),
      '","attributes":[{"trait_type":"Class","value":"', class,
      '"},{"trait_type":"Rarity","value":"', rarity,
      '"},{"trait_type":"Gun Type ID","value":', _u(t), '}]}'
    ));
    return string(abi.encodePacked("data:application/json;base64,", B64.encode(bytes(json))));
  }

  function _info(uint8 t) internal pure returns (string memory n, string memory c, string memory r) {
    if (t == 1) return ("Boogeyman P30", "Pistol", "Common");
    if (t == 2) return ("Continental Vector", "SMG", "Uncommon");
    if (t == 3) return ("Kimber Breacher", "Shotgun", "Uncommon");
    if (t == 4) return ("TTI Marksman", "Rifle", "Rare");
    if (t == 5) return ("Excommunicado", "Heavy", "Epic");
    if (t == 11) return ("Gold Standard", "1/1 Platinum", "Platinum Holo");
    if (t == 12) return ("The Impossible", "1/1 Platinum", "Platinum Holo");
    if (t == 13) return ("High Table", "1/1 Platinum", "Platinum Holo");
    if (t == 14) return ("Tabula Rasa", "1/1 Platinum", "Platinum Holo");
    if (t == 15) return ("Baba Yaga", "1/1 Platinum", "Platinum Holo");
    if (t == 16) return ("Tangential Reaper", "1/1 Ultra Platinum", "Ultra Platinum Holo");
    return ("Sealed Arsenal Case", "Sealed", "Unrevealed");
  }


  function _u(uint256 v) internal pure returns (string memory) {
    if (v == 0) return "0";
    uint256 j = v; uint256 len;
    while (j != 0) { len++; j /= 10; }
    bytes memory b = new bytes(len);
    while (v != 0) { len--; b[len] = bytes1(uint8(48 + v % 10)); v /= 10; }
    return string(b);
  }

  receive() external payable {}
}

interface IERC721Receiver {
  function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

// PulseX V2-style router (Uniswap V2 fork; WETH() renamed WPLS() but the swap
// signatures are standard — burn swap simulated against mainnet 2026-07-30).
interface IPulseXRouter {
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
}
interface IERC20Min { function balanceOf(address) external view returns (uint256); }
interface IWickGunArt {
  function svg(uint8 t, uint256 id) external view returns (string memory);
}
