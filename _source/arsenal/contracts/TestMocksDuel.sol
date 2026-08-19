// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test-only mocks for WickDuel. Never deployed.

/// Plain ERC20 (approve/transferFrom) — MockWICK in TestMocks.sol has no allowance path.
contract MockERC20 {
    string public name = "WICK"; string public symbol = "WICK"; uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
    function approve(address s, uint256 amt) external returns (bool) { allowance[msg.sender][s] = amt; return true; }
    function transfer(address t, uint256 amt) external returns (bool) { require(balanceOf[msg.sender] >= amt, "bal"); balanceOf[msg.sender] -= amt; balanceOf[t] += amt; return true; }
    function transferFrom(address f, address t, uint256 amt) external returns (bool) {
        require(allowance[f][msg.sender] >= amt, "allow"); require(balanceOf[f] >= amt, "bal");
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= amt;
        balanceOf[f] -= amt; balanceOf[t] += amt; return true;
    }
}

/// PulseX-shaped pair with settable reserves.
contract MockPair {
    address public token0;
    address public token1;
    uint112 public r0;
    uint112 public r1;
    constructor(address t0, address t1, uint112 a, uint112 b) { token0 = t0; token1 = t1; r0 = a; r1 = b; }
    function set(uint112 a, uint112 b) external { r0 = a; r1 = b; }
    function getReserves() external view returns (uint112, uint112, uint32) { return (r0, r1, uint32(block.timestamp)); }
}

/// ERC20 that burns 1% on every transfer — proves the escrow credits by delta.
contract MockFoT {
    string public name = "FoT"; string public symbol = "FOT"; uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
    function approve(address s, uint256 amt) external returns (bool) { allowance[msg.sender][s] = amt; return true; }
    function _move(address f, address t, uint256 amt) internal {
        require(balanceOf[f] >= amt, "bal");
        uint256 burn = amt / 100;
        balanceOf[f] -= amt; balanceOf[t] += amt - burn;
    }
    function transfer(address t, uint256 amt) external returns (bool) { _move(msg.sender, t, amt); return true; }
    function transferFrom(address f, address t, uint256 amt) external returns (bool) {
        require(allowance[f][msg.sender] >= amt, "allow"); allowance[f][msg.sender] -= amt; _move(f, t, amt); return true;
    }
}

/// Wallet contract that re-enters settle/cancel from its token receive hook path —
/// MockWICK doesn't call hooks, so this attacks through a malicious token instead.
contract MockReenterToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public target; bytes public payload; bool public armed;
    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
    function approve(address s, uint256 amt) external returns (bool) { allowance[msg.sender][s] = amt; return true; }
    function arm(address t, bytes calldata p) external { target = t; payload = p; armed = true; }
    function transferFrom(address f, address t, uint256 amt) external returns (bool) {
        require(allowance[f][msg.sender] >= amt && balanceOf[f] >= amt, "x");
        allowance[f][msg.sender] -= amt; balanceOf[f] -= amt; balanceOf[t] += amt; return true;
    }
    function transfer(address t, uint256 amt) external returns (bool) {
        require(balanceOf[msg.sender] >= amt, "bal");
        balanceOf[msg.sender] -= amt; balanceOf[t] += amt;
        if (armed) { armed = false; (bool ok,) = target.call(payload); require(ok, "reenter blocked"); }
        return true;
    }
}
