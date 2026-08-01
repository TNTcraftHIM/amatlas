# Brown/Pink Noise + FM Synthesis — Web Audio 高级实现

> **要给引擎加新乐器音色 / 新和弦进行 / 新曲风?** → 集中三条扩展路径见 [`audio-extending.md`](./audio-extending.md)(本页是 DSP 算法实现库,那页是"加在哪、怎么测、守哪些铁律")。

> **在 Amatlas 里这些代码住哪**:作者**不**在 `world.js` 里写 Web Audio。节点只声明**音频意图**
> `audio:{ bgm:'theme-beach', sfx:['pickup'] }`(名字,非素材),由呈现器 `presenters/present-audio.js`
> 合成。本页全部 DSP 算法 = **改/扩呈现器时的实现库**:把一个 bgm/sfx 名字接到一段合成路径。
> 落点对应:`BGM_FREQ`/`SFX_SPEC`(简单振荡器路径的频率/波形表)、`RICH_BGM`/`RICH_SFX`(走"丰富合成"分路,
> 下面这些多层噪声/FM/LFO 结构就放这里)、`startBgm`/`startAmbient`/`playSfx`/`playRichSfx`(合成函数)。
> 所有音频节点最终 `connect(master)`(呈现器的主增益,经 `master.connect(ctx.destination)`)——
> 下文示例里的 `mainGain`/`compressor` 一律读作"接到呈现器的 `master`"。
> bgm 的"换/停/不重启"由 `present()` 的变更检测自动处理(名字变才换、同名不重启、无 bgm→停);
> sfx 每次 render 触发一次。**改音色 = 改呈现器映射,world 数据不动**(修改分层:表现→presenter)。

## Brown Noise（底层参考 / ending 主题）

频谱 -6dB/oct，低频重，听感像海浪。
算法：每个样本 = 上一样本 + 白噪声×0.02，归一化。

```js
const bufSize = ctx.sampleRate * 8;
const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
const data = buf.getChannelData(0);
let last = 0;
for (let i = 0; i < bufSize; i++) {
  last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
  data[i] = last * 3.5;
}
```

**⚠️ Brown noise 不适合 beach/ocean 主题。** 低频太重，LPF 600Hz 听起来像闷雷。
Beach 应使用 Pink noise（见下方 Beach/Ocean BGS 章节）。
Brown noise 保留用于：village 底噪、thunder rumble、ending 主题。

## Pink Noise（森林主题，如 `theme-forest`）

频谱 -3dB/oct，频谱均匀，像风穿树叶。
Voss-McCartney 算法：

```js
let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
for (let i = 0; i < bufSize; i++) {
  const white = Math.random() * 2 - 1;
  b0 = 0.99886*b0 + white*0.0555179;
  b1 = 0.99332*b1 + white*0.0750759;
  b2 = 0.96900*b2 + white*0.1538520;
  b3 = 0.86650*b3 + white*0.3104856;
  b4 = 0.55000*b4 + white*0.5329522;
  b5 = -0.7616*b5 - white*0.0168980;
  data[i] = (b0+b1+b2+b3+b4+b5+b6+white*0.5362) * 0.11;
  b6 = white * 0.115926;
}
```

## 互质周期 LFO（永不重复的呼吸感）

用两个互质频率的 LFO 调制音量，产生数小时内不重复的模式：

```js
const lfo1 = ctx.createOscillator(); lfo1.frequency.value = 1/7;  // 7s cycle
const lfoG1 = ctx.createGain(); lfoG1.gain.value = 0.12;
const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 1/11; // 11s cycle
const lfoG2 = ctx.createGain(); lfoG2.gain.value = 0.08;
lfo1.connect(lfoG1); lfoG1.connect(mainGain.gain);
lfo2.connect(lfoG2); lfoG2.connect(mainGain.gain);
```

互质对推荐：(7,11), (5,13), (3,7,11) — 三组可叠加。

## FM 合成（岛屿之心核心音效）

用一个振荡器调制另一个的频率，产生"呼吸般脉动"的有机音色：

```js
// Carrier: 60Hz sine (基频)
const carrier = ctx.createOscillator();
carrier.frequency.value = 60; carrier.type = 'sine';
// Modulator: 0.5Hz sine (呼吸频率), depth 20Hz
const modulator = ctx.createOscillator();
modulator.frequency.value = 0.5;
const modGain = ctx.createGain(); modGain.gain.value = 20;
modulator.connect(modGain); modGain.connect(carrier.frequency);
// 第二谐波独立调制
const carrier2 = ctx.createOscillator();
carrier2.frequency.value = 120; carrier2.type = 'sine';
const mod2 = ctx.createOscillator(); mod2.frequency.value = 0.3;
const modG2 = ctx.createGain(); modG2.gain.value = 8;
mod2.connect(modG2); modG2.connect(carrier2.frequency);
```

比静态 60Hz+120Hz 正弦波有机得多。

## 环境音设计铁律（每个 bgm 主题一个结构）

**每个音频主题（一个 `audio.bgm` 名字，如 `theme-beach`/`theme-forest`）必须听起来「本质不同」，
不能只是同一个噪声算法 + 不同滤波器。** 在呈现器里,这意味着每个主题名走**自己的合成路径**
(`RICH_BGM` 分路 / 独立的 `startBgm` 分支),而不是共用一个噪声生成器只换滤波频率。

如果 `theme-beach` 用 Brown noise LPF 250Hz，`theme-forest` 用 Pink noise BPF 350Hz，
结果听起来几乎一样——都是连续嗡嗡声。这是最常见的音频设计错误。

