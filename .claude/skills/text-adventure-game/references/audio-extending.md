# 音乐系统扩展指南(改引擎源码的开发者)

> **先分清你是谁**:
> - **做游戏的作者**(不碰引擎源码)→ 看 [`audio-system.md`](./audio-system.md)(词汇)+ [`audio-cookbook.md`](./audio-cookbook.md)(8 配方)+ [`progressions-library.md`](./progressions-library.md)(18 进行)+ [`audio-advanced.md`](./audio-advanced.md)(MusicSpec/MIDI)。**那些够覆盖 95% 需求**。
> - **要给引擎加新乐器音色 / 新和弦进行 / 新曲风的人**(fork 或改 `engine/presenters/`)→ 看本文。

音乐系统两个文件:`compose-music.js`(MusicSpec → 音符事件 events,纯函数、决定"演奏什么音")+ `present-audio.js`(events → Web Audio 节点图,决定"用什么音色发声")。扩展点都在这两个文件的**数据表**或 **voice 函数**里,不引入新接口(§10)。

## 扩展点速查

| 想加什么 | 改哪 | 影响 |
|---|---|---|
| 新乐器音色板(如新 bass/lead 音色) | `present-audio.js` 的 `XVoice` 函数 + `KNOWN` 表 | 渲染层,events 字节恒等 |
| 新和弦进行(命名) | `progressions.js` 的 `PROGRESSIONS` 表 | 作者写 `progression:'名'` 即用 |
| 新曲风→音色映射 | `compose-music.js` 的 `TONE_MAP` | 该曲风默认乐器音色 |
| 新预设(整个曲风) | `compose-music.js` 的 `PRESET` + `GENRE_DNA` | 作者写 `music:'名'` 即用 |

## 五条铁律(所有音乐扩展都守)

1. **零依赖 + 确定性**:纯 Web Audio 节点合成,无采样文件;禁 `Math.random`/`Date.now`(用种子 PRNG `mulberry32` 或纯几何)。同输入同输出。
2. **events 字节恒等**:音色走渲染层 `spec.timbre`(present-audio 消费),**绝不进 events**。events 项只 `{role,freq,t,dur,gain}`。这样改默认出声不破测试/存档。
3. **接缝逐字一致**:音色板名在三处必须逐字相同 —— ① `XVoice` 里的 `if(pal==='名')` 分支 ② `KNOWN.X` 白名单键 ③ `TONE_MAP`/作者 `timbre.X` 的值。漏一处 = warn 误报或静默失效。
4. **作者/预设优先**:曲风派生只兜底作者没写的声部。注入守卫 `!(spec.timbre && spec.timbre.X)` 已保证作者手写 / 预设自带 `timbre.X` 永不被派生覆盖。
5. **缺能力降级有声**:某些合成法需 `createDelay`/`createWaveShaper`/`createPeriodicWave`,极简环境(测试 mock)可能没有 → `try/catch` 或能力探测后回退默认分支,**不抛、仍发声**。

---

## 1. 加新乐器音色板(timbre)

**位置**:`present-audio.js` 的声部 voice 函数 —— `padVoice` / `bassVoice` / `leadVoice` / `pluckVoice`(arp 走它)。每个 voice 函数内是 `if (pal === '板名') { ...合成...; return; }` 分支链,末尾是默认分支。

**步骤**:
1. 在对应 voice 函数加一个 `if (pal === '你的板名') { ...; return; }` 分支。复用现有工具:`mkOsc(type,freq)` / `mkLp(cutoff,Q)` / `envADSR(gain,t,peak,a,d,s,r,dur)` / `makeDistortionCurve(k)` / `sharedNoise()` / `mtof`。
2. `musicVoice` 内的 `KNOWN` 表对应声部加键(`KNOWN.bass['你的板名'] = 1`)。
3. 同步公共规格 `core/module-interface.md` 的 `MusicSpec.timbre` 全量列表（音色板是作者可依赖的公共词汇，不能只改 presenter + 手册）。
4. `audio-system.md` 的"X 合法值"行补上你的板名；再运行 codex parity 生成 `.agents` 镜像，禁止手改双份。
5. (可选)`TONE_MAP` 给某些曲风默认用它(见 §3)。

