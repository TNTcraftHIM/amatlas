/* fixture(S12 boot 让位):与 kind-mismatch 同一个 encounter world,但配套 game.js 用
   `Amatlas.boot` 装配 —— boot 按内置 kind(encounter)【自动拉】Tabletop module、缺工厂还会 fail-loud。
   故 kind↔模块静态检查应【让位】(不报"漏 module")。对照 kind-mismatch:同样的 world,
   手写漏 use → 报 P0;boot 形态不报 = 让位生效(boot 自动拉 + start 预检 + probe eval 三重覆盖)。 */
const W = require('../kind-mismatch/world.js');
if (typeof module !== 'undefined' && module.exports) module.exports = W;