正确做法：每个主题用不同的**结构**，不只是不同的**参数**。

---

## Beach/Ocean BGS（浪涌节奏 + 海浪冲刷）

**⚠️ 不用 Brown noise。** Brown noise 低频太重（gain 3.5 + LPF 600Hz 听起来像闷雷/风暴底噪）。
用 Pink noise 频谱更均匀，LPF 1200Hz 保留海浪的明亮"嘶嘶"感。

Layer 1: Pink noise + LFO 幅度调制 → 浪涌节奏。

```js
// Pink noise base (Voss-McCartney) — NOT brown noise!
let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
for (let i = 0; i < bufSize; i++) {
  const w = Math.random() * 2 - 1;
  b0 = 0.99886*b0 + w*0.0555179;
  b1 = 0.99332*b1 + w*0.0750759;
  b2 = 0.96900*b2 + w*0.1538520;
  b3 = 0.86650*b3 + w*0.3104856;
  b4 = 0.55000*b4 + w*0.5329522;
  b5 = -0.7616*b5 - w*0.0168980;
  data[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
  b6 = w * 0.115926;
}
const src = ctx.createBufferSource();
src.buffer = buf; src.loop = true;
// LPF 1200Hz — brighter than old 600Hz, lets wash/sizzle through
const lpf = ctx.createBiquadFilter();
lpf.type = 'lowpass'; lpf.frequency.value = 1200;

// Wave rhythm: amplitude modulated at ~0.12Hz (one wave every ~8s)
const waveLfo = ctx.createOscillator();
waveLfo.frequency.value = 0.12;
const waveLfoG = ctx.createGain();
waveLfoG.gain.value = 0.4; // moderate modulation (was 0.5)
const waveBias = ctx.createGain();
waveBias.gain.value = 0.5; // base level (was 0.4)
waveLfo.connect(waveLfoG);
waveLfoG.connect(waveBias.gain);
src.connect(lpf);
lpf.connect(waveBias);
waveBias.connect(mainGain);
src.start(); waveLfo.start();
```

Layer 2: 高频冲刷 — 白噪声 through 3000Hz bandpass，模拟浪花泡沫。

```js
// White noise through bandpass — surf/sizzle layer
const buf2 = ctx.createBuffer(1, bufSize, ctx.sampleRate);
const data2 = buf2.getChannelData(0);
for (let i = 0; i < bufSize; i++) data2[i] = Math.random() * 2 - 1;
const src2 = ctx.createBufferSource();
src2.buffer = buf2; src2.loop = true;
const hpf = ctx.createBiquadFilter();
hpf.type = 'bandpass'; hpf.frequency.value = 3000; hpf.Q.value = 0.5;
const washGain = ctx.createGain();
washGain.gain.value = 0.03; // very subtle
// Same wave rhythm, slightly softer
const washLfo = ctx.createOscillator();
washLfo.frequency.value = 0.12;
const washLfoG = ctx.createGain();
washLfoG.gain.value = 0.02;
washLfo.connect(washLfoG);
washLfoG.connect(washGain.gain);
src2.connect(hpf); hpf.connect(washGain); washGain.connect(mainGain);
src2.start(); washLfo.start();
```

**为什么不能只用 Brown noise + LPF 600Hz：**
旧实现 `data[i] = last * 3.5` + `LPF 600Hz` 听起来像风暴/闷雷的底噪，
用户反馈"海滩的海浪声低频太多听着好像有风暴雷声的感觉"。
Pink noise 频谱 -3dB/oct（比 brown 的 -6dB/oct 更均匀），不会在低频堆积。
LPF 1200Hz 保留了海浪冲刷的中高频质感。
高频冲刷层（3000Hz bandpass white noise）给浪花加了"嘶嘶"泡沫感。

---

## Forest BGS（风阵 + 鸟鸣）

核心：Pink noise + 风阵 LFO + 随机鸟鸣。

