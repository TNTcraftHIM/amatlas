# cutscene 过场演出 · 作者手册

给 intro / outro / 结局 / 章节过渡做「按时间轴自动推进的演出」:黑幕起乐 → 字幕浮现 → 场景亮起 → 等玩家确认。
范例照抄 `examples/cutscene-demo`:这是唯一正式 cutscene example,主体保持普通文字冒险,开局、关键剧情和结尾才由 cutscene 临时接管舞台。设计原理见仓库 `docs/cutscene-design.md`(端用户包里没有,不影响使用)。

## 一分钟上手

```js
intro: {
  kind: 'cutscene', title: '序章',
  beats: [
    { dur: 3, text: '海雾压低了海岸线。浪声像从黑幕背后涌来。',       // 第 0 拍:3 秒;文字自足,首拍静音也能读懂
      scene: { region: 'night', mood: 'tense' },                      // 外层 CSS 舞台已给画幅感,不要再叠内部黑边
      audio: { music: 'elegy', ambient: 'waves' } },                  // 主轨 + BGS/环境声同起
    { dur: 4, text: ['灯塔沉默了三十年。', '今晚,雾里先亮起一条裂缝。'] }, // 不写 scene/audio = 画面延续、音乐/ambient 继续
    { dur: 4, text: '白光扫过海面。', scene: { region: 'sea', mood: 'mystic' } },      // 换 scene = 重建出场
    { hold: true, text: '点「▸」结束演出,或选择下方出口进入。',           // hold = 等玩家确认,不计时
      run: function (S) { S.flags.intro_seen = true; } }              // 状态副作用(进入该拍时执行)
  ],
  links: [{ to: 'harbor', label: '进入游戏' }]                         // 出口:必须用 links(见坑 #2)
},
harbor: {
  kind: 'scene', title: '港口',
  audio: { music: false, ambient: false },                            // 过场主轨/海浪不该串到正文 → 显式停
  look: '港口安静下来。'
}
```

world 里出现 `kind:'cutscene'` → `Amatlas.boot` 自动拉过场模块(manifest 零新增键);index.html 加一行
`<script src="../modules/cutscene/runtime/cutscene.js"></script>`(漏引会 fail-loud 指路)。

## 字段表(仅字段存在才校验;违约 throw 点名正确形态)

| 字段 | 类型 | 语义 |
|---|---|---|
| `dur` | 有限正数,**单位秒** | 本拍持续时长,到点自动进下一拍。**别写毫秒**(`dur:3000` = 50 分钟一拍,引擎不猜你的意图) |
| `hold` | 布尔 | `true` = 本拍不计时,等玩家点「▸」才推进(文字重的拍推荐用;也满足无障碍定时可调)。与 dur 同写时 **hold 优先、dur 被忽略**(会 warn) |
| `text` | string \| string[] | 本拍字幕(数组=多行);不写 = 本拍无字幕。当前版本是整句出现;typewriter/逐字打出是后续单独设计,不是本轮 runtime 能力 |
| `scene` | scene 意图对象 | 与 `node.scene` 同词汇(region/mood/elements/transition)。**不写 = 继承上一拍**(画面字节不变 → SMIL 动画相位连续不闪);写了新的 = 整图重建出场(region/mood/elements 任一变都重建) |
| `audio` | audio 意图对象 | 与 `node.audio` 同词汇。**不写 = 全继承**(主轨/ambient 继续播);主轨是 `music` 或 `bgm` 二选一,`ambient` 是可并行的 BGS/空间声;要停主轨写 `music:false`,要停环境声写 `ambient:false`。`sfx` 是逐渲染一次性(该拍每次被渲染都响;要"全局只响一次"改用 run 置 flag 门控) |
| `run` | `(state)=>void` | 该拍开始时执行一次的状态副作用(置 flag / 给物品)。**有账本防重复**:重看/读档重播不再执行 |

玩家动作面(引擎自动给,不用写):首拍/中间拍只有「▸」= 立即进入下一拍；**到最后一拍才出现 `links` 出口**。玩家可连续点 ▸ 逐拍快进，但不能绕过中间拍的 `run` 直接离场；没有“锁住必看”的开关。

## 沉浸过场配方(制图师式舞台感)

沉浸感不是“强制玩家看完”,而是舞台、声场、文字节奏和可跳过信任一起工作。

1. **第一拍建立舞台**
   - 优先让外层 CSS 舞台负责画幅与留白;如果页面已经是 21:9 舞台,不要再叠 `scene.elements:[{kind:'letterbox'}]`,否则会出现双重黑边;
   - 用深色/夜色/mystic/tense 这类 region+mood 建立气质;
   - 首拍文字必须自足:浏览器音频可能因为 autoplay 策略在第一次点击/按键前静音,关键剧情不能只靠声音。

2. **声音分层要写准**
   - 主轨只选一个:`music:'elegy'` 或 `bgm:'ambient-unease'`。不要写成“music + bgm 双主轨”。
   - `ambient:'waves'` / `ambient:'rain'` 是 BGS/空间声,可以和主轨并行。
   - `sfx` 用来点关键事件,不要每拍滥用;它是逐 render 一次性,不负责长期氛围。

3. **离开过场要收声**
   - `audio` 缺省继承是好事:中间拍不写,音乐/海浪就连续不断。
   - 但正文若不该继续过场主轨或海浪/雨声,必须显式 `music:false` / `ambient:false`,或换成正文主轨/环境。
   - 范本推荐在过场后的第一个正文节点写 `audio:{ music:false, ambient:false }`,最清楚。

