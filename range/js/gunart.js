// WICK Arsenal gun art — detailed vector guns, shared 1:1 with the on-chain SVG.
// All attribute quotes are single quotes so the exact strings port into Solidity.
(function(){

// ---- gun bodies (drawn facing right, in a 400x400 space) ----
const PISTOL =
"<g transform='translate(0,-6)' stroke='#0a0c10' stroke-width='2' stroke-linejoin='round'>"+
"<path d='M84 160 L316 160 Q334 160 338 172 L341 186 L92 186 Q84 186 84 177 Z' fill='url(#b)'/>"+
"<path d='M96 165 V182 M105 165 V182 M114 165 V182 M123 165 V182 M132 165 V182' stroke='#0d1014' stroke-width='3.5' fill='none'/>"+
"<rect x='250' y='165' width='40' height='12' rx='2' fill='#0d1014' stroke='none'/>"+
"<rect x='90' y='151' width='13' height='9' fill='#1d222a'/>"+
"<rect x='95' y='151' width='4' height='5' fill='#05060c' stroke='none'/>"+
"<rect x='320' y='150' width='7' height='10' fill='#1d222a'/>"+
"<rect x='92' y='182' width='246' height='4' fill='url(#a)' stroke='none' opacity='.9'/>"+
"<path d='M90 186 L338 186 L333 202 L212 202 L204 195 L124 195 L118 202 L98 202 Q90 202 90 194 Z' fill='#232932'/>"+
"<rect x='252' y='189' width='14' height='5' rx='1' fill='#0d1014' stroke='none'/>"+
"<rect x='274' y='189' width='14' height='5' rx='1' fill='#0d1014' stroke='none'/>"+
"<rect x='296' y='189' width='14' height='5' rx='1' fill='#0d1014' stroke='none'/>"+
"<circle cx='338' cy='173' r='5' fill='#05060c' stroke='none'/>"+
"<path d='M196 202 Q194 230 222 234 L238 234 Q216 224 219 202 Z' fill='#232932'/>"+
"<path d='M215 206 Q209 216 214 226' stroke='#4a5462' stroke-width='4' fill='none'/>"+
"<path d='M118 199 L176 199 L164 260 Q162 269 151 268 L118 262 Q109 260 111 250 Z' fill='url(#g)'/>"+
"<path d='M126 210 L166 214 M124 222 L162 226 M122 234 L158 238' stroke='#0f1319' stroke-width='3' fill='none' opacity='.8'/>"+
"<rect x='112' y='262' width='46' height='11' rx='3' fill='#1a1f26'/>"+
"<path d='M84 158 q-8 2 -6 10' stroke='#1d222a' stroke-width='5' fill='none'/>"+
"<rect x='92' y='162' width='242' height='5' rx='2' fill='#fff' opacity='.10' stroke='none'/>"+
"<path d='M296 165 V182 M305 165 V182' stroke='#0d1014' stroke-width='3' fill='none'/>"+
"<circle cx='108' cy='191' r='2.6' fill='#0d1014' stroke='none'/><circle cx='206' cy='191' r='2.6' fill='#0d1014' stroke='none'/>"+
"<path d='M132 190 h20' stroke='#3a4350' stroke-width='3' fill='none'/>"+
"<circle cx='137' cy='230' r='3' fill='#0d1014' stroke='none'/>"+
"<circle cx='338' cy='173' r='7' fill='none' stroke='#3a4350' stroke-width='1.6'/>"+
"</g>";

const SMG =
"<g transform='translate(0,4)' stroke='#0a0c10' stroke-width='2' stroke-linejoin='round'>"+
"<rect x='46' y='158' width='13' height='42' rx='4' fill='#1a1f26'/>"+
"<path d='M58 166 L110 168 L110 180 L58 182 Z' fill='url(#b)'/>"+
"<path d='M58 190 L110 186 L110 194 L58 198 Z' fill='#1a1f26'/>"+
"<rect x='106' y='154' width='196' height='46' rx='7' fill='url(#b)'/>"+
"<rect x='98' y='146' width='218' height='10' rx='2' fill='#1d222a'/>"+
"<path d='M108 146 V156 M124 146 V156 M140 146 V156 M156 146 V156 M172 146 V156 M244 146 V156 M260 146 V156 M276 146 V156 M292 146 V156' stroke='#0d1014' stroke-width='4' fill='none'/>"+
"<rect x='184' y='124' width='46' height='24' rx='4' fill='#1d222a'/>"+
"<circle cx='220' cy='136' r='7' fill='url(#a)' stroke='#0a0c10'/>"+
"<rect x='108' y='158' width='192' height='5' fill='url(#a)' stroke='none' opacity='.85'/>"+
"<rect x='158' y='170' width='44' height='16' rx='3' fill='#0d1014' stroke='none'/>"+
"<rect x='302' y='162' width='22' height='14' fill='url(#b)'/>"+
"<rect x='322' y='155' width='34' height='28' rx='6' fill='#1d222a'/>"+
"<path d='M332 155 V183 M342 155 V183' stroke='#0d1014' stroke-width='3' fill='none'/>"+
"<path d='M196 200 L226 200 L216 268 L188 262 Z' fill='#1a1f26'/>"+
"<path d='M196 214 L221 216 M193 228 L218 230 M191 242 L214 244' stroke='#0d1014' stroke-width='3' fill='none'/>"+
"<path d='M240 200 L270 200 L260 250 Q258 256 250 255 L234 251 Z' fill='#1a1f26'/>"+
"<path d='M228 200 q-2 20 16 22 l6 -8 q-10 -4 -8 -14 z' fill='#232932'/>"+
"<path d='M288 200 L308 200 L320 234 Q322 240 314 241 L300 238 Z' fill='#1a1f26'/>"+
"<rect x='96' y='160' width='12' height='9' rx='2' fill='#1d222a'/>"+
"<rect x='108' y='156' width='192' height='3' fill='#fff' opacity='.08' stroke='none'/>"+
"<circle cx='221' cy='134' r='2.6' fill='#fff' opacity='.85' stroke='none'/>"+
"<rect x='186' y='261' width='32' height='8' rx='2' fill='#232932'/>"+
"<circle cx='127' cy='177' r='2.4' fill='#0d1014' stroke='none'/><circle cx='283' cy='177' r='2.4' fill='#0d1014' stroke='none'/>"+
"<path d='M352 160 v18' stroke='#39424e' stroke-width='2' fill='none'/>"+
"</g>";

const SHOTGUN =
"<g transform='translate(0,26)' stroke='#0a0c10' stroke-width='2' stroke-linejoin='round'>"+
"<rect x='42' y='166' width='13' height='48' rx='4' fill='#1a1f26'/>"+
"<path d='M54 170 L126 160 L126 200 L96 208 Q56 214 54 206 Z' fill='url(#w)'/>"+
"<path d='M64 178 L118 170 M64 188 L114 180' stroke='#241a10' stroke-width='2' fill='none' opacity='.7'/>"+
"<rect x='66' y='178' width='13' height='11' rx='2' fill='#5a1d1d'/>"+
"<rect x='66' y='178' width='5' height='11' fill='#c9a84c' stroke='none'/>"+
"<rect x='84' y='176' width='13' height='11' rx='2' fill='#5a1d1d'/>"+
"<rect x='84' y='176' width='5' height='11' fill='#c9a84c' stroke='none'/>"+
"<rect x='124' y='150' width='96' height='46' rx='6' fill='url(#b)'/>"+
"<rect x='146' y='164' width='44' height='17' rx='3' fill='#0d1014' stroke='none'/>"+
"<rect x='126' y='154' width='92' height='5' fill='url(#a)' stroke='none' opacity='.85'/>"+
"<rect x='218' y='154' width='134' height='13' fill='url(#b)'/>"+
"<rect x='218' y='171' width='118' height='11' fill='#1d222a'/>"+
"<circle cx='354' cy='149' r='3.5' fill='url(#a)' stroke='none'/>"+
"<rect x='352' y='151' width='8' height='18' fill='#1d222a'/>"+
"<rect x='240' y='182' width='60' height='23' rx='9' fill='#2a323d'/>"+
"<path d='M250 184 V203 M262 184 V203 M274 184 V203 M286 184 V203' stroke='#0d1014' stroke-width='3.5' fill='none'/>"+
"<path d='M150 196 q-2 20 16 22 l7 -8 q-11 -4 -9 -14 z' fill='#232932'/>"+
"<rect x='218' y='156' width='134' height='3' fill='#fff' opacity='.09' stroke='none'/>"+
"<circle cx='166' cy='174' r='3' fill='#0d1014' stroke='none'/><circle cx='204' cy='174' r='2.4' fill='#0d1014' stroke='none'/>"+
"<path d='M47 172 v38 M51 172 v38' stroke='#0c0f14' stroke-width='1.5' fill='none' opacity='.7'/>"+
"<path d='M244 186 q26 -6 52 0' stroke='#161c24' stroke-width='2' fill='none'/>"+
"</g>";

const RIFLE =
"<g transform='translate(0,18)' stroke='#0a0c10' stroke-width='2' stroke-linejoin='round'>"+
"<rect x='38' y='158' width='13' height='46' rx='3' fill='#1a1f26'/>"+
"<path d='M50 162 L118 166 L118 198 L50 200 Z' fill='url(#b)'/>"+
"<rect x='62' y='174' width='34' height='7' rx='3' fill='#0d1014' stroke='none'/>"+
"<rect x='62' y='186' width='34' height='7' rx='3' fill='#0d1014' stroke='none'/>"+
"<rect x='104' y='168' width='28' height='16' fill='#1d222a'/>"+
"<rect x='120' y='156' width='146' height='24' rx='3' fill='url(#b)'/>"+
"<rect x='116' y='147' width='186' height='10' rx='2' fill='#1d222a'/>"+
"<path d='M126 147 V157 M138 147 V157 M150 147 V157 M162 147 V157 M234 147 V157 M246 147 V157 M258 147 V157 M270 147 V157 M282 147 V157' stroke='#0d1014' stroke-width='4' fill='none'/>"+
"<circle cx='254' cy='168' r='5' fill='#1d222a'/>"+
"<rect x='128' y='180' width='124' height='20' rx='3' fill='#232932'/>"+
"<path d='M208 200 L242 200 Q254 228 251 246 L224 252 Q212 226 208 200 Z' fill='#1a1f26'/>"+
"<path d='M214 212 L242 214 M218 226 L245 228 M222 238 L247 240' stroke='#0d1014' stroke-width='3' fill='none'/>"+
"<path d='M152 200 L180 200 L172 240 Q170 246 162 245 L148 241 Z' fill='#1a1f26'/>"+
"<path d='M182 200 q0 18 16 20 l8 -8 q-10 -4 -10 -12 z' fill='#232932'/>"+
"<rect x='264' y='156' width='74' height='27' rx='5' fill='url(#b)'/>"+
"<rect x='272' y='166' width='15' height='7' rx='3' fill='#0d1014' stroke='none'/>"+
"<rect x='294' y='166' width='15' height='7' rx='3' fill='#0d1014' stroke='none'/>"+
"<rect x='316' y='166' width='15' height='7' rx='3' fill='#0d1014' stroke='none'/>"+
"<rect x='338' y='163' width='16' height='9' fill='url(#b)'/>"+
"<rect x='354' y='158' width='13' height='18' rx='2' fill='#1d222a'/>"+
"<path d='M357 162 h7 M357 169 h7' stroke='#0d1014' stroke-width='2.5' fill='none'/>"+
"<rect x='148' y='138' width='11' height='11' fill='#1d222a'/>"+
"<rect x='216' y='138' width='11' height='11' fill='#1d222a'/>"+
"<rect x='138' y='122' width='100' height='19' rx='9' fill='#1d222a'/>"+
"<circle cx='240' cy='131' r='11' fill='#1d222a'/>"+
"<circle cx='240' cy='131' r='6.5' fill='url(#a)' stroke='none' opacity='.9'/>"+
"<circle cx='137' cy='131' r='8' fill='#1d222a'/>"+
"<rect x='180' y='114' width='13' height='10' rx='2' fill='#1d222a'/>"+
"<rect x='122' y='158' width='142' height='4' fill='url(#a)' stroke='none' opacity='.85'/>"+
"<rect x='122' y='163' width='142' height='3' fill='#fff' opacity='.08' stroke='none'/>"+
"<circle cx='241' cy='129' r='3.2' fill='#fff' opacity='.85' stroke='none'/>"+
"<rect x='196' y='118' width='7' height='6' rx='1' fill='#39424e'/>"+
"<path d='M256 172 l9 7' stroke='#0d1014' stroke-width='3' fill='none'/>"+
"<circle cx='160' cy='236' r='2.6' fill='#0d1014' stroke='none'/><circle cx='58' cy='182' r='3' fill='#0d1014' stroke='none'/>"+
"<circle cx='138' cy='190' r='2.4' fill='#0d1014' stroke='none'/><circle cx='240' cy='190' r='2.4' fill='#0d1014' stroke='none'/>"+
"</g>";

const HEAVY =
"<g transform='translate(0,10)' stroke='#0a0c10' stroke-width='2' stroke-linejoin='round'>"+
"<rect x='44' y='156' width='14' height='50' rx='4' fill='#1a1f26'/>"+
"<path d='M56 162 L120 166 L120 198 L56 202 Z' fill='url(#b)'/>"+
"<rect x='116' y='150' width='142' height='22' rx='5' fill='url(#b)'/>"+
"<path d='M150 150 q24 -20 52 0' stroke='#1d222a' stroke-width='7' fill='none'/>"+
"<circle cx='212' cy='194' r='41' fill='url(#b)'/>"+
"<circle cx='212' cy='194' r='30' fill='#171b21'/>"+
"<circle cx='212' cy='170' r='8' fill='#0d1014'/><circle cx='234' cy='186' r='8' fill='#0d1014'/><circle cx='226' cy='212' r='8' fill='#0d1014'/><circle cx='197' cy='214' r='8' fill='#0d1014'/><circle cx='189' cy='188' r='8' fill='#0d1014'/>"+
"<circle cx='212' cy='194' r='6' fill='#232932'/>"+
"<rect x='252' y='158' width='98' height='36' rx='7' fill='url(#b)'/>"+
"<path d='M268 160 V192 M284 160 V192 M300 160 V192 M316 160 V192' stroke='#12161c' stroke-width='4' fill='none'/>"+
"<rect x='348' y='150' width='16' height='52' rx='5' fill='#1d222a'/>"+
"<ellipse cx='356' cy='176' rx='4' ry='16' fill='#05060c' stroke='none'/>"+
"<rect x='252' y='160' width='98' height='5' fill='url(#a)' stroke='none' opacity='.85'/>"+
"<path d='M144 172 L172 172 L164 222 Q162 228 154 227 L140 222 Z' fill='#1a1f26'/>"+
"<path d='M174 172 q-2 20 16 22 l7 -8 q-11 -4 -9 -14 z' fill='#232932'/>"+
"<rect x='296' y='194' width='15' height='30' rx='5' fill='#1a1f26'/>"+
"<circle cx='212' cy='194' r='13' fill='none' stroke='#0d1014' stroke-width='1.6'/>"+
"<circle cx='128' cy='161' r='2.4' fill='#0d1014' stroke='none'/><circle cx='246' cy='161' r='2.4' fill='#0d1014' stroke='none'/>"+
"<rect x='118' y='152' width='138' height='3' fill='#fff' opacity='.08' stroke='none'/>"+
"<ellipse cx='352' cy='176' rx='7' ry='20' fill='none' stroke='#39424e' stroke-width='1.4'/>"+
"</g>";

const CANNON =
"<g transform='translate(0,-14)' stroke='#0a0c10' stroke-width='2.4' stroke-linejoin='round'>"+
"<path d='M72 150 L326 150 Q346 150 351 168 L355 190 L82 190 Q72 190 72 179 Z' fill='url(#b)'/>"+
"<path d='M86 156 V184 M96 156 V184 M106 156 V184 M116 156 V184 M126 156 V184 M136 156 V184' stroke='#0d1014' stroke-width='4' fill='none'/>"+
"<rect x='296' y='154' width='13' height='14' rx='2' fill='#0d1014' stroke='none'/>"+
"<rect x='315' y='154' width='13' height='14' rx='2' fill='#0d1014' stroke='none'/>"+
"<rect x='334' y='154' width='13' height='14' rx='2' fill='#0d1014' stroke='none'/>"+
"<rect x='352' y='158' width='10' height='28' rx='2' fill='#1d222a'/>"+
"<circle cx='357' cy='172' r='8' fill='#05060c' stroke='none'/>"+
"<rect x='80' y='186' width='266' height='4.5' fill='url(#a)' stroke='none'/>"+
"<path d='M78 190 L348 190 L342 210 L218 210 L209 202 L128 202 L122 210 L88 210 Q78 210 78 200 Z' fill='#232932'/>"+
"<path d='M204 210 Q202 240 232 245 L250 245 Q226 234 229 210 Z' fill='#232932'/>"+
"<path d='M224 215 Q217 226 223 237' stroke='#4a5462' stroke-width='4.5' fill='none'/>"+
"<path d='M108 208 L180 208 L167 282 Q165 292 152 291 L110 283 Q99 281 101 269 Z' fill='url(#g)'/>"+
"<path d='M118 222 L172 227 M115 236 L168 241 M112 250 L163 255' stroke='#0f1319' stroke-width='3' fill='none' opacity='.8'/>"+
"<rect x='104' y='283' width='56' height='12' rx='3' fill='#1a1f26'/>"+
"<rect x='92' y='140' width='14' height='10' rx='2' fill='#1d222a'/>"+
"<rect x='318' y='140' width='8' height='10' fill='#1d222a'/>"+
"<path d='M160 162 l0 14 m6 -14 l0 14 m6 -14 l0 14 m6 -14 l0 14 m-22 -3 l26 -8' stroke='#c9ccd6' stroke-width='2' fill='none' opacity='.5'/>"+
"<path d='M196 162 l0 14 m6 -14 l0 14 m6 -14 l0 14 m6 -14 l0 14 m-22 -3 l26 -8' stroke='#c9ccd6' stroke-width='2' fill='none' opacity='.5'/>"+
"<path d='M232 162 l0 14 m6 -14 l0 14 m6 -14 l0 14' stroke='#c9ccd6' stroke-width='2' fill='none' opacity='.5'/>"+
"<rect x='80' y='153' width='262' height='5' rx='2' fill='#fff' opacity='.10' stroke='none'/>"+
"<circle cx='357' cy='172' r='11' fill='none' stroke='#3a4350' stroke-width='1.6'/>"+
"<circle cx='120' cy='240' r='3' fill='#0d1014' stroke='none'/><circle cx='158' cy='246' r='3' fill='#0d1014' stroke='none'/>"+
"<circle cx='96' cy='198' r='2.6' fill='#0d1014' stroke='none'/><circle cx='330' cy='198' r='2.6' fill='#0d1014' stroke='none'/>"+
"</g>";

// ---- 1/1 signature overlays ----
const OV = {
  11: "<path d='M142 168 q14 -9 28 0 q-14 10 -28 0 z' fill='none' stroke='#fff3c4' stroke-width='2' opacity='.6'/>"+
      "<path d='M184 172 q17 -11 32 0 M226 168 q13 -8 24 0' fill='none' stroke='#fff3c4' stroke-width='2' opacity='.5'/>"+
      "<circle cx='141' cy='228' r='13' fill='#ffd23f' stroke='#7a5c10' stroke-width='2.5'/>"+
      "<circle cx='141' cy='228' r='7' fill='none' stroke='#7a5c10' stroke-width='2.5'/>",
  12: "<path d='M60 118 Q200 34 348 122' stroke='#8bd6ff' stroke-width='2.5' fill='none' stroke-dasharray='2 9' opacity='.8'/>"+
      "<circle cx='60' cy='118' r='4' fill='#8bd6ff'/><circle cx='204' cy='62' r='4' fill='#8bd6ff'/><circle cx='348' cy='122' r='4' fill='#8bd6ff'/>"+
      "<path d='M152 152 l16 -13 h26 l-13 13 z' fill='url(#a)' opacity='.85' stroke='#0a0c10' stroke-width='2'/>"+
      "<path d='M204 152 l14 -10 h22 l-11 10 z' fill='url(#a)' opacity='.7' stroke='#0a0c10' stroke-width='2'/>",
  13: "<path d='M124 170 q30 -11 60 0 q30 11 60 0 q26 -9 50 0' stroke='#e8d9a8' stroke-width='1.7' fill='none' opacity='.55'/>"+
      "<rect x='150' y='201' width='34' height='13' rx='3' fill='#0d1014' stroke='#0a0c10'/>"+
      "<circle cx='159' cy='207' r='3.5' fill='url(#a)'/><circle cx='173' cy='207' r='3.5' fill='#39424e'/>",
  14: "<rect x='268' y='184' width='66' height='7' rx='3.5' fill='url(#a)'>"+
      "<animate attributeName='opacity' values='.4;1;.4' dur='1.6s' repeatCount='indefinite'/></rect>",
  15: "<g opacity='.85'><circle cx='138' cy='230' r='11' fill='#e8e8ea'/>"+
      "<circle cx='134' cy='228' r='3' fill='#0c0e12'/><circle cx='143' cy='228' r='3' fill='#0c0e12'/>"+
      "<rect x='132' y='236' width='13' height='5' fill='#e8e8ea'/>"+
      "<path d='M135 236 v5 M139 236 v5 M143 236 v5' stroke='#0c0e12' stroke-width='1.4'/></g>",
  16: "<text x='118' y='190' fill='#0a2415' font-family='Impact,Arial' font-size='9' font-weight='bold' letter-spacing='1'>TANGENTIAL REAPER</text>"+
      "<g transform='translate(370,186)' stroke='#7cf9a5' stroke-width='3' stroke-linecap='round' opacity='.9'>"+
      "<path d='M4 0 h16'><animate attributeName='opacity' values='.2;1;.2' dur='1.1s' repeatCount='indefinite'/></path>"+
      "<path d='M2 -7 l14 -8'><animate attributeName='opacity' values='1;.2;1' dur='1.1s' repeatCount='indefinite'/></path>"+
      "<path d='M2 7 l14 8'><animate attributeName='opacity' values='1;.2;1' dur='1.1s' repeatCount='indefinite'/></path></g>"+
      "<text x='200' y='306' fill='#7cf9a5' font-family='Arial' font-size='11' font-weight='bold' letter-spacing='2' text-anchor='middle' opacity='.85'>FORGED FOR TANGENT.PLS</text>"
};

// TANGENTIAL REAPER (16) — green AR-15 platform, tri-prong flash hider.
// Geometry mirrors WickGunBodies.B_AR15 so this preview matches the on-chain card.
const AR15 =
"<g transform='translate(0,18)' stroke='#0a0c10' stroke-width='2' stroke-linejoin='round'>"+
"<path d='M38 150 L66 150 L72 158 L72 196 L64 204 L46 204 Q36 204 38 190 Z' fill='#123522'/>"+
"<rect x='44' y='162' width='20' height='7' rx='3' fill='#0d1712' stroke='none'/>"+
"<rect x='44' y='176' width='20' height='7' rx='3' fill='#0d1712' stroke='none'/>"+
"<rect x='70' y='166' width='42' height='18' rx='4' fill='url(#b)'/>"+
"<rect x='108' y='152' width='94' height='34' rx='5' fill='url(#b)'/>"+
"<rect x='104' y='143' width='150' height='10' rx='2' fill='#123522'/>"+
"<path d='M114 143 V153 M126 143 V153 M138 143 V153 M150 143 V153 M162 143 V153 M174 143 V153 M186 143 V153 M198 143 V153 M210 143 V153 M222 143 V153 M234 143 V153 M246 143 V153' stroke='#0d1712' stroke-width='4' fill='none'/>"+
"<circle cx='188' cy='166' r='6' fill='#123522'/>"+
"<path d='M138 186 L166 186 L162 214 Q150 222 142 214 Q134 200 138 186 Z' fill='#123522'/>"+
"<path d='M142 194 L160 195 M141 203 L158 205' stroke='#0d1712' stroke-width='2.5' fill='none'/>"+
"<path d='M172 186 L206 186 Q216 212 210 240 L184 246 Q172 216 172 186 Z' fill='#164028'/>"+
"<path d='M180 198 L206 200 M182 212 L208 215 M185 226 L209 229' stroke='#0d1712' stroke-width='3' fill='none'/>"+
"<path d='M120 186 q-2 16 12 18 l7 -7 q-8 -5 -8 -11 z' fill='#164028'/>"+
"<rect x='202' y='152' width='96' height='26' rx='4' fill='url(#b)'/>"+
"<rect x='210' y='161' width='14' height='8' rx='3' fill='#0d1712' stroke='none'/>"+
"<rect x='230' y='161' width='14' height='8' rx='3' fill='#0d1712' stroke='none'/>"+
"<rect x='250' y='161' width='14' height='8' rx='3' fill='#0d1712' stroke='none'/>"+
"<rect x='270' y='161' width='14' height='8' rx='3' fill='#0d1712' stroke='none'/>"+
"<rect x='296' y='158' width='34' height='12' fill='#123522'/>"+
"<rect x='306' y='140' width='6' height='18' fill='#123522'/>"+
"<rect x='303' y='136' width='12' height='6' rx='2' fill='#123522'/>"+
"<rect x='330' y='156' width='24' height='16' rx='3' fill='url(#b)'/>"+
"<path d='M354 156 l14 -6 v28 l-14 -6 z' fill='#123522'/>"+
"<path d='M358 154 v20 M363 152 v24' stroke='#0d1712' stroke-width='2.5' fill='none'/></g>";

// which body each type uses
const BODY = {1:PISTOL,2:SMG,3:SHOTGUN,4:RIFLE,5:HEAVY,11:PISTOL,12:PISTOL,13:RIFLE,14:RIFLE,15:CANNON,16:AR15};

// palettes: body top, body bottom, accent
const PAL = {
  1:["#566172","#1c2129","#cfd6e0"], 2:["#4e6656","#18211b","#7cf9a5"],
  3:["#665a4a","#211b13","#ff9d3d"], 4:["#4e6070","#17202a","#7fd0ff"],
  5:["#5c4e72","#1d1727","#b26bff"], 11:["#f2d27a","#6e5312","#ffd23f"],
  12:["#6b93a6","#16303c","#8bd6ff"],13:["#caa96b","#4a3a16","#e8d9a8"],
  14:["#f4f7fb","#97a3b2","#c8ffe0"],15:["#454c58","#0e1116","#ff5c5c"],
  16:["#35d97a","#0b3a1e","#7cf9a5"]
};

function spark(x,y,s,d){
  return "<g opacity='0'><path d='M"+x+" "+(y-s)+" L"+(x+s*0.3)+" "+(y-s*0.3)+" L"+(x+s)+" "+y+" L"+(x+s*0.3)+" "+(y+s*0.3)+" L"+x+" "+(y+s)+" L"+(x-s*0.3)+" "+(y+s*0.3)+" L"+(x-s)+" "+y+" L"+(x-s*0.3)+" "+(y-s*0.3)+" Z' fill='#fff'/>"+
    "<animate attributeName='opacity' values='0;1;0' dur='2.4s' begin='"+d+"s' repeatCount='indefinite'/></g>";
}

// per-type card data: [dmg,mag,rof] out of 10, short perk line, class chip
const STAT={1:[6,8,7],2:[4,10,10],3:[9,4,3],4:[7,7,6],5:[10,3,3],11:[6,7,7],12:[5,6,7],13:[6,8,7],14:[7,7,6],15:[10,2,4],16:[10,9,8]};
const CHIP={1:"PISTOL",2:"SMG",3:"SHOTGUN",4:"RIFLE",5:"HEAVY",11:"1 OF 1",12:"1 OF 1",13:"1 OF 1",14:"1 OF 1",15:"1 OF 1",16:"1 OF 1"};

// unknown-type card — post-reveal there are no sealed cases, so type 0 only means
// a failed RPC read. Say that; never dress a live listing as an unopened case.
function unknownCard(id){
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'>"+
    "<rect x='4' y='4' width='392' height='552' rx='24' fill='#0b0e15'/>"+
    "<rect x='7' y='7' width='386' height='546' rx='21' fill='#0a0d16' stroke='#3a4152' stroke-width='4'/>"+
    "<text x='200' y='265' fill='#5f6b7c' font-family='Impact,Arial' font-size='84' text-anchor='middle'>?</text>"+
    "<text x='200' y='330' fill='#aab4c4' font-family='Impact,Arial' font-size='24' letter-spacing='3' text-anchor='middle'>"+(id?("GUN #"+id):"UNKNOWN")+"</text>"+
    "<text x='200' y='362' fill='#8a93a5' font-family='Arial' font-size='13' letter-spacing='1' text-anchor='middle'>COULDN'T READ THIS GUN'S TYPE</text>"+
    "<text x='200' y='384' fill='#8a93a5' font-family='Arial' font-size='13' letter-spacing='1' text-anchor='middle'>FROM THE CHAIN - REFRESH TO RETRY</text>"+
    "</svg>";
}
// sealed case card-back (blind mint era) — kept for history/reference renders
function cardBack(id){
  const serial=id?("No "+String(id-1).padStart(3,"0")+" / 100"):"BLIND MINT";
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'><defs>"+
    "<linearGradient id='foil' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff8a8a'/><stop offset='.25' stop-color='#ffd76a'/><stop offset='.5' stop-color='#7cf9a5'/><stop offset='.75' stop-color='#7fd0ff'/><stop offset='1' stop-color='#b8a8ff'/>"+
    "<animate attributeName='x1' values='0;-0.6;0' dur='3.4s' repeatCount='indefinite'/><animate attributeName='x2' values='1;1.6;1' dur='3.4s' repeatCount='indefinite'/></linearGradient>"+
    "<radialGradient id='cos' cx='.5' cy='.45'><stop offset='0' stop-color='#161c30'/><stop offset='1' stop-color='#05070e'/></radialGradient></defs>"+
    "<rect x='4' y='4' width='392' height='552' rx='24' fill='#0b0e15'/>"+
    "<rect x='7' y='7' width='386' height='546' rx='21' fill='url(#cos)' stroke='url(#foil)' stroke-width='5'/>"+
    "<rect x='18' y='18' width='364' height='524' rx='14' fill='none' stroke='url(#foil)' stroke-width='1.2' opacity='.6'/>"+
    "<path d='M200 118 L226 170 L282 178 L241 218 L251 274 L200 247 L149 274 L159 218 L118 178 L174 170 Z' fill='none' stroke='url(#foil)' stroke-width='3'/>"+
    "<text x='200' y='330' fill='url(#foil)' font-family='Impact,Arial' font-size='92' font-weight='bold' text-anchor='middle'>?</text>"+
    "<text x='200' y='388' fill='#e8ecf4' font-family='Impact,Arial' font-size='26' letter-spacing='4' text-anchor='middle'>SEALED CASE</text>"+
    "<text x='200' y='416' fill='#8a93a5' font-family='Arial' font-size='13' letter-spacing='2' text-anchor='middle'>BLIND MINT - GUN REVEALED AFTER SELLOUT</text>"+
    "<text x='200' y='470' fill='#5f6b7c' font-family='Arial' font-size='10' letter-spacing='1.6' text-anchor='middle'>WICK ARSENAL - FIRST EDITION</text>"+
    "<text x='200' y='496' fill='#e9f0ff' font-family='Courier New,monospace' font-size='14' font-weight='bold' text-anchor='middle'>"+serial+"</text>"+
    "</svg>";
}

// ---- premium trading card, 400x560 (shared 1:1 with the on-chain renderer) ----
window.gunCardSVG = function(t, id){
  if(!t||t===0)return unknownCard(id);              // post-reveal, type 0 = failed read
  const p=PAL[t]||PAL[1], holo=t>=11, rare=t>=4;   // rare/epic/1-1 get foil treatment
  const ac=p[2], G=window.WICK_GUNS&&window.WICK_GUNS[t]||{name:"GUN "+t,rarity:"",perk:""};
  const st=STAT[t]||[5,5,5];
  const chip=CHIP[t]||"GUN";                        // unknown type must not TypeError the whole grid
  // token #1 is the Reaper (never in the public run), so public cases are ids 2..101:
  // the Nth public case is id-1. The Reaper itself is always No 000.
  const serial=t===16?"No 000 / 100":(id?("No "+String(id-1).padStart(3,"0")+" / 100"):"FIRST EDITION");
  const rlet=holo?"1/1":t===5?"E":t===4?"R":t===1?"C":"U";
  const frameStroke=holo?"url(#foil)":"url(#met)";
  const inkAc=rare?"url(#foil)":ac;
  let defs =
    "<linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='"+p[0]+"'/><stop offset='1' stop-color='"+p[1]+"'/></linearGradient>"+
    "<linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2b323d'/><stop offset='1' stop-color='#14181f'/></linearGradient>"+
    "<linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#4a3524'/><stop offset='1' stop-color='#241a10'/></linearGradient>"+
    "<linearGradient id='a' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='"+ac+"'/><stop offset='1' stop-color='"+ac+"'/></linearGradient>"+
    // metallic bevel for the frame (light top-left -> dark bottom-right)
    "<linearGradient id='met' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#eef2f8'/><stop offset='.18' stop-color='#9aa6b6'/><stop offset='.5' stop-color='#3d4653'/><stop offset='.82' stop-color='#697485'/><stop offset='1' stop-color='#20262f'/></linearGradient>"+
    // cinematic art-window backdrop + spotlight + rarity glow
    "<radialGradient id='cos' cx='.5' cy='.36' r='.9'><stop offset='0' stop-color='#20273b'/><stop offset='.5' stop-color='#0c1020'/><stop offset='1' stop-color='#04060d'/></radialGradient>"+
    "<radialGradient id='spot' cx='.5' cy='0' r='.9'><stop offset='0' stop-color='#dfe9ff' stop-opacity='.5'/><stop offset='.4' stop-color='#9fb4e0' stop-opacity='.12'/><stop offset='1' stop-color='#9fb4e0' stop-opacity='0'/></radialGradient>"+
    "<radialGradient id='gl' cx='.5' cy='.55' r='.55'><stop offset='0' stop-color='"+ac+"' stop-opacity='.6'/><stop offset='.5' stop-color='"+ac+"' stop-opacity='.16'/><stop offset='1' stop-color='"+ac+"' stop-opacity='0'/></radialGradient>"+
    "<linearGradient id='bar' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='"+ac+"' stop-opacity='.55'/><stop offset='1' stop-color='"+ac+"'/></linearGradient>"+
    // sheen band that sweeps across every card
    "<linearGradient id='shn' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='"+(holo?".5":rare?".26":".14")+"'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>"+
    "<clipPath id='cw'><rect x='24' y='70' width='352' height='250' rx='11'/></clipPath>"+
    "<clipPath id='cc'><rect x='6' y='6' width='388' height='548' rx='22'/></clipPath>"+
    "<filter id='soft' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='6'/></filter>";
  if(rare){
    defs+="<linearGradient id='foil' x1='0' y1='0' x2='1' y2='1'>"+
      "<stop offset='0' stop-color='#ff8a8a'/><stop offset='.2' stop-color='#ffd76a'/><stop offset='.4' stop-color='#7cf9a5'/><stop offset='.6' stop-color='#7fd0ff'/><stop offset='.8' stop-color='#b8a8ff'/><stop offset='1' stop-color='#ff8ae2'/>"+
      (holo?"<animate attributeName='x1' values='0;-0.7;0' dur='3.2s' repeatCount='indefinite'/><animate attributeName='x2' values='1;1.7;1' dur='3.2s' repeatCount='indefinite'/>":"")+
      "</linearGradient>";
  }
  let s="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 560'><defs>"+defs+"</defs>";
  // ---- card body + beveled metal frame ----
  s+="<rect x='2' y='2' width='396' height='556' rx='24' fill='#05070c'/>";
  s+="<rect x='6' y='6' width='388' height='548' rx='22' fill='"+frameStroke+"'/>";
  s+="<rect x='11' y='11' width='378' height='538' rx='18' fill='#0a0d14'/>";
  s+="<rect x='14' y='14' width='372' height='532' rx='15' fill='none' stroke='"+inkAc+"' stroke-width='1' opacity='"+(rare?".85":".5")+"'/>";
  // corner brackets
  const cb=(x,y,sx,sy)=>"<path d='M"+x+" "+(y+sy*16)+" L"+x+" "+y+" L"+(x+sx*16)+" "+y+"' stroke='"+inkAc+"' stroke-width='2.4' fill='none'/>";
  s+=cb(24,24,1,1)+cb(376,24,-1,1)+cb(24,536,1,-1)+cb(376,536,-1,-1);
  // ---- header ----
  s+="<rect x='22' y='30' width='356' height='30' rx='6' fill='#0e1420'/><rect x='22' y='30' width='356' height='30' rx='6' fill='none' stroke='"+inkAc+"' stroke-width='.8' opacity='.5'/>";
  s+="<text x='34' y='51' fill='"+(holo?"url(#foil)":"#eef2f8")+"' font-family='Impact,Arial' font-size='21' font-weight='bold' letter-spacing='1'>"+G.name.toUpperCase()+"</text>";
  s+="<rect x='"+(372-chip.length*7.4-16)+"' y='36' width='"+(chip.length*7.4+16)+"' height='18' rx='9' fill='"+(holo?"url(#foil)":ac)+"' opacity='"+(holo?".9":".16")+"'/>";
  s+="<text x='"+(372-(chip.length*7.4+16)/2)+"' y='49' fill='"+(holo?"#0a0d14":ac)+"' font-family='Arial' font-size='10' font-weight='bold' letter-spacing='1' text-anchor='middle'>"+chip+"</text>";
  // ---- ART WINDOW: cinematic hero shot ----
  s+="<rect x='24' y='70' width='352' height='250' rx='11' fill='url(#cos)'/>";
  s+="<g clip-path='url(#cw)'>";
  // volumetric spotlight cone + rays from the top
  s+="<path d='M150 70 L250 70 L330 320 L70 320 Z' fill='url(#spot)'/>";
  s+="<g opacity='.10' fill='#cfe0ff'><path d='M188 70 L196 320 L182 320 Z'/><path d='M214 70 L228 320 L220 320 Z'/><path d='M168 70 L150 320 L162 320 Z'/></g>";
  // distant city skyline silhouette
  s+="<g fill='#0a1120' opacity='.9'><rect x='24' y='250' width='40' height='70'/><rect x='60' y='232' width='30' height='88'/><rect x='96' y='262' width='22' height='58'/><rect x='150' y='244' width='26' height='76'/><rect x='250' y='238' width='30' height='82'/><rect x='286' y='260' width='24' height='60'/><rect x='320' y='230' width='36' height='90'/><rect x='356' y='256' width='20' height='64'/></g>";
  s+="<g fill='"+ac+"' opacity='.5'><rect x='70' y='244' width='3' height='3'/><rect x='158' y='256' width='3' height='3'/><rect x='262' y='250' width='3' height='3'/><rect x='330' y='242' width='3' height='3'/><rect x='300' y='272' width='3' height='3'/></g>";
  // big rarity glow behind the gun
  s+="<ellipse cx='200' cy='196' rx='150' ry='96' fill='url(#gl)'/>";
  // glossy floor + gun reflection (flipped, faded)
  s+="<rect x='24' y='288' width='352' height='32' fill='#060a12' opacity='.55'/>";
  s+="<g transform='translate(200,196) scale(.8) translate(-200,-206)'>";
  s+="<g transform='translate(0,412) scale(1,-1)' opacity='.16'>"+(BODY[t]||PISTOL)+"</g>";  // reflection
  s+="</g>";
  // the hero gun (soft glow halo behind, then crisp gun on top)
  s+="<g transform='translate(200,192) scale(.82) translate(-200,-206)'>";
  s+="<ellipse cx='205' cy='300' rx='120' ry='11' fill='#000' opacity='.55'/>";
  s+="<g filter='url(#soft)' opacity='.4'>"+(BODY[t]||PISTOL)+"</g>";
  s+=(BODY[t]||PISTOL)+(OV[t]||"");
  s+="</g>";
  // holographic prismatic wash for rare+
  if(rare)s+="<rect x='24' y='70' width='352' height='250' fill='url(#foil)' opacity='"+(holo?".14":".07")+"'/>";
  if(holo){
    s+="<g opacity='.32'><rect x='-90' y='55' width='60' height='280' fill='url(#shn)' transform='skewX(-16)'><animate attributeName='x' values='-120;470' dur='2.7s' repeatCount='indefinite'/></rect></g>";
    s+=spark(66,104,7,0)+spark(332,92,5,.6)+spark(352,268,6,1.2)+spark(54,258,5,1.8)+spark(208,84,4,2.1);
  }
  s+="</g>";
  // window frame
  s+="<rect x='24' y='70' width='352' height='250' rx='11' fill='none' stroke='#000' stroke-width='2.5'/>";
  s+="<rect x='25.5' y='71.5' width='349' height='247' rx='10' fill='none' stroke='"+inkAc+"' stroke-width='1.2' opacity='"+(rare?".9":".7")+"'/>";
  // ---- perk band ----
  s+="<rect x='24' y='330' width='352' height='30' rx='7' fill='#0d131e'/><rect x='24' y='332' width='4' height='26' rx='2' fill='"+ac+"'/>";
  s+="<text x='40' y='350' fill='#cdd6e3' font-family='Arial' font-size='13' font-style='italic'>"+(G.perk||"")+"</text>";
  // ---- glowing stat bars ----
  const rows=[["DMG",st[0]],["MAG",st[1]],["ROF",st[2]]];
  for(let i=0;i<3;i++){
    const y=376+i*25;
    s+="<text x='30' y='"+(y+8)+"' fill='#7c8798' font-family='Arial' font-size='11' font-weight='bold' letter-spacing='1'>"+rows[i][0]+"</text>";
    s+="<rect x='76' y='"+y+"' width='300' height='10' rx='5' fill='#121826'/>";
    s+="<rect x='76' y='"+y+"' width='"+(rows[i][1]*30)+"' height='10' rx='5' fill='"+(holo?"url(#foil)":"url(#bar)")+"'/>";
    s+="<rect x='78' y='"+(y+1.5)+"' width='"+(rows[i][1]*30-4)+"' height='2.5' rx='1.2' fill='#fff' opacity='.28'/>";
    for(let k=1;k<10;k++)s+="<rect x='"+(76+k*30-1)+"' y='"+y+"' width='1.4' height='10' fill='#0a0d14'/>";
  }
  // ---- bottom plate: gem, rarity, serial ----
  s+="<path d='M24 460 H376' stroke='#222b38' stroke-width='1'/>";
  s+="<circle cx='52' cy='500' r='21' fill='#0d131e'/><circle cx='52' cy='500' r='21' fill='none' stroke='"+(holo?"url(#foil)":ac)+"' stroke-width='2.2'/>";
  s+="<circle cx='52' cy='500' r='15' fill='"+ac+"' opacity='.12'/>";
  s+="<text x='52' y='"+(holo?505:507)+"' fill='"+(holo?"url(#foil)":ac)+"' font-family='Impact,Arial' font-size='"+(holo?13:17)+"' font-weight='bold' text-anchor='middle'>"+rlet+"</text>";
  s+="<text x='84' y='495' fill='"+(holo?"url(#foil)":"#b6c0cf")+"' font-family='Arial' font-size='13' font-weight='bold' letter-spacing='2'>"+(G.rarity||"").toUpperCase()+"</text>";
  s+="<text x='84' y='512' fill='#5f6b7c' font-family='Arial' font-size='9' letter-spacing='1.6'>WICK ARSENAL - FIRST EDITION</text>";
  s+="<text x='374' y='498' fill='"+(holo?"#e9f0ff":"#9aa6b6")+"' font-family='Courier New,monospace' font-size='13' font-weight='bold' text-anchor='end'>"+serial+"</text>";
  if(holo)s+="<text x='374' y='514' fill='url(#foil)' font-family='Arial' font-size='10' font-weight='bold' text-anchor='end' letter-spacing='2'>"+(t===16?"ULTRA PLATINUM":"PLATINUM")+"</text>";
  // ---- full-card animated sheen sweep (all tiers) ----
  s+="<g clip-path='url(#cc)'><rect x='-120' y='0' width='90' height='560' fill='url(#shn)' transform='skewX(-14)'><animate attributeName='x' values='-140;520' dur='"+(holo?"3.4":"5.5")+"s' repeatCount='indefinite'/></rect></g>";
  if(holo)s+="<rect x='6' y='6' width='388' height='548' rx='22' fill='url(#foil)' opacity='.05'/>";
  return s+"</svg>";
};
/* Just the WEAPON — no card, no frame, no stats. The game's gunsmith bench needs
   the gun big enough to see attachments bolted onto it, and its own in-engine
   vector guns were drawn to be read at ~0.6x in a fist: blown up they are blobs.
   Same BODY / OV / PAL the card uses, so the bench and the NFT are the same
   object rather than two drawings of it. */
window.gunBodySVG = function(t){
  const p = PAL[t] || PAL[1], ac = p[2];
  const defs =
    "<linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='"+p[0]+"'/><stop offset='1' stop-color='"+p[1]+"'/></linearGradient>"+
    "<linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2b323d'/><stop offset='1' stop-color='#14181f'/></linearGradient>"+
    "<linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#4a3524'/><stop offset='1' stop-color='#241a10'/></linearGradient>"+
    "<linearGradient id='a' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='"+ac+"'/><stop offset='1' stop-color='"+ac+"'/></linearGradient>"+
    "<linearGradient id='met' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#eef2f8'/><stop offset='.18' stop-color='#9aa6b6'/><stop offset='.5' stop-color='#3d4653'/><stop offset='.82' stop-color='#697485'/><stop offset='1' stop-color='#20262f'/></linearGradient>";
  // viewBox frames the weapon itself; the bodies are drawn facing right inside 400x400
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='38 128 330 168'><defs>"+defs+"</defs>"+
         (BODY[t]||PISTOL)+(OV[t]||"")+"</svg>";
};
window.gunBodyURI = function(t){
  return "data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(window.gunBodySVG(t))));
};

// back-compat: everything renders the trading card now
window.gunArtSVG = function(t,id){ return window.gunCardSVG(t,id); };
window.gunArtURI = function(t,id){
  return "data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(window.gunCardSVG(t,id))));
};
})();