```js
// Pink noise base (Voss-McCartney)
// ... (same algorithm as above)
const bpf = ctx.createBiquadFilter();
bpf.type = 'bandpass'; bpf.frequency.value = 500; bpf.Q.value = 0.8;

// Wind gusts: slow LFO modulating amplitude (~5.5s per gust)
const gustLfo = ctx.createOscillator();
gustLfo.frequency.value = 0.18;
const gustLfoG = ctx.createGain();
gustLfoG.gain.value = 0.6; // deep modulation
const gustBias = ctx.createGain();
gustBias.gain.value = 0.3; // quiet baseline between gusts
gustLfo.connect(gustLfoG);
gustLfoG.connect(gustBias.gain);
src.connect(bpf);
bpf.connect(gustBias);
gustBias.connect(mainGain);
src.start(); gustLfo.start();

// Bird chirps: realistic — multiple species, harmonics, noise texture, vibrato
const chirp = () => {
  // 自调度循环须自停:bgm 已换走(currentBgm 不再是本主题)就停止排下一声。
  // 呈现器内 startBgm/startAmbient 启动这类循环时,把它登记进随 bgm 一起停的附属节点
  // (类比 bgmExtra),stopBgm() 会断开;此处守卫只是双保险。
  if (currentBgm !== 'theme-forest') return;
  const t = ctx.currentTime;
  // Pick a "species" — different freq ranges and patterns
  const species = Math.random();
  let baseFreq, dur, pattern;
  if (species < 0.4) {
    // Small bird: high, quick, upward sweep
    baseFreq = 2800 + Math.random() * 1800;
    dur = 0.06 + Math.random() * 0.08;
    pattern = 'up';
  } else if (species < 0.7) {
    // Medium bird: mid-range, two-note call
    baseFreq = 1800 + Math.random() * 1200;
    dur = 0.1 + Math.random() * 0.15;
    pattern = 'double';
  } else {
    // Large bird: lower, longer, down-up warble with vibrato
    baseFreq = 1200 + Math.random() * 800;
    dur = 0.15 + Math.random() * 0.2;
    pattern = 'warble';
  }
  // Main tone: triangle (has odd harmonics, warmer than sine)
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(baseFreq, t);
  if (pattern === 'up') {
    osc.frequency.linearRampToValueAtTime(baseFreq * (1.15 + Math.random() * 0.2), t + dur);
  } else if (pattern === 'double') {
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.setValueAtTime(baseFreq * 1.2, t + dur * 0.3);
    osc.frequency.setValueAtTime(baseFreq * 0.95, t + dur * 0.7);
  } else {
    // Warble: rapid vibrato LFO
    const vibRate = 15 + Math.random() * 10;
    const vibDepth = baseFreq * 0.04;
    const vib = ctx.createOscillator();
    vib.frequency.value = vibRate;
    const vibG = ctx.createGain();
    vibG.gain.value = vibDepth;
    vib.connect(vibG); vibG.connect(osc.frequency);
    vib.start(t); vib.stop(t + dur);
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.9, t + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.1, t + dur);
  }
  // Noise layer for breathy/hissy texture on attack
  const nDur = Math.min(dur * 0.4, 0.04);
  const nBufSize = Math.ceil(ctx.sampleRate * nDur);
  const nBuf = ctx.createBuffer(1, nBufSize, ctx.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nBufSize; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nBufSize, 2);
  const nSrc = ctx.createBufferSource();
  nSrc.buffer = nBuf;
  const nBpf = ctx.createBiquadFilter();
  nBpf.type = 'bandpass'; nBpf.frequency.value = baseFreq * 1.5; nBpf.Q.value = 2;
  const nG = ctx.createGain();
  nG.gain.setValueAtTime(0.008, t);
  nG.gain.exponentialRampToValueAtTime(0.001, t + nDur);
  nSrc.connect(nBpf); nBpf.connect(nG); nG.connect(mainGain);
  nSrc.start(t); nSrc.stop(t + nDur);
  // Amplitude envelope with sustained middle
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.018 + Math.random() * 0.01, t + 0.008);
  g.gain.setValueAtTime(0.018, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g); g.connect(mainGain);
  osc.start(t); osc.stop(t + dur);
  // Double-chirp for some birds
  if (pattern === 'double' || Math.random() > 0.7) {
    const gap = 0.04 + Math.random() * 0.06;
    const dur2 = dur * (0.5 + Math.random() * 0.3);
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    const f2 = baseFreq * (1.05 + Math.random() * 0.25);
    osc2.frequency.setValueAtTime(f2, t + dur + gap);
    osc2.frequency.linearRampToValueAtTime(f2 * 0.9, t + dur + gap + dur2);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t + dur + gap);
    g2.gain.linearRampToValueAtTime(0.012, t + dur + gap + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur + gap + dur2);
    osc2.connect(g2); g2.connect(mainGain);
    osc2.start(t + dur + gap); osc2.stop(t + dur + gap + dur2);
  }
  // Randomize interval: sometimes rapid cluster, sometimes long silence
  const nextInterval = Math.random() > 0.3
    ? 1500 + Math.random() * 4000   // normal gap
    : 8000 + Math.random() * 15000; // long pause (bird flew away)
  setTimeout(chirp, nextInterval);
};
setTimeout(chirp, 1000 + Math.random() * 3000);
```

**鸟鸣关键（v2 — 从"机器人鸟"到"真实鸟鸣"）：**
- **波形：** triangle（有奇次谐波，比 sine 温暖自然）
- **3 种"鸟种"：** 小型鸟(高频上滑)、中型鸟(双音节)、大型鸟(低频颤音+vibrato)
- **攻击噪声层：** bandpass noise 短脉冲模拟鸟鸣的气流/呼吸感
- **频率滑音：** 不同 species 用不同的频率变化模式（上滑/下行/颤音）
- **间隔随机化：** 70% 正常间隔(1.5-5.5s)，30% 长沉默(8-23s，"鸟飞走了")
- **双声概率：** double 类型100%双声，其他类型30%双声

**旧实现的问题：** 纯正弦 2000-5000Hz + 简单频率滑音 → 听起来像电子玩具鸟。
纯正弦没有谐波 = 没有"呼吸感"。间隔太规律(3-11s) = 不自然。

---

## Village BGS（4 层结构 — 篝火营地）

旧实现只有 2 层（brown noise 底噪 + 简单 crackle），用户反馈"过于没特色，没感觉"。
新实现 4 层，每层用不同结构：

### Layer 1: 火焰呼啸（brown noise + 带通 + LFO 明灭）

```js
// Brown noise through wide bandpass — fire roar
const fireBpf = ctx.createBiquadFilter();
fireBpf.type = 'bandpass'; fireBpf.frequency.value = 350; fireBpf.Q.value = 0.6;
// Fire flicker LFO — flame intensity rises and falls
const fireLfo = ctx.createOscillator();
fireLfo.frequency.value = 0.25; // ~4s flicker cycle
const fireLfoG = ctx.createGain();
fireLfoG.gain.value = 0.015;
const fireBias = ctx.createGain();
fireBias.gain.value = 0.035;
fireLfo.connect(fireLfoG);
fireLfoG.connect(fireBias.gain);
src.connect(fireBpf); fireBpf.connect(fireBias); fireBias.connect(mainGain);
src.start(); fireLfo.start();
```

