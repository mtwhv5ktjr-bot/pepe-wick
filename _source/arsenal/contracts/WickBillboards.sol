// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  WICK BILLBOARDS — self-serve in-game advertising for PEPE WICK (PulseChain).

  - Anyone buys a billboard DAY (UTC) straight from the contract:
      REGULAR   1,000,000 PLS / day — joins the in-game billboard rotation (max 8/day)
      EXCLUSIVE 10,000,000 PLS / day — THE ONLY billboard in the game that day
  - Exclusive is only sellable while the day is EMPTY (nobody's paid rotation spot
    gets erased), and once an exclusive exists the day is closed to regulars.
  - Revenue split IN THE PURCHASE TX: half is swapped to $WICK and burned via
    PulseX (burnPending + public crank as fallback, same as every WICK contract),
    the other half goes straight to the treasury. Split fixed at deploy.
  - Content is short text (name/tagline/url) + a color. The game renders it in the
    house billboard style. Owner can BAN abusive content (no refund) — moderation
    is a stated condition of purchase.
*/

interface IPulseXRouterB {
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
}
interface IERC20MinB { function balanceOf(address) external view returns (uint256); }

contract WickBillboards {
  address public owner;
  address public treasury;
  uint256 public constant PRICE_DAY = 1_000_000 ether;      // regular rotation slot
  uint256 public constant PRICE_EXCLUSIVE = 10_000_000 ether; // sole billboard + prime feature
  uint256 public constant MAX_PER_DAY = 8;
  uint96 public immutable burnBps;                          // e.g. 5000 = half of every sale burns $WICK

  address public constant BURN_ADDR = 0x000000000000000000000000000000000000dEaD;
  address public immutable burnRouter;
  address public immutable burnPathIn;   // WPLS
  address public immutable wickToken;
  uint256 public burnPending;

  struct Ad {
    address buyer;
    uint32 day;           // unix day (block.timestamp / 1 days)
    bool exclusive;
    bool banned;
    uint24 color;         // 0xRRGGBB accent
    string name;          // <=20 chars — the big line
    string tag;           // <=28 chars — the small line
    string url;           // <=32 chars — the clickable link line
    // 16x16 one-bit logo, row-major, bit 255 = top-left. Deliberately ON-CHAIN
    // and immutable: an off-chain image URL could be swapped to anything after
    // the ad is approved, and would drag CORS + arbitrary remote loads into the
    // game. 256 bits costs one slot and can never bait-and-switch. 0 = no logo,
    // and the house Pepe stands in that space instead.
    uint256 logo;
  }
  Ad[] public ads;                                  // id = index
  mapping(uint32 => uint256[]) private _dayAds;     // day -> ad ids
  mapping(uint32 => uint256) public exclusiveOf;    // day -> adId+1 (0 = none)

  event Purchased(uint256 indexed id, uint32 indexed day, address indexed buyer, bool exclusive, uint256 paid);
  event Banned(uint256 indexed id, bool banned);
  event Burned(uint256 plsIn, uint256 wickBurned);

  uint256 private _lock = 1;
  modifier nonReentrant(){ require(_lock==1,"reentrant"); _lock=2; _; _lock=1; }
  modifier onlyOwner(){ require(msg.sender==owner,"not owner"); _; }

  constructor(address _treasury, uint96 _burnBps, address _router, address _wpls, address _wick){
    require(_treasury != address(0), "zero treasury");
    require(_burnBps <= 10000, "bps");
    require(_router == address(0) ||
      (_router.code.length > 0 && _wick.code.length > 0 && _wpls != address(0)), "bad burn route");
    owner = msg.sender; treasury = _treasury; burnBps = _burnBps;
    burnRouter = _router; burnPathIn = _wpls; wickToken = _wick;
  }

  function setOwner(address to) external onlyOwner { require(to!=address(0),"zero"); owner=to; }
  function setTreasury(address to) external onlyOwner { require(to!=address(0),"zero"); treasury=to; }
  function setBanned(uint256 id, bool v) external onlyOwner { ads[id].banned=v; emit Banned(id,v); }

  function todayId() public view returns (uint32) { return uint32(block.timestamp / 1 days); }

  function buy(uint32 day, bool exclusive, string calldata name_, string calldata tag_, string calldata url_, uint24 color, uint256 logo)
    external payable nonReentrant returns (uint256 id)
  {
    require(day >= todayId(), "day already over");
    require(day <= todayId() + 60, "max 60 days ahead");
    require(bytes(name_).length >= 1 && bytes(name_).length <= 20, "name 1-20 chars");
    require(bytes(tag_).length <= 28, "tag <=28 chars");
    require(bytes(url_).length <= 32, "url <=32 chars");
    require(exclusiveOf[day] == 0, "day is exclusively taken");
    if (exclusive) {
      require(_dayAds[day].length == 0, "day already has rotation ads");
      require(msg.value == PRICE_EXCLUSIVE, "exclusive costs 10,000,000 PLS");
    } else {
      require(_dayAds[day].length < MAX_PER_DAY, "day sold out");
      require(msg.value == PRICE_DAY, "a day costs 1,000,000 PLS");
    }
    id = ads.length;
    ads.push(Ad(msg.sender, day, exclusive, false, color, name_, tag_, url_, logo));
    _dayAds[day].push(id);
    if (exclusive) exclusiveOf[day] = id + 1;
    // split in-tx: burn half, treasury half — nothing pools here except failed burns
    uint256 toBurn = msg.value * burnBps / 10000;
    if (toBurn > 0) _royaltyBurn(toBurn);
    uint256 toTreasury = msg.value - toBurn;
    if (toTreasury > 0) { (bool s,) = payable(treasury).call{value: toTreasury}(""); require(s, "treasury pay failed"); }
    emit Purchased(id, day, msg.sender, exclusive, msg.value);
  }

  /// everything the renderers need for one day, in one call
  function adsOf(uint32 day) external view returns (
    address[] memory buyers, bool[] memory exclusives, bool[] memory banneds,
    uint24[] memory colors, string[] memory names, string[] memory tags, string[] memory urls,
    uint256[] memory logos)
  {
    uint256[] storage list = _dayAds[day];
    uint256 n = list.length;
    buyers=new address[](n); exclusives=new bool[](n); banneds=new bool[](n);
    colors=new uint24[](n); names=new string[](n); tags=new string[](n); urls=new string[](n);
    logos=new uint256[](n);
    for (uint256 i=0;i<n;i++){ Ad storage a=ads[list[i]];
      buyers[i]=a.buyer; exclusives[i]=a.exclusive; banneds[i]=a.banned;
      colors[i]=a.color; names[i]=a.name; tags[i]=a.tag; urls[i]=a.url; logos[i]=a.logo; }
  }
  function daySlots(uint32 day) external view returns (uint256 taken, bool exclusiveTaken) {
    return (_dayAds[day].length, exclusiveOf[day] != 0);
  }
  function adsCount() external view returns (uint256) { return ads.length; }

  // ---- burn plumbing (identical shape to the markets) ----
  function _swapBurn(uint256 amount, uint256 minOut) internal returns (bool) {
    if (burnRouter == address(0) || amount == 0) return false;
    address[] memory path = new address[](2);
    path[0]=burnPathIn; path[1]=wickToken;
    uint256 had = IERC20MinB(wickToken).balanceOf(BURN_ADDR);
    try IPulseXRouterB(burnRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
      minOut, path, BURN_ADDR, block.timestamp) {
      emit Burned(amount, IERC20MinB(wickToken).balanceOf(BURN_ADDR) - had);
      return true;
    } catch { return false; }
  }
  function _royaltyBurn(uint256 amount) internal { if (!_swapBurn(amount, 0)) burnPending += amount; }
  function burnPool(uint256 minOut) external nonReentrant {
    uint256 amt = burnPending; require(amt > 0, "nothing pending");
    burnPending = 0; require(_swapBurn(amt, minOut), "burn failed");
  }
}