**范例**:照 `bassVoice` 里的 `upright`(Karplus-Strong 拨弦,复用 `pluckVoice` 的 KS 路 + 无 `createDelay` 降级)、`picked`(三角+锯齿+滤波上扫+软饱和)、`synth`(方波+短 sweep)、`sine-pluck`(正弦+FM burst)—— 四个范本覆盖了"拨弦/电声/合成/柔拨"四类合成法。

**测试**:`present-audio.test.cjs` 的 X 段。每个新板 ≥1 条:节点计数(`nOsc`/`nBiq`/`nWS`/`nBuf` 验合成法)+ 降级不抛(删某能力)+ `KNOWN` 完整性(新板不报"未知音色板")+ 变异验牙(删分支→走默认→红)。

---

## 2. 加新和弦进行(命名)

**位置**:`progressions.js` 的 `PROGRESSIONS` 表。

**步骤**:加一条 `'你的名': { pattern: ['i','VI','iv','V'], modeHint: 'minor', family: '族', feel: '一句话气质' }`。
- `pattern` 是**罗马数字数组**(I/II/.../VII,可带 `b`/`#`);引擎按 `mode + 度数`自动推和弦性质(大小写仅可读)。
- `modeHint` 是设计意图调式(作者用别的 mode = 借用调,warn-once 不抛)。
- 名字必须独特(命名接缝防御:拼错 fail-loud 列已知名单)。

**文档**:`progressions-library.md` 加一张卡片(罗马数字 + 调式建议 + 感觉 + 适用场景 + 反例 + 原型)。

**测试**:`compose-music.test.cjs` 的 S 段(命名展开 = 罗马数组、字节恒等)。

---

## 3. 加新曲风→音色映射(让某曲风默认换乐器)

**位置**:`compose-music.js` 的 `TONE_MAP`(feel 词 → `{lead, arp, pad, bass}`)。

**步骤**:加一条 `'你的feel': { lead:'音色', arp:'音色', pad:'音色', bass:'音色' }`。
- 值必须 ⊆ `present-audio` 的 `KNOWN.{lead,arp,pad,bass}`(逐字一致,见铁律 3)。
- **保守**:不确定的声部填 `null`=默认(选错主旋律乐器毁曲);强质感音色(kalimba/choir/glass)宁缺省勿乱派。
- `deriveGenreDNA` 自动据 feel 查表设 `dna.{lead,arp,pad,bass}Tone`,`composeMusic` 注入 `spec.timbre.X`(三重守卫:非 null + `hasLayer` + 作者/预设优先)。

**测试**:`compose-music.test.cjs` 的 T 段(派生 + 作者优先 + hasLayer 守卫 + 字节恒等 + 防蒙混双值变异验牙)。

---

## 4. 加新预设(整个曲风)

**位置**:`compose-music.js` 的 `PRESET` 表(+ 可选 `GENRE_DNA` 给该 feel 配旋律/节奏 DNA)。

**步骤**:加一条 `'你的预设': { mode, key, tempo, feel:['词'], progression:[...], instruments:[...], melody, intensity, timbre? }`。
- `feel` 词若在 `GENRE_DNA`/`TONE_MAP` 里有对应条目,会自动拿到旋律轮廓/节奏/音色派生。
- 预设自带 `timbre.X` 优先级高于曲风派生(作者覆盖更高)。
- 未知预设名 → warn-once + 回退 calm(不抛)。

**测试**:`compose-music.test.cjs` 的 K/M 段(预设解析、声部都发声无死数据、确定性、在调内)。

---

## 验证总闸

```bash
node test/run.cjs                 # present-audio.test + compose-music.test 全绿
node pipeline/build/build.mjs <demo>/index.html --smoke   # 4 demo 不受影响(纯渲染层)
```

**真机听感**:headless 出声不可靠(AudioContext 挂起)→ 用 `_scratch/*-preview.html` 类页面双击真机 A/B 听,或频谱对比。出声本就人工核。