### Layer 2: 炭火低沉嗡鸣

```js
const humOsc = ctx.createOscillator();
humOsc.frequency.value = 85; humOsc.type = 'sine';
const humG = ctx.createGain(); humG.gain.value = 0.012;
humOsc.connect(humG); humG.connect(mainGain);
humOsc.start();
```

### Layer 3: 爆裂声（大小两种规格 + 簇状连爆）

```js
const crackle = () => {
  const t = ctx.currentTime;
  const isBig = Math.random() > 0.75;
  const dur = isBig ? (0.05 + Math.random() * 0.06) : (0.02 + Math.random() * 0.03);
  const cBufSize = Math.ceil(ctx.sampleRate * dur);
  const cBuf = ctx.createBuffer(1, cBufSize, ctx.sampleRate);
  const cd = cBuf.getChannelData(0);
  for (let i = 0; i < cBufSize; i++) {
    const pos = i / cBufSize;
    const spikePos = Math.random();
    const spike = Math.abs(pos - spikePos) < 0.03 ? 1.0 : 0.03;
    const env = Math.exp(-pos * (isBig ? 8 : 15));
    cd[i] = (Math.random() * 2 - 1) * spike * env;
  }
  // ... connect through LPF, gain, etc.
  // Big pops: 500-1700ms interval, small: 150-550ms
  // After big pop: sometimes 2 rapid mini-pops (cluster effect)
  setTimeout(crackle, isBig ? (500 + Math.random() * 1200) : (150 + Math.random() * 400));
};
```

**vs 旧实现：** 旧版只有单一规格(30-70ms)，300-850ms 固定间隔。
新版有大小两种 + 大爆裂后常跟 2-3 个快速小爆裂（木头碎裂的真实感）。

### Layer 4: 木头沉降声（偶尔的深沉 thump + creak）

```js
const logSettle = () => {
  const t = ctx.currentTime;
  // Deep thump — descending frequency
  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(60, t);
  thump.frequency.exponentialRampToValueAtTime(30, t + 0.2);
  thump.type = 'sine';
  const thumpG = ctx.createGain();
  thumpG.gain.setValueAtTime(0.06, t);
  thumpG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  thump.connect(thumpG); thumpG.connect(mainGain);
  thump.start(t); thump.stop(t + 0.3);
  // Creak follow-up — narrow bandpass noise
  const creakBpf = ctx.createBiquadFilter();
  creakBpf.type = 'bandpass'; creakBpf.frequency.value = 400 + Math.random() * 300;
  creakBpf.Q.value = 5; // narrow = metallic creak
  // ... 8-20s interval
};
```

**效果：** 偶尔听到篝火中一根木头塌陷的深沉"咚"声 + 吱嘎声。
8-20 秒一次，稀疏但极大地增强了"有真实火焰在燃烧"的感觉。

---

## Noise Type 选择指南

| bgm 主题 | 结构 | 关键特征 | 听感 |
|------|------|----------|------|
| ocean/beach | **Pink** noise + LFO 幅度调制 + 高频冲刷 | 浪涌 0.12Hz + 3kHz wash | 海浪（明亮） |
| storm | 7 层：双层雨 + 狂风 + 底噪 + 3层雷（多反射） | crack+multi-reflection rumble+sweep boom | 暴风雨 |
| forest | Pink + 风阵 LFO + 3 种鸟种 triangle 波 | 间歇风 + 噪声攻击 + 颤音 + 不规则间隔 | 树林 |
| village | 4 层：火焰呼啸 LFO + 炭火嗡鸣 + 大小爆裂簇 + 木头沉降 | BPF 350Hz flicker + 85Hz hum + 60→30Hz thump | 篝火营地 |
| cave | 60Hz hum + 滴水 + 3-tap echo | 600-1000Hz 滴水 | 洞穴 |
| heart | FM 合成 60Hz + 0.5Hz modulator | 有机脉动 | 核心 |
| ending | 高通 Brown + 80Hz sine | HPF 800Hz, gain 0.04 | 冥想 |

**ending 主题增益注意：** 初始设计 gain 0.012/0.01 太安静，几乎听不到。
实际测试后调整到 gain 0.04/0.025，HPF 截止 800Hz（不是 1200Hz）。

---

## Cave Audio（洞穴 bgm 主题，如 `theme-cave`）

### 问题

水滴频率 1200-2000Hz 听起来像浴室滴水，不像洞穴。
缺少低频底噪 = 没有"地下空间"的感觉。
单级延迟 = 回声太短，不像大空间。

### 正确实现

```js
// 底噪：60Hz sine，几乎听不见的地下共鸣
const hum = ctx.createOscillator();
hum.frequency.value = 60; hum.type = 'sine';
const humG = ctx.createGain(); humG.gain.value = 0.015;
hum.connect(humG); humG.connect(mainGain);
hum.start();

// 水滴：600-1000Hz，3-tap echo
const drip = () => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.frequency.value = 600 + Math.random() * 400;
  osc.type = 'sine';
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  // 3-tap echo chain
  const delay1 = ctx.createDelay(); delay1.delayTime.value = 0.12;
  const delay2 = ctx.createDelay(); delay2.delayTime.value = 0.25;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  osc.connect(g); g.connect(mainGain);
  g.connect(delay1); delay1.connect(fb); fb.connect(delay1);
  delay1.connect(delay2); delay2.connect(mainGain);
  fb.connect(mainGain);
  osc.start(t); osc.stop(t + 0.5);
  setTimeout(drip, 2500 + Math.random() * 7000);
};
drip();
```

### 关键参数

