// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  WickGunArt - the on-chain SVG renderer for WICK Arsenal.
  Renders each gun as a premium 400x560 holographic trading card
  (framed art window, stat bars, rarity stamp, serial). The 1/1s get
  animated rainbow foil, a light sweep and sparkles. Art is shared 1:1
  with the site's gunart.js; gun drawings live in WickGunBodies
  (both split out purely for the 24KB contract size limit).
*/

interface IWickGunBodies {
  function body(uint8 t) external pure returns (string memory);
  function ov(uint8 t) external pure returns (string memory);
}

contract WickGunArt {
  IWickGunBodies public immutable B;

  constructor(address bodies) { B = IWickGunBodies(bodies); }

  string private constant SPARKS ="<g opacity='0'><path d='M70 103 L72.1 107.9 L77 110 L72.1 112.1 L70 117 L67.9 112.1 L63 110 L67.9 107.9 Z' fill='#fff'/><animate attributeName='opacity' values='0;1;0' dur='2.4s' begin='0s' repeatCount='indefinite'/></g><g opacity='0'><path d='M330 91 L331.5 94.5 L335 96 L331.5 97.5 L330 101 L328.5 97.5 L325 96 L328.5 94.5 Z' fill='#fff'/><animate attributeName='opacity' values='0;1;0' dur='2.4s' begin='.6s' repeatCount='indefinite'/></g><g opacity='0'><path d='M350 264 L351.8 268.2 L356 270 L351.8 271.8 L350 276 L348.2 271.8 L344 270 L348.2 268.2 Z' fill='#fff'/><animate attributeName='opacity' values='0;1;0' dur='2.4s' begin='1.2s' repeatCount='indefinite'/></g><g opacity='0'><path d='M58 257 L59.5 260.5 L63 262 L59.5 263.5 L58 267 L56.5 263.5 L53 262 L56.5 260.5 Z' fill='#fff'/><animate attributeName='opacity' values='0;1;0' dur='2.4s' begin='1.8s' repeatCount='indefinite'/></g>";
  string private constant TICKS = "M105.8 0 v9 m29.8 -9 v9 m29.8 -9 v9 m29.8 -9 v9 m29.8 -9 v9 m29.8 -9 v9 m29.8 -9 v9 m29.8 -9 v9 m29.8 -9 v9";

  // body-top, body-bottom, accent
  function _pal(uint8 t) internal pure returns (string memory, string memory, string memory) {
    if (t == 1) return ("#566172", "#1c2129", "#cfd6e0");
    if (t == 2) return ("#4e6656", "#18211b", "#7cf9a5");
    if (t == 3) return ("#665a4a", "#211b13", "#ff9d3d");
    if (t == 4) return ("#4e6070", "#17202a", "#7fd0ff");
    if (t == 5) return ("#5c4e72", "#1d1727", "#b26bff");
    if (t == 11) return ("#f2d27a", "#6e5312", "#ffd23f");
    if (t == 12) return ("#6b93a6", "#16303c", "#8bd6ff");
    if (t == 13) return ("#caa96b", "#4a3a16", "#e8d9a8");
    if (t == 14) return ("#f4f7fb", "#97a3b2", "#c8ffe0");
    if (t == 16) return ("#35d97a", "#0b3a1e", "#7cf9a5");
    return ("#454c58", "#0e1116", "#ff5c5c");
  }
  function _uname(uint8 t) internal pure returns (string memory) {
    if (t == 1) return "BOOGEYMAN P30";
    if (t == 2) return "CONTINENTAL VECTOR";
    if (t == 3) return "KIMBER BREACHER";
    if (t == 4) return "TTI MARKSMAN";
    if (t == 5) return "EXCOMMUNICADO";
    if (t == 11) return "GOLD STANDARD";
    if (t == 12) return "THE IMPOSSIBLE";
    if (t == 13) return "HIGH TABLE";
    if (t == 14) return "TABULA RASA";
    if (t == 15) return "BABA YAGA";
    return "TANGENTIAL REAPER";
  }
  function _perk(uint8 t) internal pure returns (string memory) {
    if (t == 1) return "Balanced all-rounder";
    if (t == 2) return "+15% run speed while equipped";
    if (t == 3) return "Massive knockback (SPLAT combos)";
    if (t == 4) return "Pierce + reveals weak spots";
    if (t == 5) return "Explosive rounds, staggers armor";
    if (t == 11) return "2x coins, executions heal";
    if (t == 12) return "Ricochets between lanes";
    if (t == 13) return "Toggle single / 3-round burst";
    if (t == 14) return "Perfect reload = overcharge";
    if (t == 15) return "Hand-cannon: huge dmg, 3-round mag";
    return "Forged for tangent.pls - tri-arc: 3 rounds, every direction";
  }
  function _chip(uint8 t) internal pure returns (string memory) {
    if (t >= 11) return "1 OF 1";
    if (t == 2) return "SMG";
    if (t == 3) return "SHOTGUN";
    if (t == 4) return "RIFLE";
    if (t == 5) return "HEAVY";
    return "PISTOL";
  }
  function _rar(uint8 t) internal pure returns (string memory) {
    if (t == 16) return "ULTRA PLATINUM HOLO";
    if (t >= 11) return "PLATINUM HOLO";
    if (t == 5) return "EPIC";
    if (t == 4) return "RARE";
    if (t == 1) return "COMMON";
    return "UNCOMMON";
  }
  function _stats(uint8 t) internal pure returns (uint8, uint8, uint8) {
    if (t == 1) return (6, 8, 7);
    if (t == 2) return (4, 10, 10);
    if (t == 3) return (9, 4, 3);
    if (t == 4) return (7, 7, 6);
    if (t == 5) return (10, 3, 3);
    if (t == 11) return (6, 7, 7);
    if (t == 12) return (5, 6, 7);
    if (t == 13) return (6, 8, 7);
    if (t == 14) return (7, 7, 6);
    if (t == 15) return (10, 2, 4);
    return (10, 9, 8);
  }

  function _u(uint256 v) internal pure returns (string memory) {
    if (v == 0) return "0";
    uint256 j = v; uint256 len;
    while (j != 0) { len++; j /= 10; }
    bytes memory b = new bytes(len);
    while (v != 0) { len--; b[len] = bytes1(uint8(48 + v % 10)); v /= 10; }
    return string(b);
  }
  function _pad3(uint256 v) internal pure returns (string memory) {
    bytes memory b = "000";
    b[2] = bytes1(uint8(48 + v % 10));
    if (v >= 10) b[1] = bytes1(uint8(48 + (v / 10) % 10));
    if (v >= 100) b[0] = bytes1(uint8(48 + (v / 100) % 10));
    return string(b);
  }
  // serial on the card: TANGENT is No 000 — outside the numbered run entirely
  function _serial(uint8 t, uint256 id) internal pure returns (string memory) {
    if (t == 16) return "000";
    return _pad3(id);
  }
  function _plat(uint8 t) internal pure returns (string memory) {
    if (t == 16) return "ULTRA PLATINUM";
    return "PLATINUM";
  }
  // one-decimal width for a stat fill: rating*29.8
  function _dec(uint8 rating) internal pure returns (string memory) {
    uint256 v = uint256(rating) * 298;
    return string(abi.encodePacked(_u(v / 10), ".", _u(v % 10)));
  }

  function _defs(uint8 t, bool holo, bool rare) internal pure returns (bytes memory) {
    (, , string memory ac) = _pal(t);
    string memory shnOp = holo ? ".5" : rare ? ".26" : ".14";
    bytes memory d = abi.encodePacked(
      "<linearGradient id='a' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='", ac, "'/><stop offset='1' stop-color='", ac, "'/></linearGradient>",
      "<linearGradient id='met' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#eef2f8'/><stop offset='.18' stop-color='#9aa6b6'/><stop offset='.5' stop-color='#3d4653'/><stop offset='.82' stop-color='#697485'/><stop offset='1' stop-color='#20262f'/></linearGradient>",
      "<radialGradient id='cos' cx='.5' cy='.36' r='.9'><stop offset='0' stop-color='#20273b'/><stop offset='.5' stop-color='#0c1020'/><stop offset='1' stop-color='#04060d'/></radialGradient>",
      "<radialGradient id='spot' cx='.5' cy='0' r='.9'><stop offset='0' stop-color='#dfe9ff' stop-opacity='.5'/><stop offset='.4' stop-color='#9fb4e0' stop-opacity='.12'/><stop offset='1' stop-color='#9fb4e0' stop-opacity='0'/></radialGradient>"
    );
    d = abi.encodePacked(d,
      "<radialGradient id='gl' cx='.5' cy='.55' r='.55'><stop offset='0' stop-color='", ac, "' stop-opacity='.6'/><stop offset='.5' stop-color='", ac, "' stop-opacity='.16'/><stop offset='1' stop-color='", ac, "' stop-opacity='0'/></radialGradient>",
      "<linearGradient id='bar' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='", ac, "' stop-opacity='.55'/><stop offset='1' stop-color='", ac, "'/></linearGradient>",
      "<linearGradient id='shn' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='", shnOp, "'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>",
      "<clipPath id='cw'><rect x='24' y='70' width='352' height='250' rx='11'/></clipPath>",
      "<clipPath id='cc'><rect x='6' y='6' width='388' height='548' rx='22'/></clipPath>",
      "<filter id='soft' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='6'/></filter>"
    );
    if (rare) d = abi.encodePacked(d,
      "<linearGradient id='foil' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff8a8a'/><stop offset='.2' stop-color='#ffd76a'/><stop offset='.4' stop-color='#7cf9a5'/><stop offset='.6' stop-color='#7fd0ff'/><stop offset='.8' stop-color='#b8a8ff'/><stop offset='1' stop-color='#ff8ae2'/>",
      holo ? "<animate attributeName='x1' values='0;-0.7;0' dur='3.2s' repeatCount='indefinite'/><animate attributeName='x2' values='1;1.7;1' dur='3.2s' repeatCount='indefinite'/>" : "",
      "</linearGradient>"
    );
    return d;
  }

  function _statRows(uint8 t, bool holo) internal pure returns (bytes memory out) {
    (uint8 s1, uint8 s2, uint8 s3) = _stats(t);
    uint8[3] memory vals = [s1, s2, s3];
    string[3] memory labels = ["DMG", "MAG", "ROF"];
    string memory fill = holo ? "url(#foil)" : "url(#bar)";
    for (uint256 i = 0; i < 3; i++) {
      uint256 y = 376 + i * 25;
      out = abi.encodePacked(out,
        "<text x='30' y='", _u(y + 8), "' fill='#7c8798' font-family='Arial' font-size='11' font-weight='bold' letter-spacing='1'>", labels[i],
        "</text><rect x='76' y='", _u(y), "' width='300' height='10' rx='5' fill='#121826'/>",
        "<rect x='76' y='", _u(y), "' width='", _dec(vals[i]), "' height='10' rx='5' fill='", fill, "'/>",
        "<rect x='78' y='", _u(y + 1), "' width='", _dec(vals[i]), "' height='2.5' rx='1.2' fill='#fff' opacity='.28'/>",
        "<path d='", TICKS, "' transform='translate(0,", _u(y), ")' stroke='#0a0d14' stroke-width='1.4' fill='none'/>"
      );
    }
  }

  function _svgCard(uint8 t, uint256 id) internal view returns (string memory) {
    bool holo = t >= 11;
    bool rare = t >= 4;
    (, , string memory ac) = _pal(t);
    string memory frameStroke = holo ? "url(#foil)" : "url(#met)";
    string memory inkAc = rare ? "url(#foil)" : ac;
    bytes memory s = abi.encodePacked(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'><defs>", _defs(t, holo, rare), "</defs>",
      "<rect x='2' y='2' width='396' height='556' rx='24' fill='#05070c'/>",
      "<rect x='6' y='6' width='388' height='548' rx='22' fill='", frameStroke, "'/>",
      "<rect x='11' y='11' width='378' height='538' rx='18' fill='#0a0d14'/>",
      "<rect x='14' y='14' width='372' height='532' rx='15' fill='none' stroke='", inkAc, "' stroke-width='1' opacity='", rare ? ".85" : ".5", "'/>"
    );
    // corner brackets
    s = abi.encodePacked(s,
      "<path d='M24 40 L24 24 L40 24' stroke='", inkAc, "' stroke-width='2.4' fill='none'/>",
      "<path d='M376 40 L376 24 L360 24' stroke='", inkAc, "' stroke-width='2.4' fill='none'/>",
      "<path d='M24 520 L24 536 L40 536' stroke='", inkAc, "' stroke-width='2.4' fill='none'/>",
      "<path d='M376 520 L376 536 L360 536' stroke='", inkAc, "' stroke-width='2.4' fill='none'/>"
    );
    { // header
      string memory chip = _chip(t);
      uint256 cw = bytes(chip).length * 74 / 10 + 16;
      s = abi.encodePacked(s,
        "<rect x='22' y='30' width='356' height='30' rx='6' fill='#0e1420'/><rect x='22' y='30' width='356' height='30' rx='6' fill='none' stroke='", inkAc, "' stroke-width='.8' opacity='.5'/>",
        "<text x='34' y='51' fill='", holo ? "url(#foil)" : "#eef2f8", "' font-family='Impact,Arial' font-size='21' font-weight='bold' letter-spacing='1'>", _uname(t),
        "</text><rect x='", _u(372 - cw), "' y='36' width='", _u(cw), "' height='18' rx='9' fill='", holo ? "url(#foil)" : ac, "' opacity='", holo ? ".9" : ".16", "'/>",
        "<text x='", _u(372 - cw / 2), "' y='49' fill='", holo ? "#0a0d14" : ac, "' font-family='Arial' font-size='10' font-weight='bold' letter-spacing='1' text-anchor='middle'>", chip, "</text>"
      );
    }
    // art window: cinematic hero shot
    s = abi.encodePacked(s,
      "<rect x='24' y='70' width='352' height='250' rx='11' fill='url(#cos)'/><g clip-path='url(#cw)'>",
      "<path d='M150 70 L250 70 L330 320 L70 320 Z' fill='url(#spot)'/>",
      "<g opacity='.10' fill='#cfe0ff'><path d='M188 70 L196 320 L182 320 Z'/><path d='M214 70 L228 320 L220 320 Z'/><path d='M168 70 L150 320 L162 320 Z'/></g>",
      "<g fill='#0a1120' opacity='.9'><rect x='24' y='250' width='40' height='70'/><rect x='60' y='232' width='30' height='88'/><rect x='96' y='262' width='22' height='58'/><rect x='150' y='244' width='26' height='76'/><rect x='250' y='238' width='30' height='82'/><rect x='286' y='260' width='24' height='60'/><rect x='320' y='230' width='36' height='90'/><rect x='356' y='256' width='20' height='64'/></g>",
      "<ellipse cx='200' cy='196' rx='150' ry='96' fill='url(#gl)'/>",
      "<rect x='24' y='288' width='352' height='32' fill='#060a12' opacity='.55'/>",
      "<g transform='translate(200,196) scale(.8) translate(-200,-206)'><g transform='translate(0,412) scale(1,-1)' opacity='.16'>", B.body(t), "</g></g>",
      "<g transform='translate(200,192) scale(.82) translate(-200,-206)'>",
      "<ellipse cx='205' cy='300' rx='120' ry='11' fill='#000' opacity='.55'/>",
      "<g filter='url(#soft)' opacity='.4'>", B.body(t), "</g>", B.body(t), B.ov(t), "</g>"
    );
    s = abi.encodePacked(s,
      rare ? string(abi.encodePacked("<rect x='24' y='70' width='352' height='250' fill='url(#foil)' opacity='", holo ? ".14" : ".07", "'/>")) : "",
      holo ? "<g opacity='.32'><rect x='-90' y='55' width='60' height='280' fill='url(#shn)' transform='skewX(-16)'><animate attributeName='x' values='-120;470' dur='2.7s' repeatCount='indefinite'/></rect></g>" : "",
      holo ? SPARKS : "",
      "</g>",
      "<rect x='24' y='70' width='352' height='250' rx='11' fill='none' stroke='#000' stroke-width='2.5'/>",
      "<rect x='25.5' y='71.5' width='349' height='247' rx='10' fill='none' stroke='", inkAc, "' stroke-width='1.2' opacity='", rare ? ".9" : ".7", "'/>"
    );
    // perk + stats
    s = abi.encodePacked(s,
      "<rect x='24' y='330' width='352' height='30' rx='7' fill='#0d131e'/><rect x='24' y='332' width='4' height='26' rx='2' fill='", ac, "'/>",
      "<text x='40' y='350' fill='#cdd6e3' font-family='Arial' font-size='13' font-style='italic'>", _perk(t), "</text>",
      _statRows(t, holo),
      "<path d='M24 460 H376' stroke='#222b38' stroke-width='1'/>"
    );
    { // bottom plate
      string memory rlet = holo ? "1/1" : t == 5 ? "E" : t == 4 ? "R" : t == 1 ? "C" : "U";
      s = abi.encodePacked(s,
        "<circle cx='52' cy='500' r='21' fill='#0d131e'/><circle cx='52' cy='500' r='21' fill='none' stroke='", inkAc, "' stroke-width='2.2'/><circle cx='52' cy='500' r='15' fill='", ac, "' opacity='.12'/>",
        "<text x='52' y='", holo ? "505" : "507", "' fill='", inkAc, "' font-family='Impact,Arial' font-size='", holo ? "13" : "17", "' font-weight='bold' text-anchor='middle'>", rlet,
        "</text><text x='84' y='495' fill='", holo ? "url(#foil)" : "#b6c0cf", "' font-family='Arial' font-size='13' font-weight='bold' letter-spacing='2'>", _rar(t),
        "</text><text x='84' y='512' fill='#5f6b7c' font-family='Arial' font-size='9' letter-spacing='1.6'>WICK ARSENAL - FIRST EDITION</text>",
        "<text x='374' y='498' fill='", holo ? "#e9f0ff" : "#9aa6b6", "' font-family='Courier New,monospace' font-size='13' font-weight='bold' text-anchor='end'>No ", _serial(t, id), " / 100</text>",
        holo ? string(abi.encodePacked("<text x='374' y='514' fill='url(#foil)' font-family='Arial' font-size='10' font-weight='bold' text-anchor='end' letter-spacing='2'>", _plat(t), "</text>")) : ""
      );
    }
    s = abi.encodePacked(s,
      "<g clip-path='url(#cc)'><rect x='-120' y='0' width='90' height='560' fill='url(#shn)' transform='skewX(-14)'><animate attributeName='x' values='-140;520' dur='", holo ? "3.4" : "5.5", "s' repeatCount='indefinite'/></rect></g>",
      holo ? "<rect x='6' y='6' width='388' height='548' rx='22' fill='url(#foil)' opacity='.05'/>" : ""
    );
    return string(abi.encodePacked(s, "</svg>"));
  }

  // sealed case card-back: what every public token shows until the blind reveal
  function _svgBack(uint256 id) internal pure returns (string memory) {
    return string(abi.encodePacked(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'><defs>",
      "<linearGradient id='foil' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff8a8a'/><stop offset='.25' stop-color='#ffd76a'/><stop offset='.5' stop-color='#7cf9a5'/><stop offset='.75' stop-color='#7fd0ff'/><stop offset='1' stop-color='#b8a8ff'/>",
      "<animate attributeName='x1' values='0;-0.6;0' dur='3.4s' repeatCount='indefinite'/><animate attributeName='x2' values='1;1.6;1' dur='3.4s' repeatCount='indefinite'/></linearGradient>",
      "<radialGradient id='cos' cx='.5' cy='.45'><stop offset='0' stop-color='#161c30'/><stop offset='1' stop-color='#05070e'/></radialGradient></defs>",
      "<rect x='4' y='4' width='392' height='552' rx='24' fill='#0b0e15'/>",
      "<rect x='7' y='7' width='386' height='546' rx='21' fill='url(#cos)' stroke='url(#foil)' stroke-width='5'/>",
      "<rect x='18' y='18' width='364' height='524' rx='14' fill='none' stroke='url(#foil)' stroke-width='1.2' opacity='.6'/>",
      "<path d='M200 118 L226 170 L282 178 L241 218 L251 274 L200 247 L149 274 L159 218 L118 178 L174 170 Z' fill='none' stroke='url(#foil)' stroke-width='3'/>",
      "<text x='200' y='330' fill='url(#foil)' font-family='Impact,Arial' font-size='92' font-weight='bold' text-anchor='middle'>?</text>",
      "<text x='200' y='388' fill='#e8ecf4' font-family='Impact,Arial' font-size='26' letter-spacing='4' text-anchor='middle'>SEALED CASE</text>",
      "<text x='200' y='416' fill='#8a93a5' font-family='Arial' font-size='13' letter-spacing='2' text-anchor='middle'>BLIND MINT - GUN REVEALED AFTER SELLOUT</text>",
      "<text x='200' y='470' fill='#5f6b7c' font-family='Arial' font-size='10' letter-spacing='1.6' text-anchor='middle'>WICK ARSENAL - FIRST EDITION</text>",
      "<text x='200' y='496' fill='#e9f0ff' font-family='Courier New,monospace' font-size='14' font-weight='bold' text-anchor='middle'>No ", _pad3(id), " / 100</text>",
      "</svg>"
    ));
  }

  function svg(uint8 t, uint256 id) external view returns (string memory) {
    if (t == 0) return _svgBack(id);
    return _svgCard(t, id);
  }
}