4. **全屏观感靠 CSS,不是删按钮**
   - `#choices` 是「▸」和出口的挂载点,不可删除、不可 `display:none`、不可 `pointer-events:none`。
   - 可以用 CSS 把按钮悬浮到画面下方、做半透明、做胶囊形,但必须可见、可点、Tab 能聚焦。
   - 如果写 CSS 动画,给 `@media (prefers-reduced-motion: reduce)` 降级。

5. **文字节奏先靠 beats**
   - 当前 runtime 没有 typewriter。想做节奏,用短句、多拍、hold 和黑幕/亮场变化。
   - 真正的逐字打出会碰焦点、读屏、`sfx` 重播、text speed 偏好,必须另开设计。

## run 与逐拍快进(最重要的心智)

**每次进入一拍才执行该拍的 `run`**。连续点击「▸」只是把等待时间压到零，仍按顺序经过每一拍；末拍前没有出口可绕开中间状态。因此:

- 剧情后果(开 flag / 给物品 / 解锁)**全写在对应 beats[i].run 里**；无论自然播放还是连续快进，都会按拍顺序执行。
- 手动点 ▸ 进入目标拍时，目标 `run` 成功后才提交游标和账本；抛错则停在原拍、出口仍隐藏，可修复后重试。自动播放为避免每帧无限重试，保留“记录错误但进入目标拍并继续时间轴”的容错；失败 run 在抛错前已写的副作用无法自动回滚，所以 run 内先校验、后改状态。
- 要"每次经过这个节点都执行"的效果(计数器类)→ 写在**进入该节点的 link.run** 或出口 link.run 上；beats 的 run 一个 state 只执行一次。末拍 `link.run` 可返回非空字符串作为本次回应；引擎先在源过场显示回应，再给「继续 →」导航，避免文字被目标节点吃掉。待继续目的地入档，回应文本本身不入档。

## 存档 / 重进语义(有意设计,不是 bug)

- 播放进度(第几拍)**不入档**:刷新 / 读档回到过场节点 = **从头重播**(A/V 重放;run 有账本不重复)。
- save 插件的 `:auto` 槽停在「进入过场那一刻」(拍推进不发 enter);读 `:auto` 从过场头重播。
- 结局过场:`links: []` → 演完停在末拍帧就是结局画面(graph-audit 报 P2 死胡同 = 有意结局,可忽略)。

## 常见坑(每条都有闸或明确症状)

1. **dur 写了毫秒**:`dur: 3000` = 50 分钟。单位是秒,没有运行时猜测。
2. **出口写成 `exits`** → 解析期 throw。cutscene 只认 `links`；`exits` 会被核心在每拍直接并入动作，绕过末拍门控与 `link.run` 回应包装(门控字段 `available` 改 `requires` 即可)。
3. **「看完过场」成就写 `on:'enter'`** → 永不触发(演出期间不再发 enter)。**用 `on:'action'`** 查末拍 run 置的 flag:每拍推进都是 action、都会查(见 `examples/cutscene-demo/game.js`)。
4. **想要拍间"淡入淡出"写 `scene.transition`** → 不生效(transition 只在**进新节点**时播一次,拍间是同节点重渲染)。拍间视觉语言 = 继承(连续)/ 换 scene(重建出场);要黑幕过渡就写一个黑 mood + letterbox 的拍。进出 cutscene 节点时 transition 照常有效。
5. **index.html 删了 `#choices`** → 「▸」和出口没地方渲染、玩家卡死(呈现器找不到挂载点静默 no-op)。要全屏电影观感 → 用 CSS 把 #choices 悬浮到 #scene 上,**别删 id**。
6. **音乐/ambient 串到正文** → 不是 bug,是 v15 继承语义。中间拍不写 audio 会继承;正文不想继承就写 `audio:{ music:false, ambient:false }`、换新主轨/ambient,或只停其中一层。
7. **把 `music` 和 `bgm` 当两条主轨同播** → 错。主轨二选一;要空间声用 `ambient`。
8. **把首拍声音当唯一线索** → 浏览器可能还没解锁音频。关键线索同时写在文字或画面里。
9. **发布后向 beats 中间插/删拍** → 老玩家存档的 run 账本按位置记,会错位(已跑的拍被当没跑/反之)。**只向末尾追加**;要大改就当新节点(换节点 id)。
10. **地图/节点 id 里用 `/` 或 `#`** → 与账本键分隔符冲突,别用(引擎 actionKey 同款约定)。
11. **构建 `--smoke` 的 check4 报"点一下未检测到切换"警告** → 对 cutscene 页**属预期**(jsdom 的限帧 rAF 驱动不了拍推进),不是失败、不阻断构建;真机/双击核实即可。
12. **提前用 CSS/脚本伪造出口** → 会绕过末拍门控。中间拍只保留标准「▸」；末拍出现的 `.choice.move` 才可按作品气质调整透明度/位置，但不能隐藏。

## 配方速查

- **intro**:第 0 拍 CSS 舞台 + music/bgm 主轨 + ambient 空间声 + 字幕 → 中间拍换字幕(继承 scene/audio)→ 场景亮起拍(换 scene)→ 末拍 hold + run 置 flag;`links` 指向正文,正文显式 `music:false` / `ambient:false` 或换正文声场。
- **结局 / outro**:`links: []`,末拍 hold(结局画面常驻);run 置 `story_done` 类 flag 供成就查。若不想沿用上个场景声场,第一拍写 `ambient:false` 或新 ambient。
- **章节过渡**:正常 links 进出;想要"每章计数"写在进入它的 link.run(见「run 与跳过」第 3 条)。
- **混排**:cutscene 与 scene/encounter/maze3d 自由连接(links 是全 kind 通用出口);过场里不做检定/移动,那是正文节点的事。
