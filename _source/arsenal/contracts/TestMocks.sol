// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// TEST-ONLY mocks for the automatic buy&burn route (PulseX V2-router shape).
// Never deployed to mainnet.

contract MockWICK {
  string public constant name = "MockWICK";
  string public constant symbol = "mWICK";
  uint8 public constant decimals = 18;
  mapping(address => uint256) public balanceOf;
  function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
  function transfer(address to, uint256 amt) external returns (bool) {
    balanceOf[msg.sender] -= amt; balanceOf[to] += amt; return true;
  }
}

contract MockRouter {
  MockWICK public immutable wick;
  constructor(address w) { wick = MockWICK(w); }
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 amountOutMin, address[] calldata, address to, uint256) external payable {
    uint256 out = msg.value * 1000;                 // fixed rate: 1 PLS -> 1000 mWICK
    require(out >= amountOutMin, "slippage");
    wick.mint(to, out);
  }
}

contract MockRouterRevert {
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256, address[] calldata, address, uint256) external payable {
    revert("router down");
  }
}

// minimal stand-in for WickGuns in the WickMods tests: hand out gun ids and
// move them between wallets so the per-gun allowance can be attacked properly
contract MockGuns {
  mapping(uint256 => address) public ownerOf;
  mapping(address => uint256[]) private _owned;
  mapping(uint256 => uint256) private _idx;
  function give(address to, uint256 id) external {
    require(ownerOf[id] == address(0), "exists");
    ownerOf[id] = to; _idx[id] = _owned[to].length; _owned[to].push(id);
  }
  function move(address from, address to, uint256 id) external {
    require(ownerOf[id] == from, "wrong from");
    uint256[] storage arr = _owned[from];
    uint256 i = _idx[id]; uint256 last = arr[arr.length - 1];
    arr[i] = last; _idx[last] = i; arr.pop();
    ownerOf[id] = to; _idx[id] = _owned[to].length; _owned[to].push(id);
  }
  function balanceOf(address a) external view returns (uint256) { return _owned[a].length; }
  function gunsOfOwner(address a) external view returns (uint256[] memory ids, uint8[] memory types) {
    ids = _owned[a]; types = new uint8[](ids.length);
  }
}