| 参数 | 值 | 为什么 |
|------|-----|--------|
| 水滴频率 | 600-1000Hz | 低频 = 深洞感 |
| 水滴增益 | 0.08 | 柔和，不刺耳 |
| 衰减时间 | 0.5s | 足够长让回声叠加 |
| delay1 | 0.12s | 近壁反射 |
| delay2 | 0.25s | 远壁反射 |
| feedback | 0.35 | 3-4 次可听回声 |
| 底噪 | 60Hz, 0.015 | 几乎听不见但能感受到 |
| 间隔 | 2.5-9.5s | 稀疏 = 幽深 |

---

## Ending Audio（结局 bgm 主题，如 `theme-ending`）

结局节点应声明自己独特的 `audio.bgm`（如 `theme-ending`），而不是沿用 ocean（Brown noise 海浪）。
结局应有独特的、安静的、冥想般的音频氛围——在结局节点的 `world.js` 里写
`audio:{ bgm:'theme-ending' }`，并在呈现器里给这个名字接上下面这段合成。

```js
// 高通白噪声：空灵气息感
const bufSize = ctx.sampleRate * 6;
const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
const data = buf.getChannelData(0);
let last = 0;
for (let i = 0; i < bufSize; i++) {
  last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
  data[i] = last * 2;  // Brown noise base
}
const src = ctx.createBufferSource();
src.buffer = buf; src.loop = true;
const hpf = ctx.createBiquadFilter();
hpf.type = 'highpass'; hpf.frequency.value = 800;  // 不是 1200Hz（太高听不到）
const g = ctx.createGain(); g.gain.value = 0.04;  // 不是 0.012（太安静）
src.connect(hpf); hpf.connect(g); g.connect(mainGain);
src.start();

// 柔和底噪
const tone = ctx.createOscillator();
tone.frequency.value = 80; tone.type = 'sine';
const tg = ctx.createGain(); tg.gain.value = 0.025;  // 不是 0.01（太安静）
tone.connect(tg); tg.connect(mainGain);
tone.start();
```

效果：玩家感到"一切结束了，归于平静"。

---

## Weather Audio（天气音效）

天气音效在 Amatlas 里就是一个**音频主题名**:给"下雨/暴风雨"的节点声明 `audio:{ bgm:'theme-rain' }`
或 `bgm:'theme-storm'`,在呈现器里给这两个名字接上下面的合成路径(放 `RICH_BGM` 分路最自然——
它们是多层结构)。视觉上的 CSS 雨滴/闪电属于呈现器/插件的事;别只做视觉忘了音频——
雨声和雷声是沉浸感的关键元素。下面是这两个主题的合成实现库。

> 下文示例里出现的 `compressor`,在呈现器里读作"接到 `master`"(本呈现器把所有节点直接接 `master`;
> 若要加总线压缩,可在呈现器内建一个 `ctx.createDynamicsCompressor()` 串在 `master` 前,二选一即可)。

### Rain Audio（`theme-rain`）

```js
// bandpass white noise → 沙沙雨声
const rBufSize = ctx.sampleRate * 6;
const rBuf = ctx.createBuffer(1, rBufSize, ctx.sampleRate);
const rData = rBuf.getChannelData(0);
for (let i = 0; i < rBufSize; i++) rData[i] = Math.random() * 2 - 1;
const rSrc = ctx.createBufferSource();
rSrc.buffer = rBuf; rSrc.loop = true;
const bpf = ctx.createBiquadFilter();
bpf.type = 'bandpass'; bpf.frequency.value = 400; bpf.Q.value = 1.5;
const rGain = ctx.createGain();
rGain.gain.value = 0.05;
rSrc.connect(bpf); bpf.connect(rGain); rGain.connect(compressor);
rSrc.start();
```

### Storm Audio（`theme-storm`，7 层结构 — 完整实现）

风暴必须有 7 个声源，缺任何一个都不够震撼。

#### Layer 1: 重度雨声（中频 + 高频双层）

```js
// 中频雨打
const rainBpf = ctx.createBiquadFilter();
rainBpf.type = 'bandpass'; rainBpf.frequency.value = 600; rainBpf.Q.value = 0.8;
const rainGain = ctx.createGain();
rainGain.gain.value = 0.12;
rSrc.connect(rainBpf); rainBpf.connect(rainGain); rainGain.connect(compressor);

// 高频雨幕嘶嘶（sheet rain on surfaces）
const hpf2 = ctx.createBiquadFilter();
hpf2.type = 'highpass'; hpf2.frequency.value = 2000;
const rainHissGain = ctx.createGain();
rainHissGain.gain.value = 0.04;
rSrc2.connect(hpf2); hpf2.connect(rainHissGain); rainHissGain.connect(compressor);
```

#### Layer 2: 狂风（粉噪声 + 阵风 LFO）

```js
// Pink noise through bandpass — howling wind
const windBpf = ctx.createBiquadFilter();
windBpf.type = 'bandpass'; windBpf.frequency.value = 350; windBpf.Q.value = 0.5;
// Wind gust LFO — faster than forest (every 3-4s a big gust)
const gustLfo = ctx.createOscillator();
gustLfo.frequency.value = 0.28; // faster than forest's 0.18
const gustLfoG = ctx.createGain();
gustLfoG.gain.value = 0.08;
const gustBias = ctx.createGain();
gustBias.gain.value = 0.06;
gustLfo.connect(gustLfoG);
gustLfoG.connect(gustBias.gain);
wSrc.connect(windBpf); windBpf.connect(gustBias); gustBias.connect(compressor);
```

