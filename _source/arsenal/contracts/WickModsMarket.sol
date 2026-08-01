// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  WickModsMarket — secondary marketplace for WICK MODS attachments.

  THE DEAL: the mods were FREE to mint (gun-gated). So resales pay it forward —
  a 50% ROYALTY on every sale, and 100% of that royalty is swapped to $WICK and
  BURNED inside the sale transaction (same PulseX route as the gun mint burn).
  The market owner earns nothing; half of every flip feeds the fire.

  - Approval-based listings (NFT stays in the seller's wallet until sale).
  - OFFERS POOL: escrow PLS on a specific mod, on ANY mod of a type
    (modType > 0 — "I'll pay X for any DRAGON'S BREATH"), or on ANY mod at all.
    Escrow is tracked separately from the burn pool: a failed burn can never
    touch someone's escrowed bid.
  - acceptOffer clears any listing on the sold token (no stale listings).
  - Checks-effects-interactions + a reentrancy guard on every paying path.
*/

interface IERC721Mods {
  function ownerOf(uint256) external view returns (address);
  function transferFrom(address, address, uint256) external;
  function getApproved(uint256) external view returns (address);
  function isApprovedForAll(address, address) external view returns (bool);
  function modTypeOf(uint256) external view returns (uint8);   // for TYPE offers
}

// PulseX V2-style router (standard Uniswap V2 swap signatures)
interface IPulseXRouterM {
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
}
interface IERC20MinM { function balanceOf(address) external view returns (uint256); }

contract WickModsMarket {
  address public owner;
  IERC721Mods public immutable nft;
  uint96 public feeBps;            // royalty, 5000 = 50% — 100% of it is burned
  uint256 private _lock = 1;

  // --- burn route (identical to WickGuns / WickMarket) ---
  address public constant BURN_ADDR = 0x000000000000000000000000000000000000dEaD;
  address public immutable burnRouter;   // PulseX V2-style router
  address public immutable burnPathIn;   // WPLS
  address public immutable wickToken;
  uint256 public burnPending;            // royalties whose swap failed — burnPool() cranks them; NEVER escrow

  struct Listing { address seller; uint256 price; }
  mapping(uint256 => Listing) public listings;   // tokenId => listing

  // An offer targets ONE of three things:
  //   tokenId > 0                -> that exact mod
  //   tokenId == 0, modType > 0  -> ANY mod of that type (any DRAGON holder can fill it)
  //   tokenId == 0, modType == 0 -> ANY mod in the collection
  struct Offer { address bidder; uint256 amount; uint256 tokenId; uint8 modType; bool open; }
  Offer[] public offers;

  event Listed(uint256 indexed id, address indexed seller, uint256 price);
  event Cancelled(uint256 indexed id, address indexed seller);
  event Sold(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price);
  event FeeChanged(uint96 bps);
  event Burned(uint256 plsIn, uint256 wickBurned);
  event OfferMade(uint256 indexed offerId, address indexed bidder, uint256 indexed tokenId, uint256 amount, uint8 modType);
  event OfferCancelled(uint256 indexed offerId, address indexed bidder);
  event OfferAccepted(uint256 indexed offerId, uint256 indexed tokenId, address indexed seller, address bidder, uint256 amount);

  modifier nonReentrant() { require(_lock == 1, "reentrant"); _lock = 2; _; _lock = 1; }
  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

  constructor(address _nft, uint96 _feeBps,
              address _router, address _wpls, address _wick) {
    require(_feeBps <= 5000, "fee>50%");                 // the pledge: never MORE than half burns
    require(_router == address(0) ||
      (_router.code.length > 0 && _wick.code.length > 0 && _wpls != address(0)), "bad burn route");
    owner = msg.sender; nft = IERC721Mods(_nft); feeBps = _feeBps;
    burnRouter = _router; burnPathIn = _wpls; wickToken = _wick;
  }

  function setFee(uint96 bps) external onlyOwner { require(bps <= 5000, "fee>50%"); feeBps = bps; emit FeeChanged(bps); }
  function setOwner(address to) external onlyOwner { require(to != address(0), "zero"); owner = to; }

  // ---------------- listings ----------------
  function list(uint256 id, uint256 price) external {
    require(price > 0, "price 0");
    require(nft.ownerOf(id) == msg.sender, "not owner");
    require(nft.getApproved(id) == address(this) || nft.isApprovedForAll(msg.sender, address(this)), "approve market first");
    listings[id] = Listing(msg.sender, price);
    emit Listed(id, msg.sender, price);
  }

  function cancel(uint256 id) external {
    require(listings[id].seller == msg.sender, "not seller");
    delete listings[id];
    emit Cancelled(id, msg.sender);
  }

  function buy(uint256 id) external payable nonReentrant {
    Listing memory l = listings[id];
    require(l.price > 0, "not listed");
    require(msg.value >= l.price, "underpaid");
    require(nft.ownerOf(id) == l.seller, "stale listing");
    delete listings[id];                                   // effects before interactions
    uint256 fee = l.price * feeBps / 10000;
    nft.transferFrom(l.seller, msg.sender, id);
    (bool s1, ) = payable(l.seller).call{value: l.price - fee}(""); require(s1, "pay seller");
    if (fee > 0) _royaltyBurn(fee);
    if (msg.value > l.price) { (bool s3, ) = payable(msg.sender).call{value: msg.value - l.price}(""); require(s3, "refund"); }
    emit Sold(id, l.seller, msg.sender, l.price);
  }

  function getListing(uint256 id) external view returns (address seller, uint256 price) {
    Listing memory l = listings[id]; return (l.seller, l.price);
  }

  // ---------------- offers pool ----------------
  /// Escrow an offer.
  ///   makeOffer(id, 0)   -> that exact mod
  ///   makeOffer(0, type) -> ANY mod of that type; any holder of one can fill it
  ///   makeOffer(0, 0)    -> ANY mod in the collection
  function makeOffer(uint256 tokenId, uint8 modType) external payable returns (uint256 id) {
    require(msg.value > 0, "no value");
    require(tokenId == 0 || modType == 0, "target a token OR a type, not both");
    offers.push(Offer(msg.sender, msg.value, tokenId, modType, true));
    id = offers.length - 1;
    emit OfferMade(id, msg.sender, tokenId, msg.value, modType);
  }

  function cancelOffer(uint256 id) external nonReentrant {
    Offer storage o = offers[id];
    require(o.open, "closed");
    require(o.bidder == msg.sender, "not bidder");
    o.open = false;
    (bool s, ) = payable(msg.sender).call{value: o.amount}(""); require(s, "refund");
    emit OfferCancelled(id, msg.sender);
  }

  /// A holder sells into an open offer. Same 50% burn-royalty as a listing sale.
  function acceptOffer(uint256 id, uint256 tokenId) external nonReentrant {
    Offer storage o = offers[id];
    require(o.open, "closed");
    require(o.tokenId == 0 || o.tokenId == tokenId, "wrong token");
    if (o.modType != 0) require(nft.modTypeOf(tokenId) == o.modType, "wrong mod type");
    require(nft.ownerOf(tokenId) == msg.sender, "not owner");
    require(nft.getApproved(tokenId) == address(this) || nft.isApprovedForAll(msg.sender, address(this)), "approve market first");
    o.open = false;
    delete listings[tokenId];                              // a sale kills any stale listing
    uint256 fee = o.amount * feeBps / 10000;
    nft.transferFrom(msg.sender, o.bidder, tokenId);
    (bool s1, ) = payable(msg.sender).call{value: o.amount - fee}(""); require(s1, "pay seller");
    if (fee > 0) _royaltyBurn(fee);
    emit OfferAccepted(id, tokenId, msg.sender, o.bidder, o.amount);
  }

  function offersCount() external view returns (uint256) { return offers.length; }
  function getOffer(uint256 id) external view returns (address bidder, uint256 amount, uint256 tokenId, uint8 modType, bool open) {
    Offer memory o = offers[id]; return (o.bidder, o.amount, o.tokenId, o.modType, o.open);
  }

  // ---------------- royalty burn ----------------
  function _swapBurn(uint256 amount, uint256 minOut) internal returns (bool) {
    if (burnRouter == address(0) || amount == 0) return false;
    address[] memory path = new address[](2);
    path[0] = burnPathIn; path[1] = wickToken;
    uint256 had = IERC20MinM(wickToken).balanceOf(BURN_ADDR);
    try IPulseXRouterM(burnRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
      minOut, path, BURN_ADDR, block.timestamp) {
      emit Burned(amount, IERC20MinM(wickToken).balanceOf(BURN_ADDR) - had);
      return true;
    } catch { return false; }
  }

  function _royaltyBurn(uint256 amount) internal {
    if (!_swapBurn(amount, 0)) burnPending += amount;       // never blocks a sale; pool it for the crank
  }

  /// Anyone converts pooled royalties into a burn. Reverts restore burnPending.
  /// Escrowed offers are untouchable: only burnPending ever enters the swap.
  function burnPool(uint256 minOut) external nonReentrant {
    uint256 amt = burnPending;
    require(amt > 0, "nothing pending");
    burnPending = 0;
    require(_swapBurn(amt, minOut), "burn failed");
  }
}
