// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  WickDuel — wager escrow for head-to-head WICK SHOOTER duels (PulseChain).

  Two players stake the same amount of $WICK. They play the same seeded run.
  A referee (the duel server) signs who won; the winner takes the pot minus a
  5% house fee that goes straight to the treasury in the same transaction.

  TRUST MODEL — the referee decides the WINNER, never the MONEY:
    · The referee can only name one of the two players (or a draw). It cannot
      pay itself, a third party, or take more than feeBps.
    · If the referee never signs (server down), EITHER player calls expire()
      after settleWindow and both stakes come home. Nothing can be locked.
    · The creator can cancel an unjoined match at any time and get the stake back.
    · The owner never holds player funds: stakes sit in this contract and the
      only outflows are winner / refund / fee. There is no sweep for $WICK.

  MIN BET is denominated in USD (default $20) and priced ON-CHAIN from PulseX
  reserves (WICK/WPLS × WPLS/DAI). Spot reserves are manipulable, but the only
  thing manipulation buys here is betting slightly LESS than $20 — the floor is
  a UX rule, not a security boundary. If pricing pairs are unset the owner's
  minWickFallback applies. Stakes are measured by BALANCE DELTA so a
  fee-on-transfer token can never leave the pot short.
*/

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

interface IPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

contract WickDuel {
    enum Status { NONE, OPEN, ACTIVE, SETTLED, CANCELLED, EXPIRED }

    /// Loadout rules both players agree to by staking:
    ///   0 = HOUSE IRON — same stock loadout for both, NFT guns off (pure skill)
    ///   1 = BRING YOUR OWN — each may carry up to 2 of their own WICK ARSENAL guns
    uint8 public constant RULES_HOUSE = 0;
    uint8 public constant RULES_BYO = 1;

    struct Match {
        address creator;
        address joiner;       // zero until joined
        address opponent;     // zero = anyone may join; else only this address
        uint128 stake;        // creator's credited stake (balance delta)
        uint128 stakeJoin;    // joiner's credited stake (>= stake)
        uint64  createdAt;
        uint64  joinedAt;
        Status  status;
        uint8   rules;        // RULES_HOUSE | RULES_BYO — fixed at create, matched by the matchmaker
        address winner;       // zero on draw / refund
        uint128 payout;       // what the winner received (or 0)
        uint128 fee;          // what the house received (or 0)
    }

    IERC20  public immutable wick;
    address public owner;
    address public treasury;
    address public referee;

    uint16  public feeBps = 500;                 // 5% — hard-capped at 10%
    uint256 public minUsd = 20e18;               // $20, 18-dec USD (DAI)
    uint256 public minWickFallback;              // used when pricing pairs are unset
    uint64  public settleWindow = 48 hours;      // after join: expire() refunds both if unsettled
    bool    public paused;                       // blocks create/join ONLY — exits always work

    // pricing: WICK/WPLS pair + WPLS/USD pair
    IPair   public wickPair;
    IPair   public usdPair;
    address public wpls;

    uint256 public nextId = 1;
    mapping(uint256 => Match) public matches;

    uint256 private _lock = 1;

    event MatchCreated(uint256 indexed id, address indexed creator, address indexed opponent, uint256 stake, uint8 rules);
    event MatchJoined(uint256 indexed id, address indexed joiner, uint256 stake);
    event MatchSettled(uint256 indexed id, address indexed winner, uint256 payout, uint256 fee);
    event MatchDrawn(uint256 indexed id);
    event MatchCancelled(uint256 indexed id);
    event MatchExpired(uint256 indexed id);
    event RefereeSet(address referee);
    event TreasurySet(address treasury);
    event FeeSet(uint16 bps);
    event MinUsdSet(uint256 minUsd);
    event MinWickFallbackSet(uint256 amount);
    event PricingSet(address wickPair, address usdPair, address wpls);
    event SettleWindowSet(uint64 seconds_);
    event Paused(bool on);
    event OwnershipTransferred(address indexed from, address indexed to);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier nonReentrant() { require(_lock == 1, "reentrant"); _lock = 2; _; _lock = 1; }

    constructor(address wick_, address treasury_, address referee_, uint256 minWickFallback_) {
        require(wick_ != address(0) && treasury_ != address(0) && referee_ != address(0), "zero addr");
        wick = IERC20(wick_);
        owner = msg.sender;
        treasury = treasury_;
        referee = referee_;
        minWickFallback = minWickFallback_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasurySet(treasury_);
        emit RefereeSet(referee_);
    }

    // ------------------------------------------------------------ pricing
    function _reserves(IPair p, address base) internal view returns (uint256 rBase, uint256 rQuote) {
        (uint112 r0, uint112 r1,) = p.getReserves();
        if (p.token0() == base) return (r0, r1);
        require(p.token1() == base, "pair/base");
        return (r1, r0);
    }

    /// USD (18-dec) value of `amount` WICK via PulseX reserves; 0 if pricing unset.
    function usdValue(uint256 amount) public view returns (uint256) {
        if (address(wickPair) == address(0) || address(usdPair) == address(0)) return 0;
        (uint256 rW, uint256 rP) = _reserves(wickPair, address(wick));   // WICK / WPLS
        (uint256 rP2, uint256 rU) = _reserves(usdPair, wpls);            // WPLS / USD
        if (rW == 0 || rP2 == 0) return 0;
        uint256 pls = amount * rP / rW;
        return pls * rU / rP2;
    }

    /// Minimum stake in WICK right now: $minUsd at spot, or the fallback if unpriced.
    function minStake() public view returns (uint256) {
        if (address(wickPair) == address(0) || address(usdPair) == address(0)) return minWickFallback;
        (uint256 rW, uint256 rP) = _reserves(wickPair, address(wick));
        (uint256 rP2, uint256 rU) = _reserves(usdPair, wpls);
        if (rP == 0 || rU == 0) return minWickFallback;
        uint256 pls = minUsd * rP2 / rU;          // PLS worth $minUsd
        uint256 w = pls * rW / rP;                // WICK worth that many PLS
        return w == 0 ? minWickFallback : w;
    }

    // ------------------------------------------------------------ core
    function _pull(address from, uint256 amount) internal returns (uint128 credited) {
        uint256 before = wick.balanceOf(address(this));
        require(wick.transferFrom(from, address(this), amount), "transferFrom");
        uint256 delta = wick.balanceOf(address(this)) - before;
        require(delta > 0 && delta <= type(uint128).max, "delta");
        return uint128(delta);
    }

    /// Open a duel. `opponent` = zero to let anyone accept, or a specific wallet.
    /// `rules` = RULES_HOUSE (same stock loadout) or RULES_BYO (own NFT guns, max 2).
    function create(uint256 amount, address opponent, uint8 rules) external nonReentrant returns (uint256 id) {
        require(!paused, "paused");
        require(opponent != msg.sender, "self");
        require(rules <= RULES_BYO, "rules");
        uint128 credited = _pull(msg.sender, amount);
        require(credited >= minStake(), "below min stake");
        id = nextId++;
        Match storage m = matches[id];
        m.creator = msg.sender;
        m.opponent = opponent;
        m.stake = credited;
        m.createdAt = uint64(block.timestamp);
        m.status = Status.OPEN;
        m.rules = rules;
        emit MatchCreated(id, msg.sender, opponent, credited, rules);
    }

    /// Accept an open duel by matching the stake. `amount` must credit >= stake
    /// (pass a little extra for fee-on-transfer tokens; the excess joins the pot).
    function join(uint256 id, uint256 amount) external nonReentrant {
        require(!paused, "paused");
        Match storage m = matches[id];
        require(m.status == Status.OPEN, "not open");
        require(msg.sender != m.creator, "own match");
        require(m.opponent == address(0) || m.opponent == msg.sender, "private");
        uint128 credited = _pull(msg.sender, amount);
        require(credited >= m.stake, "short stake");
        m.joiner = msg.sender;
        m.stakeJoin = credited;
        m.joinedAt = uint64(block.timestamp);
        m.status = Status.ACTIVE;
        emit MatchJoined(id, msg.sender, credited);
    }

    /// The message the referee signs. Domain-separated by chain + contract + id.
    function settleDigest(uint256 id, address winner) public view returns (bytes32) {
        return keccak256(abi.encodePacked("WICKDUEL", block.chainid, address(this), id, winner));
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "sig len");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "sig v");
        // reject high-s (malleable) signatures
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "sig s");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        address a = ecrecover(ethHash, v, r, s);
        require(a != address(0), "sig");
        return a;
    }

    /// Settle with the referee's signature. `winner` must be a participant, or
    /// zero for a draw (both refunded, no fee). Anyone may submit the signature.
    function settle(uint256 id, address winner, bytes calldata sig) external nonReentrant {
        Match storage m = matches[id];
        require(m.status == Status.ACTIVE, "not active");
        require(winner == address(0) || winner == m.creator || winner == m.joiner, "bad winner");
        require(_recover(settleDigest(id, winner), sig) == referee, "not referee");
        m.status = Status.SETTLED;
        m.winner = winner;
        if (winner == address(0)) {
            emit MatchDrawn(id);
            require(wick.transfer(m.creator, m.stake), "refund c");
            require(wick.transfer(m.joiner, m.stakeJoin), "refund j");
            return;
        }
        uint256 pot = uint256(m.stake) + uint256(m.stakeJoin);
        uint256 fee = pot * feeBps / 10_000;
        uint256 payout = pot - fee;
        m.payout = uint128(payout);
        m.fee = uint128(fee);
        emit MatchSettled(id, winner, payout, fee);
        if (fee > 0) require(wick.transfer(treasury, fee), "fee");
        require(wick.transfer(winner, payout), "payout");
    }

    /// Creator takes an unjoined match down. Always allowed while OPEN.
    function cancel(uint256 id) external nonReentrant {
        Match storage m = matches[id];
        require(m.status == Status.OPEN, "not open");
        require(msg.sender == m.creator, "not creator");
        m.status = Status.CANCELLED;
        emit MatchCancelled(id);
        require(wick.transfer(m.creator, m.stake), "refund");
    }

    /// Escape hatch: no settlement within settleWindow → both stakes come home.
    /// Callable by anyone, so a stuck opponent can't hold the other hostage.
    function expire(uint256 id) external nonReentrant {
        Match storage m = matches[id];
        require(m.status == Status.ACTIVE, "not active");
        require(block.timestamp > uint256(m.joinedAt) + settleWindow, "too early");
        m.status = Status.EXPIRED;
        emit MatchExpired(id);
        require(wick.transfer(m.creator, m.stake), "refund c");
        require(wick.transfer(m.joiner, m.stakeJoin), "refund j");
    }

    // ------------------------------------------------------------ views
    function getMatch(uint256 id) external view returns (Match memory) { return matches[id]; }

    /// Ids of OPEN matches, scanning downward from `fromId` (0 = newest), up to `count`.
    function openMatches(uint256 fromId, uint256 count) external view returns (uint256[] memory ids) {
        uint256 start = fromId == 0 || fromId >= nextId ? nextId - 1 : fromId;
        uint256[] memory tmp = new uint256[](count);
        uint256 n;
        for (uint256 i = start; i >= 1 && n < count; i--) {
            if (matches[i].status == Status.OPEN) tmp[n++] = i;
            if (i == 1) break;
        }
        ids = new uint256[](n);
        for (uint256 k = 0; k < n; k++) ids[k] = tmp[k];
    }

    /// MATCHMAKER: open PUBLIC duels with `rules` whose stake lies in [minStake_, maxStake_],
    /// excluding ones created by `me`, OLDEST FIRST (so quick-match pairs whoever waited longest).
    /// Scans up to `scan` recent ids; returns at most `count`.
    function findMatches(uint8 rules, uint256 minStake_, uint256 maxStake_, address me, uint256 scan, uint256 count)
        external view returns (uint256[] memory ids)
    {
        uint256[] memory tmp = new uint256[](count);
        uint256 n;
        uint256 top = nextId - 1;
        uint256 bottom = top > scan ? top - scan + 1 : 1;
        for (uint256 i = bottom; i <= top && n < count; i++) {   // ascending = oldest first
            Match storage m = matches[i];
            if (m.status != Status.OPEN || m.rules != rules || m.opponent != address(0) || m.creator == me) continue;
            if (m.stake < minStake_ || m.stake > maxStake_) continue;
            tmp[n++] = i;
        }
        ids = new uint256[](n);
        for (uint256 k = 0; k < n; k++) ids[k] = tmp[k];
    }

    // ------------------------------------------------------------ admin
    function setReferee(address r) external onlyOwner { require(r != address(0), "zero"); referee = r; emit RefereeSet(r); }
    function setTreasury(address t) external onlyOwner { require(t != address(0), "zero"); treasury = t; emit TreasurySet(t); }
    function setFee(uint16 bps) external onlyOwner { require(bps <= 1000, "max 10%"); feeBps = bps; emit FeeSet(bps); }
    function setMinUsd(uint256 usd) external onlyOwner { minUsd = usd; emit MinUsdSet(usd); }
    function setMinWickFallback(uint256 amount) external onlyOwner { minWickFallback = amount; emit MinWickFallbackSet(amount); }
    function setPricing(address wickPair_, address usdPair_, address wpls_) external onlyOwner {
        // zero clears pricing (fallback applies); otherwise sanity-check the pairs contain what we think
        if (wickPair_ != address(0)) {
            require(usdPair_ != address(0) && wpls_ != address(0), "pricing set");
            IPair wp = IPair(wickPair_); IPair up = IPair(usdPair_);
            require(wp.token0() == address(wick) || wp.token1() == address(wick), "wickPair");
            require(wp.token0() == wpls_ || wp.token1() == wpls_, "wickPair/wpls");
            require(up.token0() == wpls_ || up.token1() == wpls_, "usdPair/wpls");
        }
        wickPair = IPair(wickPair_); usdPair = IPair(usdPair_); wpls = wpls_;
        emit PricingSet(wickPair_, usdPair_, wpls_);
    }
    function setSettleWindow(uint64 s) external onlyOwner { require(s >= 6 hours && s <= 30 days, "window"); settleWindow = s; emit SettleWindowSet(s); }
    function setPaused(bool on) external onlyOwner { paused = on; emit Paused(on); }
    function transferOwnership(address to) external onlyOwner { require(to != address(0), "zero"); emit OwnershipTransferred(owner, to); owner = to; }
}