**森林风 vs 风暴风区别：**
- 森林：0.18Hz LFO（~5.5s/阵风），BPF 500Hz，gustBias 0.3（温柔）
- 风暴：0.28Hz LFO（~3.6s/阵风），BPF 350Hz，gustBias 0.06（持续高底噪）

#### Layer 3: 持续底噪（30Hz + 缓慢起伏）

```js
const rumbleOsc = ctx.createOscillator();
rumbleOsc.frequency.value = 30; rumbleOsc.type = 'sine';
// Slow amplitude modulation for ominous undulation (~12s cycle)
const rumbleLfo = ctx.createOscillator();
rumbleLfo.frequency.value = 0.08;
const rumbleLfoG = ctx.createGain();
rumbleLfoG.gain.value = 0.03;
const rumbleG = ctx.createGain();
rumbleG.gain.value = 0.06;
rumbleLfo.connect(rumbleLfoG);
rumbleLfoG.connect(rumbleG.gain);
rumbleOsc.connect(rumbleG); rumbleG.connect(compressor);
rumbleOsc.start(); rumbleLfo.start();
```

**旧实现问题：** 单条 40Hz sine at gain 0.03，几乎听不到。

#### Layer 4-7: Thunder（三层复合 + 变量间隔）

雷声是 `theme-storm` 自带的一个**自调度循环**:呈现器启动这个主题时排第一声雷,之后每声雷
自己用变量间隔排下一声;`theme-storm` 不再是 `currentBgm` 时停止排程(同前面 forest 鸟鸣的自停守卫)。
视觉闪电(屏幕白闪)是呈现器/插件的事——音频侧只管出声;若要音画同步,在同一处既播雷又触发视觉:

```js
const doThunder = () => {
  if (currentBgm !== 'theme-storm') return;        // bgm 已换走→停止自调度(自停守卫)
  // 视觉闪电若由本呈现器负责,可在此处触发(如给容器加一个一闪而过的 class);
  // 纯音频实现可省略这一句——视觉与音频解耦,各做各的。
  const t = ctx.currentTime;

  // Layer 4: Initial crack — sharp transient, higher freq
  const crackDur = 0.15 + Math.random() * 0.1;
  const crackBufSize = Math.ceil(ctx.sampleRate * crackDur);
  const crackBuf = ctx.createBuffer(1, crackBufSize, ctx.sampleRate);
  const crackData = crackBuf.getChannelData(0);
  for (let i = 0; i < crackBufSize; i++) {
    crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackBufSize, 4);
  }
  const crackSrc = ctx.createBufferSource();
  crackSrc.buffer = crackBuf;
  const crackBpf = ctx.createBiquadFilter();
  crackBpf.type = 'bandpass'; crackBpf.frequency.value = 800; crackBpf.Q.value = 0.5;
  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.35, t);
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDur);
  crackSrc.connect(crackBpf); crackBpf.connect(crackGain); crackGain.connect(compressor);
  crackSrc.start(t); crackSrc.stop(t + crackDur);

  // Layer 5: Main rumble — multi-reflection approach
  // Real thunder: sound bounces off terrain creating overlapping reflections
  // Single brown noise burst sounds too clean/uniform
  const rumbleDur = 2.0 + Math.random() * 2.0; // 2-4s (longer than old 1.5-3s)
  const rumbleBufSize = Math.ceil(ctx.sampleRate * rumbleDur);
  const rumbleBuf = ctx.createBuffer(1, rumbleBufSize, ctx.sampleRate);
  const rd = rumbleBuf.getChannelData(0);
  // 3 overlapping brown-noise "reflections" with different timings and decay rates
  for (let layer = 0; layer < 3; layer++) {
    const layerStart = Math.floor(rumbleBufSize * layer * 0.1 * Math.random());
    const layerDur = rumbleBufSize - layerStart;
    const layerDecay = 1.2 + layer * 0.8 + Math.random() * 0.5;
    let lLast = 0;
    for (let i = 0; i < layerDur; i++) {
      lLast = (lLast + (Math.random() * 2 - 1) * 0.04) / 1.02;
      const pos = i / layerDur;
      const env = Math.exp(-pos * layerDecay);
      // Random "bumps" — louder moments simulating reflections off terrain
      const bump = (Math.random() > 0.985) ? (Math.random() * 0.8 * env) : 0;
      rd[layerStart + i] += (lLast * 4 * env + bump) * (1 - layer * 0.25);
    }
  }
  // Normalize to prevent clipping
  let maxVal = 0;
  for (let i = 0; i < rumbleBufSize; i++) maxVal = Math.max(maxVal, Math.abs(rd[i]));
  if (maxVal > 0) { for (let i = 0; i < rumbleBufSize; i++) rd[i] /= maxVal * 1.2; }
  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = rumbleBuf;
  const rumbleLpf = ctx.createBiquadFilter();
  rumbleLpf.type = 'lowpass'; rumbleLpf.frequency.value = 120; // tighter than old 150
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.5, t + 0.08);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + rumbleDur);
  rumbleSrc.connect(rumbleLpf); rumbleLpf.connect(rumbleGain); rumbleGain.connect(compressor);
  rumbleSrc.start(t); rumbleSrc.stop(t + rumbleDur);

  // Layer 6: Sub-bass boom with descending pitch sweep
  // Real thunder rolls from high to low frequency
  const boom = ctx.createOscillator();
  boom.frequency.setValueAtTime(40, t + 0.1); // start at 40Hz
  boom.frequency.exponentialRampToValueAtTime(18, t + 3.0); // sweep down to 18Hz
  boom.type = 'sine';
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.2, t + 0.1);
  boomGain.gain.exponentialRampToValueAtTime(0.001, t + 3.5); // longer than old 3.0s
  boom.connect(boomGain); boomGain.connect(compressor);
  boom.start(t + 0.1); boom.stop(t + 3.5);

  // Variable interval: sometimes rapid-fire, sometimes long pause
  const nextDelay = 3000 + Math.random() * 9000; // 3-12s (was 5-12s)
  setTimeout(doThunder, nextDelay);
};
doThunder();   // 启动雷声循环(呈现器进入 theme-storm 时调一次)
```

**旧实现 vs 新实现对比：**

| 属性 | 旧（用户反馈"太平静"） | 新 |
|---|---|---|
| 雷声层 | 1 层（brown noise 0.6s） | 3 层（crack + rumble + boom） |
| 雷声增益 | 0.25 | 0.4 + 0.35 crack |
| 雷声时长 | 0.6-1.0s | 1.5-3.0s + 3s boom |
| 风声 | 无 | 粉噪声 + 0.28Hz LFO 阵风 |
| 底噪 | 40Hz sine @ 0.03 | 30Hz sine @ 0.06 + LFO 起伏 |
| 雨声 | 单层 BPF 400Hz @ 0.08 | 双层（600Hz 中频 + 2000Hz 高频） |
| 雷声间隔 | 5-12s | 3-12s |

## 天气 vs 环境音冲突（一个节点只声明一个 bgm）

**核心问题（原理保留）：** 天气环境音（rain/storm）和地点环境音（ocean/beach）若同时播放会互相矛盾——
温柔海浪声 + 轰隆雷声同时出现，很出戏。

**模块化怎么从根上消除这个冲突：** 一个节点的 `audio.bgm` 只有**一个名字**——你为这个节点
**选**哪个主题就出哪个,不存在"两套系统并行"。下雨的海边节点写 `bgm:'theme-rain'`(而非 `theme-ocean`),
风暴里的海难节点写 `bgm:'theme-storm'`,晴朗的海滩节点才写 `bgm:'theme-beach'`。
呈现器 `present()` 的变更检测会在进入新节点时**自动停掉旧 bgm、起新 bgm**(名字变才换、同名不重启),
作者**不写任何切换代码**。冲突在数据模型层就不可能发生。

**节点 → bgm 映射示例（写在各自 `world.js` 节点里）：**
- prologue（海边·下雨）→ `audio:{ bgm:'theme-rain' }` → 只出雨声
- shipwreck（海难·暴风雨）→ `audio:{ bgm:'theme-storm' }` → 只出风暴
- beach_awakening（海滩·晴）→ `audio:{ bgm:'theme-beach' }` → 海滩环境音

(若刻意要"雨打在海面"的叠加感,那就是**一个新主题** `theme-rainy-ocean` 的合成设计——
在呈现器里把雨层和浪层调和成一个连贯结构,而不是让两套循环各跑各的。)

**瞬态音效(雷/撕裂等)走 sfx：** 一次性的雷声若想由节点触发,放该节点的 `audio.sfx:['thunder']`——
sfx 每次 render 触发,是 **fire-and-forget**:接 `master`、用 `exponentialRamp` 在 1-2s 内衰减到 0.0001、
不登记进 bgm 的附属节点,自然衰减后由 GC 回收。**不要把瞬态混进 bgm 的追踪列表**,否则换 bgm 时
`stopBgm()` 会把还在响的雷声一起掐断。

---

### 音频节点生命周期（呈现器内部，避免"换 bgm 误杀正在响的音"）

**关键陷阱(原理保留)：** 换 bgm 时只能停**属于旧 bgm**的节点,不能误杀别的还在响的音。
模块化呈现器用一条简单纪律实现这点:

- **持续型(bgm 及其附属循环)**:`startBgm`/`startAmbient` 创建的振荡器记 `bgmOsc`,
  随它一起停的 LFO / 自调度循环(鸟鸣、雷声 doThunder)登记进 `bgmExtra`(类比上面 forest/storm 的自停守卫)。
  `stopBgm()` 断开 `bgmOsc` + 遍历断开 `bgmExtra` → 干净换主题。
- **瞬态型(sfx)**:`playSfx`/`playRichSfx` 创建的节点**不登记**进上述列表——它们 fire-and-forget,
  自然衰减后回收。所以换 bgm **不会**掐断正在响的撕裂声/雷声。

```js
// 呈现器内(present-audio.js 形状):换主题只清"属于旧主题"的节点
function stopBgm() {
  if (bgmOsc) { try { bgmOsc.stop(); } catch (e) {} try { bgmOsc.disconnect(); } catch (e) {} }
  for (var i = 0; i < bgmExtra.length; i++) {           // LFO / 鸟鸣 / 雷声循环等自停守卫的附属节点
    try { bgmExtra[i].stop(); } catch (e) {} try { bgmExtra[i].disconnect(); } catch (e) {}
  }
  bgmOsc = null; bgmExtra = []; currentBgm = null;
}
// present() 里:desired !== currentBgm 时才 stopBgm()+startBgm() → 换主题
// reset()/重开:enter(start)→render() 把起点快照广播过来,bgm 变更检测自然停/换(core 零改)
```

瞬态 BufferSource(雷/撕裂)不追踪;设计时确保 1-2s 内衰减到 0.0001(exponentialRamp)即可被回收。

---

## 音色库扩展指南(v13;给想超越预设的你)

音乐链路 = **compose-music.js(程序作曲:MusicSpec→音符事件,纯函数)或 midi-music.js(v14:MIDI→同形音符事件)→ present-audio.js(音色库:事件→Web Audio 节点图)**。
三级扩展,由浅入深——**前两级不用改引擎**:

### 级别 1 · 组合现有词汇(写 world.js 就能做)
- `{ preset:'mystery', tempo:72, key:'F' }` 预设基底+微调;`timbre:{ pad:'organ' }` 换音色板;
  完整 MusicSpec 自定进行/动机(`melody:'motif:[0,4,7,4]'`)。词汇表见 audio-system.md。
- 这一级的组合空间:8 调式 × 12 调 × 任意进行 × 6 声部 × 27 个现役音色板(pad 6 / lead 9 / arp 5 / bass 7，含 bass 默认板)× 动机——绝大多数"想要的曲子"在这里就能拼出来。完整词汇以 audio-system.md 为准。

### 级别 2 · 新增音色板(改 present-audio.js,~20 行一个)
音色板 = `pluckVoice/leadVoice/padVoice` 里的一个参数分支。照抄现有板的**配方模式**:
```
选波形(谐波丰富才滤得动)→ 可选 unison detune(±4~7 cents=厚)→ 滤波(+可选滤波包络)→ envADSR → vOut()
```
新板四步:① 在对应 voice 函数加 `pal === '你的板'` 分支 ② `KNOWN` 表登记板名(未知名才 warn)
③ 测试加一条"排定不抛"(照 T7)④ **跑离线诊断页 `_diag-timbre.html`**(改 NAMES 加你的用例)看 峰值/削波/高频比。
**血泪坑(都是实测踩出来的,违反必炸)**:
- **lowpass/highpass 的 Q 单位是 dB!** 正值=截止频率有共振峰。**任何反馈环内的滤波 Q 必须 ≤0**(我们用 -6),
  否则环路增益>1=自激啸叫("KTV 麦克风怼音箱");非环内的共振是乐器味(bass 用 Q=4 的下扫),环内是炸弹。
- **反馈环(Karplus-Strong 类)必须排定杀环**(`fb.gain.setTargetAtTime(0, t+dur, 0.05)`),光 stop 源没用——环自己会一直响。
- `exponentialRampToValueAtTime` **目标不能是 0**(spec 抛错)→ 用 0.0001,或 `setTargetAtTime(0, t, τ)`。
- 每段 ramp 前必须 `setValueAtTime` 锚点,否则从旧排定值起跳=怪滑音/咔哒;所有起停走包络,绝不裸 stop 带电平的振荡器。
- **确定性纪律**:噪声用共享种子 buffer(`sharedNoise()`,固定 44100 生成);一切时间都是 `t = base + 偏移` 绝对排定;不引 `Math.random()`/墙钟。
- **mock 防御**:每个新 API 调用都按现有风格 guard(`if (x.setTargetAtTime) try{...}catch(e){}`)——纯 node 测试用极简 mock,缺能力要优雅降级不崩。**mock 验不了音频数学**(connect(null)、环增益都瞒得过)→ 听感正确性靠诊断页硬指标 + 人工试听,不要只信测试绿。
- DelayNode 环内延迟被 spec 钳 ≥128 采样(≈2.9ms)→ **Karplus-Strong 基频上限 ≈330Hz**,高音备 FM 同族 fallback。

### 级别 3 · 全新音频呈现器(escape hatch)
不想受这套合成器约束(要采样器/AudioWorklet/外部库)→ 写自己的 presenter:`engine.use({ id:'my-audio', install:(api)=>api.addPresenter(snap=>{ /* 读 snap.view.audio 自由发挥 */ }) })`,与内置 present-audio 并存或替换(boot `present:{audio:false}` 关内置)。View 的 `audio` 意图词汇是契约,呈现自由。

### 调试工具链
- `_preview-music-presets.html`(仓库根):全预设+微调样例试听。
- `_diag-timbre.html`:OfflineAudioContext 离线渲染 → 峰值/RMS/削波%/过零率/高频能量比一表;
  headless 跑法:结果压 `document.title`,`--remote-debugging-port` 的 `/json` 端点读回(加 `--no-first-run`)。

---

## 合成踩坑速查(从 audio-system 迁入;扩 present-audio 时必看)

| 坑 | 解 |
|---|---|
| AudioContext 默认 suspended | 首次用户手势 `resume()`(呈现器 plugin 已挂一次性手势监听) |
| 换 bgm 主题的 crossfade 误杀天气音 | 天气节点单独存 `_weatherAudioNodes[]` 数组、独立清理 |
| Thunder 瞬态泄漏内存 | fire-and-forget `BufferSource` + 衰减后 `stop()`;1-2s 内必须降到 0.001 gain |
| 洞穴水声 1200-2000Hz → 像浴室 | 用 600-1000Hz 才像真实洞穴滴水 |
| 海洋用 brown noise → 低频太重 | 改 pink noise,频谱更平衡 |
| `fadeId`/stale 检查模式引 bug | 无条件清理:停掉所有旧节点、重建新的(别靠标志位判活) |
| blanket `stopAudio()` 同时杀主题+天气 | 主题与天气**按正确顺序独立**停 |
| LFO gain 调制有咔哒声 | 先 `setValueAtTime` 再 `linearRampToValueAtTime` |
| 多个 AudioContext | 只建一个,全局复用 `ensureCtx()` 惰性单例 |

## 主线信号流(从 audio-system 迁入)

```
BGM sources    ─→ _audioGain   ─┐
                                ├─→ _compressor(−24dB, 12:1) ─→ destination
Weather sources─→ _weatherGain ─┘
```
压缩器让响瞬态(雷裂)不削波,同时保持环境层可闻。
