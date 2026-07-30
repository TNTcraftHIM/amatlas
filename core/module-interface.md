# 模块 ↔ 核心 契约 (Module Interface) v43

> blueprint v2 的落地接口:**核心(类型无关)与模块(类型相关)如何分工、如何对接**。
> **v3 状态(S8.5)**:在 v2 基础上**叠加**统一插件入口 `use(plugin)` + 多呈现器 `addPresenter`(已由 `core/test/plugin.test.cjs` 验证)
> 与 View 的 `scene`/`audio` **意图词汇**(可选;**S9 跑团验证并定稿**主词汇、**S10 恐怖 demo 验证并定稿 `scene.transition`**,见 §4.2)。**向后兼容**:registerModule / `onRender:fn` / 既有 View 形状全保留(见 §2.2 · §4.2 · §4.6 · §九)。
> **v2 状态**:已由第一个实现(文字冒险模块,S2/S3)**验证并据此定稿**——本文如实反映
> `core/runtime/engine-core.js` 与 `modules/text-adventure/runtime/renderer.js` 的真实形状。
> 设计依据:引擎插件系统"经定义良好接口注册、不改核心";ECS"数据(组件)与逻辑(系统)分离";
> 事件总线松耦合;render/update 分离(View=f(State));RNG 种子化便于存档重放与确定性测试。
>
> **实现锚点(可对照核验)**:核心 `core/runtime/engine-core.js`;文字冒险模块 `modules/text-adventure/runtime/renderer.js`;
> 默认呈现器 `presenters/present-dom.js`;断言 `core/test/`、`modules/text-adventure/test/`(`node test/run.cjs`)。
>
> **v1→v2 变更**:① 移动连接的真实字段是 `node.exits[]`(数组),非 v1 写的裸 `to`;② 模块自有连接走 `node.links[]`;
> ③ View 真实形状是 `{mapname,title,body,status}`,补全 v1 缺的 `mapname/status`;④ 补 `_once`(核心一次性动作账本)
> 与模块 `_eventsDone`(一次性 beat 账本);⑤ 写明 `locked/showWhenLocked/lockHint` 灰显约定;⑥ 记录 `clock.t` 0 起算的决定。
>
> **v2→v3 变更(S8.5,全部向后兼容叠加)**:① 新增统一插件入口 `use(plugin)`(函数/对象/数组三形态),`registerModule` 保留为玩法插件特例(§2.2);
> ② 呈现 `opts.onRender` 单数 → `addPresenter` 多呈现器广播,旧式 `onRender:fn` 成为 `presenters[0]`(§4.6);
> ③ View 新增**可选** `scene`/`audio` 意图词汇,**核心零改、原样透传**(§4.2);④ `api` 增 `use`/`addPresenter`(§九)。**v3 定稿**:`region/mood/elements{kind,ref,state}/bgm/sfx`(S9 跑团验证)+ `scene.transition`(S10 恐怖 demo 验证,值 `fade`/`slam`/`cut`)**全部冻结**。
>
> **v3→v4 变更(S11-b-ex,注册面统一;语义不变)**:① **所有 `create<Thing>` 工厂返回 use-able 插件**(带 `install`)——模块/呈现器/能力插件**同一形态**,一律经 `engine.use(create<Thing>(opts))` 注册(§2.2 · §4.6);`registerModule`/`addPresenter` 降为 `install` 调用的**底层原语**(仍在 §九,但非教学路径)。② 命名空间合并为单一 **`Amatlas`**(`Amatlas.createEngine`;原 `AtlasCore` 双全局已删)。③ 通用 DOM 呈现器归位 `presenters/present-dom.js`、导出 **`Amatlas.DomPresenter`**(原 `TextAdventurePresenter`);presenter 删 `.plugin`、DOM 折叠 `attach`;挂载点参数统一 `slot`。④ **早期「向后兼容铁律」(renderer/present-dom/核心导出零改)按现实解除**——引擎从未发布、无外部依赖,前提不成立,故本次为 clean-cut 而非叠加 alias。**核心算法逻辑与本契约语义(nodeKinds/render/actions/systems)零改。**
>
> **v4→v5 变更**:新增声明式初始状态 `world.initState`(§3.1);`freshState` 首次读它合并初值,**纯增、向后兼容**(无 `initState` 的世界行为不变)。
> **v5→v6 变更(round7,向后兼容纯增)**:`links` 与 `exits` 统一为**通用「出口/连接」**——核心新增 `api.linkActions(node,state)`(把原文字冒险模块内的 `links`→动作逻辑上移为单一真相),**任何 `kind`/模块都可用 `links`**(scene/encounter…)。修复 encounter 误用 `links` 时检定后静默无出口的设计债(§4.4)。原 `exits`、原 scene `links` 行为不变;另把「检定/成就字段别名」与「自动游玩走入 soft-lock 死节点」纳入 fail-loud(§4.7)。
>
> **v6→v7 变更**:`scene.elements` 的 dice 元素加可选 `sides`(骰子面数 → presenter 选骰形;**纯增、向后兼容**,见 §4.2)。
> **v7→v8 变更(audio-strategy §10,向后兼容纯增)**:新增 `audio.ambient`(环境音/BGS),取 **Preset 名 | AmbientSpec 对象** 二元——**与 `audio.music`/`audio.bgm` 并行叠加**(独立声景层 → "音乐 + 环境音同响")。预设名 = few-shot 锚点(13 个,照抄就对);AmbientSpec = 强模型组合面(layers/transients 原语拼下游专属声景)。**fail-loud**:未知预设名 / 非法 spec → 抛(§4.2 · §4.7)。**core 零改**(`view()` 仍原样透传,核心不读 `audio.ambient`);消费在 `present-audio.js` 呈现器(`resolveAmbient`/`buildAmbience`/`startAmbience`),仅 presenter 内部 + 测试。
>
> **v8→v9 变更(scene 物件具体化,向后兼容纯增)**:`scene.elements[].art`(可选)= **Preset 名(string)| art-spec DSL(图元数组)** 二元——把抽象 glyph(character→圆 / item→方)替换为具体物件。预设图标(~14:ship/lantern/altar/tree/key/chest/sword/fire/statue/crystal/well/skull/book/potion)= **意图非素材**的 few-shot 锚(照抄就对);art-spec = **焦点物件的创作内容/escape hatch**(受限图元 DSL「约束形式放开内容」,守 §11)。**fail-loud**:非法 art-spec(未知 shape / 缺必需 attr / 数值非数 / 非颜色串 / 含 `on*`·`<script`·`href`·`url(`·`<` 注入面)→ 抛;**未知预设名 → 退化该 kind 的 glyph + `console.warn`(不抛**,视觉降级可接受)。**core 零改**(`view()` 仍原样透传,核心不读 `art`);消费在 `present-svg.js`(`renderElementArt`/`renderArtSpec`/`ART_PRESETS`),仅 presenter 内部 + 测试。**与 `audio.ambient`/`audio.music` 的 Preset|Spec 二元一致**(§4.2 · §4.7)。
>
> **v9→v10 变更(link.run 回应对称,向后兼容纯增)**:`link.run` 签名 `(state)=>void` → `(state)=>void|string`——**返回字符串 = 本次回应文本**(text-adventure 模块捕获入 beat、随下帧显示;与 `event.run` 返回语义**对称**)。缘起 round12 实测:连续两局强模型都自然给 link.run 写 `return '叙事回应'`(对称直觉),旧引擎丢弃返回值 → 纯动作点击零可见反馈(fail-silent 接缝)。**core 算法零改**(dispatch 仍只调 run;捕获在模块 `actions()` 包装层),仅 fail-loud 文案同步。配套:graph-audit 新增 P1「可无限刷属性」(无 once/requires 的纯动作增益链接;查形式门控、有意磨练可忽略)。
>
> **v10→v11 变更(数据层对称穷举,全引擎审计批;向后兼容收紧)**:① **字段放错对象 → fail-loud**:exit 上写 links 的字段(`requires/run/once/lockHint/showWhenLocked`)→ `defaultMoves` 即抛(旧版静默忽略=锁消失/副作用丢/once 无效);link 上写 `available`(exits 的字段)→ `linkActions` 即抛(旧版被注入的恒真过滤器覆盖=门控静默失效);scene 节点写 `checks`(跑团字段)→ text-adventure `actions()` 即抛(旧版检定按钮静默消失)。三者均经全仓 sweep 证零合法用法(零误报);graph-audit 静态同步(前两者 P0、scene+checks P1〔自定义模块可合法消费=有合法反例,§11.2〕)。② **encounter 回应对称**:tabletop 也包装捕获 `link.run` 返回串 → `{type:'outcome'}` 行显示(v10 只有 text-adventure 捕获=契约写通用、实现守一半,违自家 §9;现两模块逐字对称,**新模块复用 `linkActions` 时必须同样捕获**,见 plugin-development.md)。③ 文档对账:标题版本号(此前漂移停在 v9)、changelog 改回时间序、§4.1「links 核心一概不读」与 §4.5「策略属于模块」两处与 v6 实现的矛盾修正。**核心状态机/dispatch 零改**(仅 defaultMoves/linkActions 边界校验)。
>
> **v11→v12 变更(检定后果分支,调研定稿;向后兼容纯增)**:tabletop `checks[].success/fail` 各加可选 **`to`**(`'nodeId'` 同图 | `{map,node}` 跨图)——**检定结果直接移动**,先结算 text/set/flag/clock 再移动(目的地节点的 look/requires 读到结算后状态)。**调研依据**(双代理 WebSearch 核实):六家叙事引擎(Ink 条件 divert / ChoiceScript \*if+\*goto / Harlowe (if:)+(go-to:) / SugarCube / StoryNexus challenge 双 outcome 各带目的地 / Disco Elysium 红白检定原生双出边)**无一禁止「结果→目的地」**;fail forward 理论(PbtA miss=GM move、Blades worse-position=fail.to 原型)+ 两条反面实绩(Fallen London 早期"失败只扣值原地重试"磨档恶评、ChoiceScript delayed-branching"全押数值"表达力受损)。命名用 `to` = 与 exits/links 同概念同名(round7 #5 反向适用)。**实现零核心改**:模块在 run 内按掷骰结果把目的地补到自产 action 的 `to`(核心 `apply` 在 run **之后**才读 `action.to` → 走标准移动路径:单渲染+到达 events+自动存档;此「run 内动态补 to」为模块合法手法)。**fail-loud**:success/fail 未知键(typo 如 `sets`、别名 goto/target/next 等)→ 抛教正名;`to` 形态错 → 抛。**闸随契约进化**:graph-audit 把 success.to/fail.to 计入图边(不计会把"只能靠检定到达"的节点误报不可达 + 死分支漏报);普通检定边**不算**保底出口(可失败/可耗尽),唯「整分支检定」(双 to、无 cost/available、success 不置隐藏 flag = 必然移动且重访仍在)豁免无保底检查(§11.2 零误报)。
>
> **v12→v13 变更(音色库,向后兼容纯增)**:`audio.music` 的 MusicSpec 加可选 **`timbre`**(音色板:`{pad:'warm'|'organ'|'air', lead:'soft'|'pulse'|'bell'|'pluck', arp:'pluck'|'bell'|'soft'}`;13 个预设已各自带好)。缘起端用户实测:"风格变了音色没变,还是 8bit"——旧版全声部=单裸振荡器+指数衰减。**呈现器音色库重做**(调研双源核实参数,纯 presenter 内部):pad=detune 锯齿 unison+低通+慢 ADSR / PeriodicWave 加法谐波管风琴 / bass=滤波包络下扫+正弦 sub / arp 默认 **Karplus-Strong 真拨弦**(延迟环反馈;≤330Hz,高音转 2-op FM 拨弦)/ lead=pulse〔**注:do-now 2026-06-21 已升级为真 PWM:锯齿→WaveShaper sign 整形 + 0.28Hz 占空比 LFO,替此处旧述"双方波 detune"近似;见 present-audio**〕 · FM 铃 / 鼓=正弦 150Hz 扫频 kick+噪声 click · 高通噪声+三角鼓体 snare · 7kHz 高通噪声 hihat / master 尾端挂 DynamicsCompressor 防削波。**fail-loud**:timbre 非对象/值非串 → 抛;**板名开放**(未知名 warn+回退默认,同 art 未知预设先例)。**注**:`timbre.<role>` 只对 `instruments` 列表内的声部生效——指向列表外的声部(如对 `sacral`〔instruments=pad/bass〕设 `timbre:{lead:…}`)= 该声部根本不演奏、音色静默无效,**presenter 会 warn-once**(showcase 实测);要换某声部音色,先确认它在该预设的 `instruments` 里。另:music 对象形 `{preset, timbre}` 的 timbre 是**整体替换**预设自带的 timbre(非逐 key 合并)。**core 零改**(`view()` 原样透传);消费在 compose-music(timbre 校验/透传)+ present-audio(音色库),仅 presenter 内部 + 测试。连带修预设死数据(tense/heroic 声明 perc 但默认 intensity 0.6<鼓门槛 0.7=鼓从未响过 → 补显式 intensity)。
>
> **v13→v14 变更(MIDI 导入 + 音色板扩容,向后兼容纯增)**:`audio.music` 加**第三形态** `{ midi:'<base64 .mid>', loop?(默认循环), gain? }`——零依赖 SMF 解析器(`presenters/midi-music.js`,规范级:VLQ/running status/变速段累计/format 0·1/SMPTE/GM 128 program 折表/ch10 鼓映射)把 MIDI 解析成与 compose-music 同形的音符事件,喂 v13 音色库发声 → **作者/下游 AI 可用任何 MIDI 工具产出复杂音乐,base64 一行嵌进 world.js**(单 HTML/离线/确定性排定;滚动窗分批排定防长曲卡顿)。**fail-loud**:坏文件(非 SMF/format 2/division 0/截断/超 65536 音符)→ 抛;给了 midi 但漏引 midi-music.js → 抛教加 script。音色板扩容:pad 加 `strings`(弦乐合奏)、lead 加 `brass`(铜管,滤波包络上扫)、arp/lead 加 `harp`(竖琴,柔 burst 长延音);heroic/pastoral/mystery 预设吃上。**v14 续(MIDI 表现力扩展 · presenter 内 · 零新公共字段 · 确定性)**:GM 折表接通"已造但 MIDI 够不到"的音色板(Choir 52-54→人声 formant / Reed 64-71→簧管 / Pipe 72-79→长笛 / Kalimba 108)+ 新增定音鼓**音高膜鸣** timpaniVoice(Timpani 47 / Taiko 116 / Mel-Tom 117,旧折 kick 钉死 150Hz 丢音高)+ honor 混音 CC:CC7 音量·CC11 表情(乘性平方衰减,GM 默认 CC7=100)·CC10 声像(解析层 `pan` 存**忠实** -1..+1;**渲染层**按 `MIDI_PAN_WIDTH=0.6` 收窄宽度=治"独奏暴露段偏一侧"〔卡农交错进入开头通奏低音独奏偏右〕、保合奏分离;混音缩放并入 `gain`,**公共契约仍仅 `audio.music.midi`**);旧 2 万上限误杀真·交响(BWV1066=20248 音符)→ 抬至 65536(滚动窗兜底播放成本、与音符数无关)。**core 零改**;消费在 presenters(midi-music/present-audio)+ 测试(midi-music.test 22 / present-audio Y 段)。扩展教程:audio-advanced.md「音色库扩展指南」(三级:组合词汇/新增音色板~20 行/全新呈现器 escape hatch,含 Q-dB 啸叫等血泪坑)。

> **v14→v15 变更(audio 层「缺省继承」· 呈现器语义变更,向后兼容〔现有 demo 可闻不变〕,无新字段)**:present-audio 对 `view.audio` 每层(主轨 `music`⊕`bgm`、`ambient`)的判定从「**键缺失→停**」改为「**键缺失→继承**(不动该层、继续播)/ 值→设置或换 / `false`|`null`→显式停」。`'k' in audio` 判键存在性(renderer 传原始 `node.audio`、键存在性保真;`audio` 整个缺失=全继承)。**动机**:修「节点漏写 audio → 音乐戛然全停 + 整曲重播」毛刺,且让作者**少记一条规则**(默认继承=更省、非新约束;换曲写 `music:'名'`、停曲写 `music:false`、其余不管)。**主轨**:`music` 优先,两键都缺→继承主轨,`music:false` 连带停 `bgm`。**向后兼容**:4 demo 实测可闻不变(每节点写 `bgm`,或 gap 紧跟显式停如 horror-demo `{bgm:null}` 仍停)。**core 状态机/world schema 零改、renderer/tabletop 零改**(只动 present-audio `present()` 层判定);设计稿 `docs/audio-inherit-design.md`。
>
> **v15→v16 变更(跑团检定增强,调研定稿;向后兼容纯增,engine-core 零改)**:tabletop `checks[]` 加四项可选表达力字段,让检定不再纯随机、可被**道具/属性/前序选择**改变(查证 D&D 5e SRD / Blades in the Dark / PbtA / Disco Elysium;设计稿 `docs/tabletop-check-enrichment-design.md`):**① `dice` 接受 `(state)=>'NdS'` 函数形**(条件骰池:`(S)=>S.flags.hasKnife?'2d6':'1d6'` = 没刀几乎不可能、有刀有戏;与 `dc` 函数形同族)**② `advantage`/`disadvantage`**(布尔 或 `(state)=>bool`;**多掷一颗骰、保留最高/最低 N 颗**:`NdS`→`(N+1)dS` 留 N〔2d6→3d6kh2、1d20→2d20kh1 = D&D 5e 优势、= Mongoose Traveller 2E Boon〕;优劣并存抵消=原骰;逐颗经 `api.dice` 累加器→随档复现。**语义 2026-06 精化**:原 v16 实现为「整池掷两次取较高总和」,经设计审计〔交叉验证 D&D/MgT2e/PbtA〕改为骰子层面取舍——对齐真实官方系统、且避免「2d6 两个 sum 并排显示像两颗骰」的端用户困惑,用户确认)**③ `crit`/`fumble`** 后果对象(形态同 success/fail:`text/set/flag/clock/to`;自然最大且成功→走 `crit`、自然最小且失败→走 `fumble`,**无对应分支则降级 success/fail = 缺省零行为变化**;闭合「视觉四态〔v7 金光/红裂〕已有、叙事四态缺失」的对称缺口)**④ `bonus`**(数字 或 `(state)=>number`;道具/状态临时加值,在固定 skill mod 之外,检定行显合并调整值)。**fail-loud**:四字段错形态(dice 非串非函数 / advantage·disadvantage 非 bool 非函数 / bonus 非数非函数 / crit·fumble 非对象或含未知键)→ `actions()` 即抛(对齐 v11/v12 穷举校验)。**core 状态机/dispatch/View 词汇零改**(全在 tabletop 模块 `performCheck` + `actions` 校验);检定 schema 详见 `modules/tabletop/references/tabletop-design.md` §4/§5。
>
> **v16→v17 变更(检定增强续,向后兼容纯增,engine-core 零改)**:tabletop `checks[]` 再加两项(查证 D&D 5e / Blades / PbtA;详见 tabletop-design.md §6):**① `dice` 支持取舍语法 `NdSkhK`/`NdSklK`**(掷 N 颗保留最高〔kh〕/最低〔kl〕K 颗求和;D&D `4d6kh3` 属性生成 / Blades 取最高 / `2d20kh1` 优势骰;parseDice 扩 + `rollSpec` 逐颗经 `api.dice` 累加器掷 → 确定性)**② `partial`(+ 可选 `partialBand`,缺省 2)**=**失败侧的 fail-forward 补偿档**(参照 FATE「succeed at a serious cost」——差一点的失败给带代价的出路;**不是** PbtA 7-9 / Blades 4-5 那种**成功侧**的"成功带代价"):`total ∈ [dc-band, dc)`〔即 `total<DC`、机械上属失败、播失败音效〕且非大失败 → 走 `partial` 后果(形态同 success/fail),检定行标「部分成功」;**opt-in,不声明则无此档=向后兼容**。**fail-loud**:kh/kl 取舍数越界、`partial` 非对象或含未知键、`partialBand` 非数 → 抛。**闸随契约进化**:graph-audit 把 `partial.to` 也计入图边(同 v12/v16 的 success/fail/crit/fumble.to)。**core 状态机/View 词汇零改**(全在 tabletop `performCheck`/`parseDice`/`actions`)。

> **v17→v18 变更(检定结果帧「只继续」· 向后兼容纯增 · engine-core 状态机零改)**:View 加可选 **`suppressExits?:boolean`**——置 `true` 时核心 `view()` 本帧**不**并入 `node.exits` 的默认移动动作(`defaultMoves`),模块 `actions()` 输出即完整动作集。**tabletop** 在检定 / 带回应 link 的「结果帧」(`state._ttPending` 已置=等点「继续 →」走到 `success.to`/`fail.to`)置它 → 结果帧**只剩「继续 →」**。**缘起**(showcase《零号台站》issue④ 跑团对照,亲验 `engine-core.js` view():`defaultMoves(node).concat(custom)` 永远并入 exits、模块无法自行抑制):检定出结果后玩家能改点旁路 exit **绕过 `fail.to` 后果 / 退回去重摇检定**(机械后果 cost/flag/clock 在掷骰刻已结算、被绕的只是作者设计的后果分支路由);连自带 `tabletop-demo` 终局认证都中招=footgun。**精确作用域(零误伤)**:只在检定有 `.to`(`_ttPending` 置)时触发;纯 examine 检定(无 .to)、检定**前**首帧(旁路 exit 仍在=跳过选项保留)、text-adventure(`link.run+to` 立即移动、无"停在原节点的结果帧")**全不受影响**。**顺带消除** wreck_crossing「赢检定后撤退」软锁的成因之一(没法在结果帧撤退了;`:passed` 安全网仍保留供正常重访)。**core 状态机/dispatch/freshState 零改**(仅 `view()` 动作合并边界加一个 `suppressExits` 旁路,同既往"view() 边界"先例);设计稿 `docs/check-result-modal-design.md`。

> **v18→v19 变更(`audio.sfx` 补自定义 spec · 向后兼容纯增 · engine-core/呈现器主体零改)**:`sfx` 数组项从「仅预设名字符串」扩为「**预设名 字符串 | `SfxSpec` 对象**」,补齐 audio 层唯一缺 spec 路的不对称(`music`/`ambient` 早有 spec 对象)。**`SfxSpec`**(全字段可选、各有缺省):`{ type?:'sine'|'square'|'triangle'|'sawtooth', freq?, freqEnd?(扫频), noise?:bool, hpFreq?(noise 高通), dur?, gain?, attack?, decay?, sustain?, release?(ADSR), lpFreq?(低通), distort?(WaveShaper) }`(取 ZzFX 频率/扫频/噪声/ADSR/滤波/失真最高价值子集,**不引入** modulation/bitCrush/delay)。**实现**(present-audio `playSfx` 加对象分支 → `resolveSfx` 校验 + `playSfxSpec` 合成,**复用** `mkOsc`/`mkLp`/`makeDistortionCurve`/`envADSR`;noise 路内联薄版连 master、不进 musicNodes=一次性,区别于 noiseHit 的鼓/音乐总线生命周期)。**fail-loud**:`type` 非波形枚举 / 数值字段非有限数 / `noise` 非布尔 / sfx 项既非字符串非对象 → `playSfx` 抛(对称 `resolveAmbient`)。**向后兼容**:`sfx:['名']` 字符串路径逐字节不变(SFX_SPEC/RICH_SFX 不改);**确定性**(无 `Math.random`/`Date.now`);headless 无 AudioContext 同 no-op 退化。**语义范围**(文档约定、超界**不抛**=守 §11 不约束创意范围):`sustain`/`gain` 期望 `[0,1]`、`dur`/`attack`/`decay`/`release` 期望 `>0`;`noise:true` 走噪声路、`type` 忽略(噪声无波形)。**core 状态机/world schema/renderer 零改**(只动 present-audio `playSfx` 分发);设计稿 `docs/sfx-spec-design.md`。

> **v19→v20 变更(`ambient:'ambient-unease'` 并行 drone · 向后兼容纯增 · engine-core 零改)**
>
> **v20→v21 变更(once 消耗后置 run · 原子性 · engine-core apply 内两行次序对调)**:详见 §4.3「apply 顺序」交叉引用说明。`apply` 改为先 `run(state)` 再记 `_once`——`run` 抛错时 `_once` 不被消耗,动作原子可重点;`run` 成功路径与旧版逐字等价。:把 `'ambient-unease'`(低频不协和 dread drone)注册为 `BGS_BUILD` 第 14 个 ambient 预设 = `audio.ambient` 合法字符串值之一。**语义**:drone 走 BGS 并行层(`bgsMaster`)→ 与 `audio.music` **同时响**(旋律铺底 drone,实现恐怖文档一直承诺的「eerie 旋律 + dread drone 同响」),独立停(停 music 不停 drone;`ambient:false` 独立停 drone)。**缘起**(showcase《回声·深井》头号 bug):作者文档系统教 `audio:{music:'eerie', ambient:'ambient-unease'}`,但旧实现 `ambient-unease` 只在 `RICH_BGM`(`bgm` 主轨)→ `ambient:` 抛(resolveAmbient 不认)、`bgm:` 与 music 同层互斥(只剩 music、drone 被丢)→ 承诺的分层两形态都达不到。**实现**:present-audio 的 `BGS_BUILD` 加 `'ambient-unease'` builder(忠实复刻 `startAmbient` 的 drone 合成——不协和簇+detune+AM+滤波 LFO+sub 心跳+稀疏刺点,种子 PRNG 确定性;出口经 `runBgsBuild`→`bgsMaster` 并行总线、生命周期走 BGS 路与 bgm 隔离)。**双路并存(Option I)**:`bgm:'ambient-unease'` 旧路保留(drone 独奏主轨,4 demo 现用法不变)= drone-only 用例;`ambient:'ambient-unease'` 新增 = drone 铺底+旋律 用例——两个都是正当创作意图。**忠实复刻**=两字段 drone 听感一致(osc 数等价 AU5)。graph-audit 的 ambient 名单从源解析(正则补 `['"]?` 兼容引号键)自动纳入。fail-loud 不变(未知 ambient 名 → 抛)。**core 状态机/world schema/renderer 零改**(消费在 present-audio `BGS_BUILD`);设计稿 `docs/ambient-unease-parallel-design.md`。
>
> **v21→v22 变更(`audio.sfx` 函数形 · 仅首次/条件音效 · 向后兼容纯增 · engine-core/present-audio 零改)**:`sfx` 数组项新增**第三形态** `(state, isFirst) => (string | SfxSpec)[]` 函数——与 `look` 的 `(S, first)` 函数形**完全对称**。**缘起**(showcase《彼岸灯手》#5):作者想「仅首次进入才响一声雷」或「满足条件才响某音效」,但 sfx 是静态声明、每次 render 都播,无条件机制;`event.run` 又拿不到放音手柄。**实现**:text-adventure `renderer` 产出 audio 意图时按 `state`/`isFirst` 求值展开函数项(工厂级 `expandAudioSfx`,与 `resolveLook` 同层同源),喂给 present-audio 的**始终是字面 string/SfxSpec 数组** → **present-audio 零改**(类型无关呈现器只吃解析好的意图,契约 §4.2「意图非素材」)。**行业印证**:Ink/Twine/Ren'Py/RPG Maker 无一把条件放进「播放命令」本身,一律在「生成意图」层判定、播放层只收无条件指令——本方案沿此分层。**fail-loud**:函数项返回非数组 → renderer 即抛(教学提示,同 `resolveLook` 先例)。**向后兼容**:无函数项时原样返回(零拷贝、字节级等价);`sfx:['名']`/SfxSpec 项不变。**core 状态机/world schema/present-audio/tabletop 零改**(仅 `modules/text-adventure/runtime/renderer.js` 的 `expandAudioSfx` + render 调用点);其他模块自产 audio 意图时如需同等能力,在各自 render() 调同名展开。设计稿 `docs/sfx-function-form-design.md`。
>
> **v22→v23 变更(当前节点 kind 的 DOM CSS 事实钩子 · 向后兼容纯增)**:核心 `view()` 的快照信封新增顶层 `nodeKind`(值来自当前 world node 的 `node.kind`),供 presenter 暴露“当前节点类型”这一事实。**它不是模块 View 字段**:模块 `render()` 返回值不变,也不新增 `world.ui/theme/skin`。`present-dom` 每帧把它写到 `<html data-node-kind="…">`,与既有 `data-node/data-map/data-mood/data-region` 同类,用于模板层 CSS 如 `html[data-ui="rust-zine"][data-node-kind="cutscene"] #app{…}`。命名不用泛化的 `data-kind`,避免和 `Action.kind`、`scene.elements[].kind` 等同名概念混淆。**分层约束**:DOM presenter 只消费快照,不回查 `engine.world`;cutscene runtime 不暴露 beat/hold/skip/typewriter 等播放态。设计稿:`docs/ui-skins-design.md` §III.6;作者手册:`docs/ui-skins.md`。
>
> **v23→v24 变更(稳定游戏身份 · 未发布期 clean cut)**:`world.id` 成为必填 UUID v4；它在创建游戏时生成一次，之后不随标题、地图、节点、玩法或构建位置改变，复制 demo 做新游戏时必须换新 UUID。核心默认存档命名空间改为 `amatlas:game:<world.id 小写>`，显式非空 `opts.saveKey` / `manifest.saveKey` 仍可覆盖；核心 API 只读暴露最终 `saveKey`。`Amatlas.boot` 与 SavePlugin/AchievementPlugin 不再各自猜默认键，统一继承核心最终命名空间。缺失/坏 UUID 由 core fail-loud、graph/build P0 拒绝。设计稿:`docs/r2-save-identity-design.md`。
>
> **v24→v25 变更(同步事件 listener 异常边界)**:公共 `api.on(type,fn)` 注册的是旁听 **Observer**；某 observer 抛错时核心逐个 `console.error` 并继续后续 observer、render 与自动存档，避免 `action.run`/`pos`/`seen` 已前进却画面与磁盘停在旧状态。`registerModule(mod)` 的 `systems[]` 则是会读写玩法 state 的**事务参与者**，其异常继续同步抛出，保持模块契约 fail-loud，绝不降级成旁听错误。该边界不承诺回滚 listener 已产生的 DOM/storage 等外部副作用；只保证 observer 异常不再中止核心主事务。
>
> **v25→v26 变更(`node.kind` 所有权唯一)**:`registerModule(mod)` 不再允许两个模块认领同一 `nodeKinds[]` 值，也拒绝同一模块内重复声明。核心会在写入 `modules/kindIndex`、注册 `systems[]` 或调用 `init(api)` 之前完整预检整组 kinds；冲突即同步抛出并点名 kind 与双方模块，被拒模块不留下非冲突 sibling kind、system 或 init 副作用。缘起是旧版后注册者覆盖 render/actions 路由，先注册者 system 却继续运行，形成玩法 split-brain。kind 索引使用无原型字典，`__proto__`/`constructor` 等字符串仍是普通可认领 kind，不污染对象原型。
>
> **v26→v27 变更(模块 `init` 失败回滚核心注册)**:`mod.init(api)` 同步抛错时，`registerModule` 保留原错误并撤销本轮由核心直接写入的 module 记录、kind 所有权和 `systems[]` listener，使同一 kind 可由修正后的替代模块重新注册，失败模块也不会留下幽灵系统。边界只到核心拥有逆操作的注册项：`init` 在抛错前自行写出的 state、DOM/storage、`api.on/use/addPresenter` 等任意副作用无法通用回滚，也不宣称是全局事务；模块应先校验、后做外部副作用。
>
> **v27→v28 变更(核心时钟有限非负推进量)**:`api.clock.advance()` 省略参数仍为 `+1`；显式参数只接受有限非负 number，合法 `0`/小数/正数均可，负数、`NaN`、`±Infinity`、字符串、`null`、显式 `undefined` 等在修改 `clock.t` 前 fail-loud。坏档形状闸同步拒绝负数/非有限 `clock.t`；tabletop 的 `success/fail/crit/fumble/partial.clock` 在 view 阶段同源预检，避免玩家点击后才污染状态。核心仍是单位无关计数器，不强制整数。
>
> **v28→v29 变更(cutscene 同节点读档从头重播)**:cutscene 播放游标仍不入档；core 的 `load/loadLocal` 会以新 state 引用 hydrate 且不发 `enter`，模块在 render 时据 state 引用变化识别读档。无论旧档落在另一 cutscene 节点还是当前同一节点，都取消旧计时器并把 cursor/elapsed/ended 复位到 beat0；A/V 从头重播，已入 `_cutscene.ran` 账本的 `beat.run` 不重复。普通逐拍 render 沿用同一 state 引用，不会误复位。
>
> **v29→v30 变更(cutscene 跳过失败即停)**:播放中点击出口会按序批执行剩余未记账 `beat.run`；任一 run 同步抛错时立即原样传播，失败拍不记入 `_cutscene.ran`，后续拍与出口自己的 `link.run` 不执行，core `apply` 也不会继续导航。成功路径仍逐拍“run 成功后记账”并与顺播终态一致。该边界不回滚失败 run 在抛错前已写出的 state/DOM/storage 等副作用；它保证的是不把失败伪装成已完成并继续扩大分叉。顺播 tick 的既有容错语义不在本变更内。
>
> **v30→v31 变更(cutscene rAF 会话代次)**:取消/离开/重进/读档时除了 `cancelAnimationFrame(handle)` 还递增内部 timer generation；每次排帧用 wrapper 捕获当前代次，旧回调即使已从浏览器队列出队、在 cancel 后才真正执行，也会因代次失效直接 no-op，不推进新会话 cursor/elapsed，也不在新 rAF 旁重挂幽灵帧。正常每帧续排沿用同一代次，结束/hold/离开生命周期不变。
>
> **v31→v32 变更(cutscene `link.run` 字符串回应对称)**:cutscene 包装出口不再丢弃 `link.run(state)` 返回的非空 string。无回应的移动仍立即导航；有回应的移动先结算 run，把文本作为源过场的一次性 event 帧显示，并把目的地写入 state `_cutscenePending`，本帧只给「继续 →」，点击后走标准 core 导航。pending 目的地入档，刷新/读档不丢继续动作；进入任意新节点时清空。「`link.run` 返回非空 string = 一次性回应文本」的**捕获**语义与 text-adventure/tabletop 一致(v10/v11);但「回应先可见、点『继续 →』再导航」的**两步式延迟跳转**只与 **tabletop**(v18/M2 检定结果可见性 · `_ttPending`)对称——text-adventure 是「`link.run`+`to` **立即移动**、回应显示在目的地节点」(无中间「继续」步,见 v18 明述其「无停在原节点的结果帧」),不属两步式，回应文本本身仍是瞬时帧产物、不入档。
>
> **v32→v33 变更(crawler `view()` 纯读)**:crawler 不再在 render/view 中懒写 `_maze` 或首次读取 `cells[x,y].once` 时写 `_mazeSeen`。迷宫位置仍由 enter system 初始化；极端未初始化读取只用临时起点投影、不提交 state。once 格文本在未见状态下可被重复纯读，真正离开该格（前进或走出口）的 action.run 才提交 `_mazeSeen`；重返后隐藏。由此同一 state 的重复 `view()` 输出一致且序列化字节不变，恢复 `View=f(State)`。
>
> **v33→v34 变更(Achievement presenter 只读 state)**:AchievementPlugin 的 render presenter 不再调用 durable ledger hydrate；它只依据当前 state 刷新按钮。跨周目账本仍在 install 与 `enter/action` 这些明确状态生命周期并入并在解锁时写盘，reset 会由随后的 enter 恢复。`load/loadLocal` 的存档 state 决定本次 snapshot，不允许某个 presenter 在同一广播中途把外部账本写回 state，确保注册顺序前后的 presenter 看到同一个世界。
>
> **v34→v35 变更(tabletop 瞬时帧产物 enter 时清理)**:tabletop 的闭包 `lastCheck`（骰子/结果）与 `pendingMsgs`（link 回应）仍是显示一次、不入档的帧产物；每次 `enter`（包括 reset 回起点与跨节点导航）现在显式清空两者，避免结果在原节点尚未 render 消费时串到新局或下一个未交互 encounter。已入 state 的 `_ttPending` 待继续目的地仍按既有规则在 enter 清空、在读档中保留；完整结果正文跨实例持久化不在本契约内。
>
> **v35→v36 变更(音频规格校验先于能力退化)**
>
> **v36→v37 变更(版本编号空缺 · stub)**:此版本号在历史提交中未记录对应 changelog 条目;若后续查明确有对应变更,请在此补充;若确认为版本号跳跃,保留此 stub 以明示空缺。:`audio.ambient` 的 AmbientSpec/预设名、`audio.sfx[]` 的 SfxSpec/项类型、`audio.music` 的 MusicSpec/MIDI 必须先完成纯数据解析与 fail-loud 校验，再探测/创建 AudioContext。设备没有 Web Audio 时，**合法**音频意图仍静默退化为无声；**非法**规格不得因设备恰好无音频能力而被吞掉，否则同一个游戏会在桌面报作者错误、在无 Web Audio 设备静默放行。MusicSpec 首段复用校验阶段的 `composeMusic(spec,0)` 结果，不重复排一次纯数据；core 仍只透传 audio 意图。
>
> **v37→v38 变更(模块恢复/实时生命周期隔离)**:tabletop 的 `lastCheck/pendingMsgs` 以产生它们的 state 对象为 owner；同一节点 `load/loadLocal/importCode` 换成新 state 引用后，旧瞬时帧不得进入恢复 View，而 state 内 `_ttPending` 仍照档保留。crawler 的纯读投影仍不写 state，但任一转向/前进 action 会在状态转移内部从 `maze.start` 物化缺失的 canonical `_maze[map/node]` 并完成本次动作，不再出现“画面正常、按钮永久 no-op”。cutscene/maze3d/arcade 的 enter 玩法启停改由 `systems[]` critical listener 承担，初始化错误不再被 `api.on` observer 隔离；`api.on` 继续只用于允许失败隔离的旁听逻辑。实时 rAF 以 generation 隔离旧会话，cutscene 真实核心进入首拍只允许一条计时链。顺播 `beat.run` 抛错后继续时间轴的既有签字语义不变。
>
> **v38→v39 变更(音频规格/装配/生命周期收口)**:`audio.sfx` 的外层容器必须是真数组，不能用字符串、对象或 array-like 冒充；AmbientSpec 的 `filter.type` 只接受 Web Audio 八种 `BiquadFilterType`，`filter.freq/q` 与 LFO `rate/depth` 必须为有限 number。浏览器使用 `audio.music` 时必须加载 `presenters/compose-music.js`；可在 `present-audio.js` 前或后加载，呈现器每次发声惰性回查 `Amatlas.composeMusic`，缺依赖持续 fail-loud 且不提交成功 key，assembly-probe 同步报 P1。MIDI 缓存以完整输入字符串为身份，不能用长度/前缀近似。AudioPresenter `dispose()` 幂等撤销 presenter 注册、三类 autoplay 手势 listener、工具栏按钮/onclick，停止音频并关闭 Context；已 dispose 的实例不可再次 install，后续 present 不再建音频资源。合法设备能力缺失仍按 v36 静默退化。
>
> **v39→v40 变更(读档恢复实时会话生命周期)**:`load/loadLocal/importCode` 继续绝不调用 `enter`、不增加 `seen`，但新增模块 critical `restore` system，payload 以 `phase:'deactivate'|'activate'` 显式替换 rAF/listener/canvas/audio/TTS 等瞬时会话；同 map/node 读档也必须换代。恢复顺序是候选 hydrate → deactivate 旧会话 → 切 state → activate 候选 → render → 必要时回写自动档；失败则 best-effort 清当前会话、恢复旧引用、rollback activate 旧会话并重绘。`api.on('restore')` observer 不参与 tentative lifecycle。模块的 deactivate/activate 必须幂等并以 generation 隔离晚到异步回调；核心只补偿按此协议登记的资源，不声称回滚任意网络/第三方 storage/全局单例副作用。设计详见 wrapper `docs/r2-load-lifecycle-design.md`。
>
> **v40→v41 变更(无词吟咏音色 + timbre 规格对账)**:`MusicSpec.timbre.lead` 新增已知板名 **`'chant'`**，语义严格为单线无词吟咏(vocalise-like lead)：复用既有 lead 乐句事件，以 tenor a/e/i/o/u 的 F1–F3 frequency/relative dB/bandwidth 做确定性双元音 formant 运动；不生成歌词/语言，不读取剧情文本，不等于 TTS，也不冒称 Gregorian chant。`pad:'choir'` 仍是 fixed-ah 和声长垫、全局 `sacral` 默认不变。无 BiquadFilter/automation 时分级退化有声；无 AudioContext 仍按 v36 先校验后静默。同期把 §4.2 的 timbre 列表从滞后的 v14 快照校准到 presenter 已实现全集。core 仍只原样透传，变更仅在公共作者词汇/presenter/测试/手册。设计详见 wrapper `docs/chant-timbre-design.md`。
>
> **v41→v42 变更(cutscene 末拍出口门控)**:cutscene 播放中首拍/中间拍只返回 runtime-owned `cutscene:next`，进入最后一拍才附 `node.links`；`ended` 后返回素 links，字符串回应 pending 帧仍只给 continue。v29/v30 的“播放中点出口并批量补执行剩余 beat.run”被本条取代，`batchRemaining` 删除；连续点 ▸ 仍按顺序经过每一拍。手动 next 的目标 `run` 成功后才提交 cursor/账本，失败停在原拍且可重试；自动 rAF tick 保留 v38 已签字的容错，失败后仍进入目标拍并继续时间轴，避免每帧无限重试。`exits` 继续 fail-loud，因为核心会在每拍直接并入它、绕过末拍门控与 link.run 回应包装。core/links 字段形状不变；assembly-probe 只对当前 cutscene 的精确 `cutscene:next` 作有界进度识别。设计详见 wrapper `docs/engine-gallery-decouple-plan.md`。
>
> **v42→v43 变更(R2 二轮:核心 fail-loud 补漏 + 契约补记)**:① `badShape` 补 `rngSeed` 有限整数校验——此前与 `clock.t`/`seen` 同族却独漏 `isFinite`/整数检查,合法 JSON `1e400`→`Infinity`(或非整数)通过校验后在 `rng()` 的 `|0`(ToInt32)里被静默清零/截断、破坏「同档复现」(P0);现拒档 + 当前 state 不动,合法负 int32 仍过(`rng` 的 `|0` 会产生负值,故不加 ≥0)。② `registerModule` 校验 `systems[].on`(非空事件名字符串)与 `run`(函数)——此前零校验,事件名拼错或漏 `run` 会让该 system 永久静默不触发(`non-function run` 仅触发时才抛)(P1);现注册期即抛。③ 补记 v42 既有但未文档化的 fail-loud/事件:`world.seed`/`opts.seed` 非有限整数抛、模块认领 `node.kind` 却无 `render`/`actions` 抛、核心内置事件 `save-rejected`(`{source,reason}`,坏档形状被弃时发)。core 数据模型与合法用法不变,仅收紧对非法输入的拒绝并补齐文档;反向变异测试锁「合法仍过 + 非法被拒」(`core/test/core-runtime.test.cjs` W9/G12/PP)。设计与证据见 wrapper `docs/r2-delta-audit-design.md`。
> 当前 `view()` 快照权威形状见下方 §4.2;上方 vX→vY 只作变更记录。

## 一、职责划分(谁管什么)
| | 核心 (core/runtime,类型无关) | 模块 (modules/<类型>,类型相关) |
|---|---|---|
| 状态 | 拥有**基础状态**(见三)+ 通用组件存储 | 声明并读写**自己的组件**(角色卡/骰子池/坐标…) |
| 世界 | 知道**地图图结构**(maps→nodes→`exits`),用于默认移动/分派/工具 | 定义**节点内容**(对核心是带 `kind` 的不透明数据) |
| 循环 | 驱动**回合/事件循环**:输入 → 状态转移 → 渲染 | —— |
| 呈现 | **不知道**怎么渲染节点;经 **dispatch** 向模块要"视图 + 可用动作" | 提供 `render(state,node)` 与 `actions(state,node)` |
| 玩法 | 提供服务(RNG/时钟/事件总线),运行已注册系统 | 注册**系统/规则**(检定/移动/beat 触发…),经服务组合 |
| 存档 | 序列化整个 `state`(+导出兜底);渲染器/系统是纯代码不入档 | 组件 + 自有账本(如 `_eventsDone`)在 state 里 → 自动随档 |
| 生产 | 通用管线(设计→撰写→校验→构建) | 该类型的 AI 撰写资产(skill/commands/references/校验器;无模板文件,作者照抄 `examples/text-adventure-demo/` 三文件起步) |

一句话:**核心 = 数据驱动状态机 + 地图结构 + 循环 + dispatch + 服务;模块 = 在其上定义"一种节点的含义 + 一套玩法 + 一种呈现"。**

## 二、注册(模块怎么插上来)
```js
core.registerModule({
  id: 'text-adventure',
  nodeKinds: ['scene'],                        // 本模块负责的 node.kind(核心据此建 kind→模块 索引)
  components: { /* 文档用:声明的状态形状;实际存于 state,核心不解释其语义 */ },
  systems:   [ { on: 'enter', run: (state, ev) => {} } ],  // 订阅核心事件(见五);ev 见下
  render:    (state, node) => View,            // 见四:把节点渲染成"呈现无关"的视图描述
  actions:   (state, node) => Action[],        // 见四:本节点此刻的动作(=状态转移);核心再做过滤
  init:      (api) => { /* 可选:存下 api 引用、订阅事件、初始化组件 */ },
});
```
核心遍历到某节点时,按 `node.kind` 查到负责模块,调用其 `render`/`actions`。**核心代码不改**(S3 已验证:文字冒险模块零核心改动插上)。
`init(api)` 收到核心 API(见九);`systems[].run(state, ev)` 的 `ev` 由生命周期携带：`enter` 为 `{pos,node,first}`；`restore` 为 `{phase,source,rollback,from,to,current}`，其中 endpoint 是 `{pos,node,kind}`。`restore` 只管理瞬时运行会话，不表示到访，详见 §五/§六。
**kind 所有权(v26)**:每个 `node.kind` 只能由一个模块认领；跨模块冲突或同一 `nodeKinds` 数组内重复值都在安装任何内容前 fail-loud。若要替换某类节点的实现，装配时只注册替代模块，不同时注册两个 owner；核心不靠“后注册覆盖”表达优先级。
**init 失败(v27)**:`init(api)` 抛错时，核心撤回该模块的 kind 与 systems 注册再原样重抛；但 init 自己产生的任意外部副作用不在可回滚承诺内，因此 init 应先做参数/环境校验，再注册旁听者或触碰 DOM/storage。

### 2.2 统一插件入口 `use(plugin)`(S8.5)
`registerModule` 是"**玩法插件**"的便捷特例。S8.5 起所有扩展——玩法 / 呈现 / 能力——都可经**同一个 `use(plugin)`** 注册(对标 Bevy「一切皆插件」:同一入口,**API 层不区分插件用途**;"呈现/玩法/能力"三分类只是给人看的文档心智模型,插件做什么由它在 `install` 内的行为决定)。
```js
engine.use(function (api) { api.addPresenter(myRender); api.on('enter', track); }); // 函数式
engine.use({ id: 'minimap', install: function (api) { /* … */ } });                 // 对象式(带 id 去重告警)
engine.use([ savePlugin, minimapPlugin, achievementPlugin, inventoryPlugin, resetPlugin ]);  // 数组=插件组(按序安装)
// 能力插件:save(存档)/ minimap(小地图)/ achievement(成就)/ inventory(🎒 物品栏:只读渲染 state.inventory 字符串 ID 数组 + 可选 world.items 显示字典;持久物品由游戏 run 写 state.inventory;fail-loud:initState.inventory 声明了却非数组 → install 抛)/ reset(↻ 重新开始按钮挂 #plugin-bar,工具栏统一;同形态 manifest.reset:true 让 boot 自动挂)
```
- 形态:**函数** `fn(api)` | **对象** `{ id?, install(api) }` | **数组**(插件组)。
- `install(api)` 收到与 `init` 同一套核心 API(§九);插件**自取所需**能力(`addPresenter` 挂呈现、`on/emit` 接事件、`world/state` 读数据、`exportCode` 做存档…)。
- 可选 `id`:**重复 `use` 同 id → 告警但不阻断**(仍 install;借 Bevy 默认去重而 JS 里更宽松)。`use` 返回 `api`(链式)。
- **向后兼容**:`registerModule(mod)` 行为不变、现有调用零改动。
- **玩法模块经 use 注册的惯用法(S11-b-ex 统一)**:`create<X>Module(opts)` 工厂返回的模块对象**带 `install`**(`install(api){ api.registerModule(mod); }`),故直接 `engine.use(create<X>Module(opts))` 即可——**模块/呈现器/能力插件同一注册形态**。`registerModule(mod)` 仍是 `install` 调用的底层原语(可直接用、忽略多出的 `install`),但**不再是教学路径**。这样统一靠"工厂返回 use-able 对象"在外层完成、**`use` 逻辑零改**(不让 `use` 原生识别模块形状=不改核心算法)。

## 三、状态契约(唯一真相,可序列化)

### 3.0 世界身份 `world.id`(v24)

每个可运行的 world 顶层必须声明一个 UUID v4：

```js
const WORLD = {
  id: '9f65db5a-9a44-4ed0-b87f-1d358f7777e1',
  start: { map: 'coast', node: 'intro' },
  maps: { /* ... */ }
};
```

- 创建游戏时运行 `node -e "console.log(require('crypto').randomUUID())"` 生成一次，之后长期保持；它是游戏身份，不是版本号。
- 改标题、正文、地图、节点、模块或构建位置时不改；复制 demo 另做一款游戏时必须生成新的 UUID。
- 小写/大写输入都合法；核心派生存档命名空间时统一转小写。
- 缺失或不是 UUID v4 时，核心启动即抛，graph/build 同步报 P0；不要拿标题、路径或可变内容哈希代替。

核心 `freshState()` 实际产出(engine-core.js):
```js
state = {
  pos:     { map, node },        // 世界位置 —— "一切基于地图"
  clock:   { unit, t },          // 叙事时间/阶段;unit 默认 'turn';t 从 0 起、单调只增(见五·时钟决定)
  rngSeed: <int32>,              // RNG live 累加器(入档 → 存档逐抽复现;见五·RNG)
  seen:    { 'map/node': n },    // 到访计数(首次/重访由它判定;firstTime = visits<=1)
  flags:   {},                   // 通用布尔事实
  _once:   {}                    // 核心:已消耗的一次性【动作】id → 1(键 = 'map/node#id|label')
  // 模块组件 + 模块自有账本(如文字冒险的 _eventsDone)运行时直接挂到 state 上;核心只负责序列化
}
```

### 3.1 声明式初始状态 `world.initState`(v5)
**自定义状态(体力/理解/物品/预设 flag…)的初始值写在 `world.initState`**,`freshState()` 把它浅合并进上面的默认 state(对齐 Ink 的 `VAR x = 初值` / Twine SugarCube 的 `StoryInit`——叙事引擎的标准做法):
```js
initState: { stamina: 3, understanding: 0, inventory: [], flags: { metGuide: true } }
```
- **为什么必须用它**:不预声明就在 `run`/`events` 里首次 `S.stamina -= 1`,而 `stamina` 从未初始化 → `undefined - 1 = NaN` → 此后所有 `S.stamina >= 1` 门控恒 false → soft-lock(真实事故 S11-b showcase)。**任何被算术读写的自定义数值,务必在 `initState` 给初值**。
- **合并规则**:引擎拥有的字段(`pos/clock/rngSeed/seen/_once`)**不可被覆盖**(写了也忽略);`flags` 做一层合并;其余自定义键**深拷**挂上(reset 后仍是干净初值)。`initState` 是**纯数据**(不放函数)。
- **别和模块资源撞名**:跑团模块的角色卡资源在 `state.sheet.resources.<res>`(由检定 `cost` 增减),与顶层 `initState.<key>` 是**两个独立的值**;同一种"体力"只用其一,别两套同名(否则显示/门控/消耗各读各的 → 永久脱节)。
- **存档**:新游戏 = `initState`;读档时存档值覆盖它 → 玩家进度优先。
- **`_once`(核心)**:一次性**动作**账本。`apply()` 执行带 `once:true` 的动作时记入;`view()` 据此过滤已消耗动作。键 = `actionKey` = `pos.map + '/' + pos.node + '#' + (action.id ?? action.label)`。
- **`_eventsDone`(模块)**:文字冒险的一次性**beat/事件**账本(键 `map/node#eventId`)。**不是核心字段**,由模块在 state 上自建;因在 state 里 → 随档。
- 模块**不得**绕过 state 持有可变游戏状态(否则破坏"状态即真相"与存档)。纯展示/常量、以及**呈现帧产物**(如文字冒险渲染时的瞬时 `pendingBeats`)可留在模块代码里,**有意不入 state**。

## 四、Dispatch 契约(核心↔模块的关键接口)

### 4.1 节点 schema(核心看到什么)
节点对核心是**带 `kind` 的不透明数据**。核心只读两样:
- **`node.kind`**(必需):路由到负责模块。**逐字写**(大小写/空格/拼写敏感);`start()` 预检所有节点 kind,**任一无模块认领 → 启动即抛**(不静默白屏,见 §4.7)。
- **`node.exits[]`**(可选):**核心默认移动**的来源。每项 `{ to, label?, available? }`:
  - `to`:`'nodeId'`(同图)或 `{ map, node }`(跨图传送);
  - 核心 `defaultMoves` 把每个 exit 变成动作 `{ id:'move:i', label, to, available, kind:'move' }`;
  - **fail-loud(v11)**:exit 上写 links 的字段(`requires/run/once/lockHint/showWhenLocked`)→ **view 即抛**(旧版静默忽略=门控失效/副作用丢/一次性出口变无限)。要这些语义就把该出口写进 `links`。
- **`node.links[]`**(可选):核心经 **`api.linkActions(node,state)`** 纯函数解析(v6 上移,见 §4.4)——**核心读 links 但不自动注入**,由模块在 `actions()` 里调用并把结果并入(这保留了模块对动作面的最终控制权)。

其余字段(`name/title/look/events/…`)核心**一概不读**,是**模块私有**约定。文字冒险模块读:`node.look`(内容)、`node.events[]`(进入 beat)、`node.name/title`(标题)。
> 历史注:v6 前本节写「links 核心一概不读」;v6 起 links 的解析逻辑上移核心(`linkActions`),本节文字 v11 才对账修正(审计发现的文档漂移)。

### 4.2 View(呈现无关的视图描述)
`render(state,node)` 返回 View;核心 `view()` 把它包进信封交呈现器:
```js
core.view() => { view: <模块 View>, actions: Action[], pos: { map, node }, nodeKind: string }
```
`nodeKind` 是核心信封元信息,值来自当前节点的 `node.kind`;它给呈现器/模板 CSS 暴露“当前节点类型”这一事实。**它不是模块 View 字段**:模块 `render()` 不需要返回 `kind/nodeKind`,也不要把 UI skin/theme 写进 View。

文字冒险模块的 View 形状(present-dom.js 据此画 DOM):
```js
{ mapname?: string,                    // 地图名(呈现作小标题)
  title?:   string,                    // 节点标题
  body:     [ { type, text }, … ],     // 段落流;type 由模块定,常见 'prose'|'event';呈现器按 type 取样式
  status?:  [ { label?, value }, … ] } // 状态条目(所在地 + 模块/世界自定义位)
```
> View 是**呈现无关**的:同一 View 可由不同"呈现目标"画出——S8.5 已落地三个真实呈现器(HTML `present-dom` 默认 + SVG `present-svg` + Web Audio `present-audio`),S10 进一步压测其演出品质(纯文本/ARIA/canvas 等其它目标同理可加,未实现)。

**▼ S8.5 扩展:`scene` / `audio` 意图词汇(全部可选;契约 **已定稿**——S9 跑团验证)**
模块可在 View 里**声明视觉/听觉意图**,供 SVG / Web Audio 等呈现器消费;不填则该维度无人消费、优雅退化为纯文字。
```js
{ // …上述 mapname/title/body/status 不变…
  scene?: {                                       // 视觉意图(SVG/canvas presenter 消费)
    region?:     string,                          // 场景类型(presenter 映射到具体视觉,如 'beach')
    mood?:       string,                          // 氛围(色调/节奏,如 'tense')
    elements?:   [ { kind, ref?, state?, sides?, art? }, … ],  // 语义元素(如 {kind:'character',ref:'selene'};{kind:'dice',ref:'9',sides:20,state:'success'|'crit'|'fumble'}→presenter 据 state 着色、据 sides 选骰形;art = Preset 名 | art-spec DSL → 具体物件,v9 纯增,见下)
    transition?: 'fade' | 'slam' | 'cut'          // 切换意图(S10 定稿):fade 柔和 / slam 猛烈 / cut 直切;presenter 决定何时/如何放(如 present-svg 按"进了新节点"放一次过场)
  },
  audio?: {                                        // 听觉意图(Web Audio presenter 消费)
    bgm?: string,                                  // 背景音乐意图(名,不是音频数据)
    music?: string | MusicSpec | { midi:'<base64>', loop?, gain? },  // 作曲层(v12-v14):预设名(13 个,照抄锚点)| 结构化乐谱(可带 timbre 音色板)| MIDI 导入;music 优先于 bgm,无 music → bgm 回落(见下 ▼ v12-v14)
    sfx?: [ string | SfxSpec | ((state,isFirst)=>(string|SfxSpec)[]), … ],  // 一次性音效(本次 render 触发);string=预设名;SfxSpec(v19,全字段可选)={type?,freq?,freqEnd?,noise?,hpFreq?,dur?,gain?,attack?,decay?,sustain?,release?,lpFreq?,distort?};函数形(v22)=renderer 层按 state/isFirst 求值展开(仅首次/条件音效),present-audio 收到的始终是字面数组(**仅 text-adventure renderer 展开**;tabletop 等自产 audio 的模块收到字面值——在那些模块要条件音效需在其 render() 自行展开,否则函数原样到 present-audio 会被 fail-loud 拒)
    ambient?: string | AmbientSpec                 // 环境音/BGS(v8,Preset 名 | spec 对象);与 bgm/music **并行叠加**(独立声景层)
  } }
```
- **意图非素材**:模块声明"**要什么**",presenter 决定"**怎么画 / 怎么发声**"。模块/世界数据里**不出现** SVG 路径、音频 buffer、外部 API 调用——换 presenter(SVG↔canvas、合成↔取样)不动世界。依据:bgfx "renderer-agnostic,上层不变";state-stream "presentation 独立消费 simulation 状态包"。
- **presenter 可缺省**:没挂消费者时 `scene`/`audio` 无人读 → 退化为纯文字(可插拔表现力的核心)。
- **核心零改**:`view()` 把模块 render 结果**原样**放进信封(`engine-core.js` 一个字段都不读),故新增字段**不需动核心**。
- **✅ 定稿(S9 跑团 + S10 恐怖 demo 验证)**:`region/mood/elements{kind,ref,state}/bgm/sfx` 由**跑团模块**实用(region/mood→场景与氛围、`elements[].state`→骰子成败着色、bgm/sfx→背景与检定音效);`scene.transition` 由 **S10 恐怖 demo** 实用(`fade`/`slam`/`cut`,presenter 据"进了新节点"放一次过场、纯动作 re-render 不重放);`elements` 这个**通用容器**经 S10 再证可承载演出 overlay——`{kind:'eyes',state:'watching'|'bleeding',ref:'fullscreen'|数量}`、`{kind:'letterbox'}`(眨眼/渗血/画幅黑边的**动画与画法全在 presenter,模块零动画代码**)。**未知 kind/region/mood/名/transition 一律优雅退化**(SVG 未知 kind→circle、未知 transition→不放过场、音频未知名→确定性哈希频率)。故 scene/audio 词汇**全部冻结(含 transition)**。**关键证据**:S10 撑起沉浸级演出**未新增任何契约字段**(只是用足了 `elements`/`mood`/`transition` 的开放词汇)——印证"意图非素材 + 开放词汇"的设计够强。
- **外部素材**(在线图/视频):`scene.elements` 可携带 `{kind:'image', src:'https://…'}`——**不阻止但非默认**;使用外部 URL = **放弃离线保证**。S8.5 的 presenter 只做程序化生成(SVG 画、音频合成);"fetch→内联 / 构建期处理"⏳ 记 backlog。

- **▼ v7 加 `sides`(纯增 · 骰子专属 · 向后兼容)**:dice 元素可带 `sides?: 正整数`(骰子面数)→ 呈现器据此选骰形(d6 等距立方 / d4 三角 / d20 六边形近似;**缺省 → 通用圆角方块,现状不破**)。同时 `state` 这一**开放词汇**约定增 `crit`/`fumble`(自然最大/最小骰 → 呈现器加金光/红裂特效;**非新字段**,未知 state 仍优雅退化为默认色)。**唯一新增字段是 `sides`**;**纯增、向后兼容、engine-core 状态机零改**(`view()` 仍原样透传,核心不读 `sides`)——与 §4.2 既有冻结词汇并存。动机:S11-c Phase 3(骰子素基底 + 可换皮),契约形态经用户确认。

- **▼ v8 加 `audio.ambient`(环境音/BGS · Preset|Spec 二元 · 纯增 · 向后兼容)**:声明**与 bgm/music 并行**的环境音床(海浪/风/雨/火/虫鸣…),实现"音乐 + 环境音同响"。取**预设名(string)| AmbientSpec(object)** 二元(audio-strategy §10:预设=弱模型 few-shot 安全路径,spec=强模型组合面),由 `present-audio.js` 的 `resolveAmbient` 解析(镜像 `resolveMusic`):
  - **预设名(15 个)**:`wind` / `waves` / `rain` / `storm` / `forest` / `stream` / `night` / `campfire` / `town` / `cave` / `snow` / `tavern` / `underwater` / `heartbeat`(心跳低频,紧张/恐怖场景;maze3d 也内部用) / **`ambient-unease`**(v20:低频不协和 dread drone,与 music 并行同响=旋律铺底;另可 `bgm:'ambient-unease'` 作纯 drone 床)。照抄即对;**未知预设名 → 抛**(fail-loud,不静默)。
  - **AmbientSpec(组合规格)**:`{ layers:[{ color:'white'|'pink'|'brown', filter:{type,freq,q?}, gainLfo?:{rate,depth}, filterLfo?:{rate,depth}, pan?, level? }, …], transients?:[{ kind:'droplet'|'crackle'|'cricket'|'bird', density? }], level? }`。强 AI 据底层原语拼下游专属声景(如"暴雨远处篝火 + 近处滴水")。每层 = 着色噪声 → biquad 滤波 →(可选)双 LFO〔增益涌动 / 滤波扫频〕→(可选)声像;`transients` 在床之上撒稀疏短事件。
  - **并行层语义**:`audio.ambient` 与 `audio.bgm`/`audio.music` 各自独立、同时发声(独立 gain 汇 BGS 子总线 → master,不互斥)。`present()` 对 ambient 做**独立变更检测**(键 = 预设名 或 `JSON.stringify(spec)`):变了 → 停旧起新、撤了 → 停。
  - **fail-loud(§4.7)**:未知预设名 / 既非字符串非对象 / `layers` 非数组或空 / layer 缺 `color`|`filter` / `color` 非枚举 / `filter.type` 非 Web Audio 八种 `BiquadFilterType` / `filter.freq`、可选 `filter.q` 非有限 number / `gainLfo`、`filterLfo` 非 `{rate,depth}` 有限 number 对象 / `transients[].kind` 非枚举 → **抛**(带清晰消息)。
  - **core 零改**:`view()` 原样透传,**核心不读 `audio.ambient`**;消费全在 presenter。**纯增、向后兼容**(无 `audio.ambient` 的世界行为不变;无 Web Audio / presenter 未挂 → 优雅退化无声)。

- **▼ v9 加 `scene.elements[].art`(物件具体化 · Preset|Spec 二元 · 纯增 · 向后兼容)**:把抽象 glyph(`character`→圆 / `item`→方 / `hazard`→三角 / `exit`→门)替换为**具体物件**。背景层(剪影/氛围/光/天气/调色/扭曲)已很丰富,`art` 让**主体物件**也具象。element 可选 `art`,取**预设名(string)| art-spec DSL(图元数组)** 二元(与 `audio.ambient`/`audio.music` 一致):
  - **`art: 'ship'`(预设图标锚 = 意图非素材)**:从引擎图标库取(few-shot 可靠锚)。**~14 预设**:`ship` / `lantern` / `altar` / `tree` / `key` / `chest` / `sword` / `fire` / `statue` / `crystal` / `well` / `skull` / `book` / `potion`。照抄即对;**未知预设名 → 退化为该 kind 的 glyph + `console.warn`**(视觉降级可接受、不抛,元素仍渲染出东西)。
  - **`art: [{shape,…},…]`(art-spec DSL = 焦点物件的创作内容/escape hatch)**:强 AI 给受限图元画自定义物件——"约束形式(DSL schema)放开内容(画什么)",守 §11。**非整场手绘**(背景仍呈现器驱动)。图元 `{shape, …attrs}`,`shape ∈ path|circle|rect|line|polygon|ellipse`:
    | shape | 必需 attr |
    |---|---|
    | path | `d`(路径串) |
    | circle | `cx,cy,r` |
    | rect | `x,y,w,h`(→ width/height) |
    | line | `x1,y1,x2,y2` |
    | polygon | `points`(`"x,y x,y…"`) |
    | ellipse | `cx,cy,rx,ry` |
    通用可选:`fill` / `stroke`(颜色串) / `sw`(stroke-width) / `op`(opacity)。
  - **坐标系**:物件**本地居中**,约 **±15 单位(~30px)**;引擎包 `<g transform="translate(slotX,slotY)">` 放到 scene 槽位(同现有 glyph 槽位)。**AI 只管以 (0,0) 为中心画物件**。
  - **不影响特殊 kind**:`dice`/`eyes`/`letterbox` 各有专属渲染;`art` 仅替代普通物件 glyph(dice/eyes/letterbox 上的 `art` 被忽略)。
  - **无 `art`** → 现有 kind→glyph(向后兼容,既有渲染字节守恒)。
  - **fail-loud(§4.7)**:非法 art-spec → **抛**(malformed data);未知预设名 → glyph 退化 + warn(不抛)。**core 零改**(`view()` 原样透传,核心不读 `art`);消费在 `present-svg.js`(`renderElementArt`/`renderArtSpec`,`Amatlas.SvgPresenter` 暴露)。

- **▼ v12–v14 加 `audio.music`(作曲层 · 三形态 · 纯增 · 向后兼容)**:程序作曲配乐(旋律/和声/鼓,比单音色 `bgm` 丰富);**`music` 优先于 `bgm`,无 `music` → `bgm` 回落**(present-audio 变更检测换曲)。由 `compose-music.js` 的 `resolveMusic` 解析,取**三形态**:
  - **预设名(13 个,v12)**:mood 5(`calm`/`tense`/`eerie`/`heroic`/`sad`)+ 题材 8(`pastoral`/`sacral`/`battle`/`mystery`/`festive`/`desolate`/`eastern`/`lullaby`)。照抄即对;**未知预设名 → `console.warn`(warn-once)+ 回退 `calm`**(不抛——配乐降级可接受,同 art 未知预设先例)。另支持 **`{ preset:'名', …覆盖 }` 基底形态**(取该预设为基底再覆盖个别字段,最省事的定制)。
  - **MusicSpec(对象,完全定制)**:`{ mode, key, progression, instruments, intensity, melody, tempo?, timbre? }`;**`timbre` 音色板(v13 起、v41 对账)** 每声部可换发声体——`pad: warm/organ/air/strings/choir/glass`；`lead: soft/pulse/bell/pluck/brass/harp/flute/reed/chant`；`arp: pluck/bell/soft/harp/kalimba`；`bass: sub/organ/upright/picked/synth/sine-pluck`（bass 不写板名时使用默认柔化锯齿）。`lead:'chant'` 是单线**无词吟咏**，`pad:'choir'` 是 fixed-ah 和声长垫，两者可同曲叠加；chant 不生成歌词/语言、不等于 TTS。**板名是开放词但非静默**：未知名 `console.warn` + 回退默认，形态错〔非对象/值非串〕→ 抛。
  - **`{ midi:'<base64>', loop?(默认循环), gain? }`(v14,MIDI 导入)**:零依赖 SMF 解析(`presenters/midi-music.js`)→ 折成与 compose-music 同形的音符事件、喂同一音色库;**index.html 须在 present-audio.js 之前引 `presenters/midi-music.js`**(给了 `midi` 漏引 → 抛;坏文件 → 抛,见 §4.7)。
  - **浏览器装配(v39)**:`audio.music` 三形态都依赖 `presenters/compose-music.js`；它可在 `present-audio.js` **之前或之后**加载（呈现器发声时惰性回查 `Amatlas.composeMusic`），但整页漏引会持续 fail-loud。`{midi}` 另需上条 `midi-music.js`。assembly-probe 对两类遗漏报 P1，因为自定义音频呈现器自行消费 music 是合法反例。
  - **core 零改**:`view()` 原样透传,核心不读 `audio.music`;消费在 compose-music / present-audio / midi-music(纯 presenter + 测试)。
- **▼ v15 各层「缺省继承」**(主轨 `music`⊕`bgm`、`ambient` 通用):节点 `audio` 里**某层键缺失 → 继承**(继续播、不动)/ **键=值 → 设置或换**(同名不重启)/ **键=`false`|`null` → 显式停**。整个 `audio` 缺失 = 全继承。`music` 优先;两键都缺 → 继承主轨;`music:false` 连带停 `bgm`。`sfx` 无继承(一次性)。**作者心智**:换曲 `audio:{music:'tense'}`、停曲 `audio:{music:false}`、不变就别写——音乐自动延续过场,不再「漏写就戛然全停」。

### 4.3 Action(动作 = 状态转移)
核心识别的 Action 字段:
```js
{ label,                       // 必需:显示文字
  id?,                         // 账本/定位用(缺省用 label);once 消耗、点击定位都靠它
  kind?: 'move' | 'act',       // 呈现提示(move 通常带方向样式);核心据 `to` 实际决定是否移动
  to?,                         // 有 → 移动(enter 目标);无 → 纯动作(原地重渲染)
  once?: bool,                 // true → 本次 apply 记入 _once(v21:在 run 成功**之后**,见下「apply 顺序」;run 抛 → 不记 = 动作可重点),此后被 view() 过滤掉
  run?: (state) => void | string,  // 状态转移:改 flags/组件/clock…;**返回 string=本次回应文本**(v10:模块捕获入 beat 显示,与 event.run 对称;此前被忽略)。**`run(S)` 拿到整个 state**,故也可直接读写跨模块组件——如 `S.sheet.resources.incense -= 1`(剧情内资源消耗,无需走 tabletop `checks.cost`;**前提**:`S.sheet` 仅在挂了 tabletop 时存在,纯文字冒险用 `world.initState`+顶层 `S.X`);`state` 是唯一真相,模块间经 state 共享是契约允许的,不破坏模块隔离。
  available?: (state) => bool, // view() 过滤:返回 false 则不出现(缺省视为可用)
  locked?: bool, lockHint? }   // 灰显 affordance(见 4.5);呈现器据此灰显且不接点击
```
核心 `view()` 过滤:`acts = defaultMoves(node) ∪ module.actions(...)`,再剔除 `consumed(once) || available()===false`。
核心 `apply(action)`:`run(state)` → `if(once) 记 _once` → `emit('action')` → **有 `to` 则 `enter`(移动,目标 seen+1),否则原地 `render`+存档**(纯动作不重复 +1 计数)。
> **v20→v21 变更(once 消耗后置 run · 原子性 · engine-core apply 内两行次序对调)**:`apply` 改为**先 `run(state)` 再记 `_once`**——`run` 抛错(world bug)时,`apply` 在记 `_once` **之前**抛 → 该一次性动作**不被消耗、玩家可重点**(原子:抛错时啥都没提交;对齐 Twine SugarCube「出错不消耗」/ Ink「跑完才标已读」)。修旧版「`once` 在 `run` 前记入 → `run` 抛则动作永久消耗但效果没生效;若是必需 once(如拾钥匙)= 永久丢失/软锁」。**`run` 成功路径与旧版逐字等价**(`_once` 仍在 `emit`/`enter` 前设、`actionKey` 不受 run 影响)→ 现有测试(core-runtime B1-B4 等)全守恒;新增 B5/B6(run 抛 → apply 抛 + `_once` 未置,变异换回 once-先序 → B6 红)。**core 状态机算法零改**(仅 apply 内 `run`↔`once` 两行次序);设计稿 `docs/once-postpone-design.md`。**诚实**:此边角仅触发于作者 `run` 有 bug(errorBanner 已 surfaces、作者会修),本改只把失败模式从「永久丢失」改为「原子可重点」——价值低但严格更优。

### 4.4 links 与 exits——统一的「出口/连接」(v6)
两者最终都产出 `{kind:'move', to}` 动作、被 `apply` 同样路由。**v6 起语义统一、任何 `kind`/模块都可用**:
- **`node.exits[]`(核心 `defaultMoves`)**:类型无关的"**普通的门**"。每项 `{to,label?,available?}`,无条件/仅简单 `available`。适合纯地形移动。
- **`node.links[]`(核心 `api.linkActions`)**:带**门控/affordance/副作用**的连接,可带 `requires`/`lockHint`/`showWhenLocked`/`once`/`run`。**核心提供纯函数 `api.linkActions(node,state)` 统一处理**(requires 校验、锁定显隐策略、空场景安全网);文字冒险与跑团 encounter **都在 `actions()` 里调它** → 行为一致、单一真相。
> **v6 之前** `links` 处理藏在文字冒险模块里、`encounter`(跑团)只认核心 `exits` → 作者按文字冒险习惯用 `links` 时**检定后静默无出口、soft-lock**(round7 #5 设计债)。上移到核心 `api.linkActions` 后根除。
> 准则:**普通移动用 `exits`;需要条件/灰显/进入副作用用 `links`;二者任何 kind 可混用。**
> **第三种移动来源(v12)**:tabletop 检定 `checks[].success.to / fail.to`——先结算 text/set/flag/clock 再移动(模块在 run 内动态补 to,走核心标准移动路径:单渲染+到达 events+自动存档);graph-audit 把它计入图边;检定 schema 详见模块文档 tabletop-design.md §4/§4b。
>
> **检定后果 `flag` vs `set` 写在哪(常见混淆)**:两者都写入 `state.flags`(**不是 `state` 顶层**)。`flag:'名'` → `state.flags['名']=true`(只写布尔 true;用于门控/检定隐去);`set:{键:值,…}` → 把每个键写 `state.flags[键]=值`(值任意类型,如数字/字符串)。**读时一律用 `S.flags.X`,不是 `S.X`**——`requires`/`available` 里写顶层 `S.X` 读不到 flag/set 写入的值(它们都落 `state.flags`);顶层自定义数值(体力等)才用 `world.initState` 声明 + `S.X` 读写(见 §3.1)。

### 4.5 锁定显隐策略(locked / showWhenLocked / lockHint)
核心只认 `locked`/`lockHint` 两个**呈现字段**并照传;**策略自 v6 起实现于核心 `linkActions`**(单一真相,模块经 `api.linkActions` 复用;v6 前策略在各模块内,本句 v11 对账修正)。具体策略:
- 不满足 `requires` 且**无** `showWhenLocked` → **隐藏**(防剧透,连项都不给)。
- 不满足 `requires` 且 `showWhenLocked:true` → **灰显**:模块产出 `{locked:true, lockHint, available:()=>true}`——`available` 返真**穿过核心过滤**,呈现器见 `locked` 则灰显、不接 onclick。
- **安全网**:若某节点**无任何可点动作**,模块把被隐藏的锁定项也灰显出来,避免空场景死局(作者仍应保证每节点有无条件出口)。
- **`once`+`requires`+`showWhenLocked` 三者同用的组合**:先判 `requires`——不满足时由 `showWhenLocked` 决定灰显/隐藏(此时不查 `once`);满足且 `once` 未消耗 → 正常可点;满足且 `once` **已消耗** → `view()` 过滤时整条动作**彻底消失(不是灰显)**。即 `showWhenLocked` 只在 `requires` 不满足时生效,与 `once` 消耗的隐藏是两条互不相交的路径。要"消耗后仍给玩家提示",另放一条 `requires:(S)=>S._once['map/node#id']` + `showWhenLocked` 的独立链接。

### 4.6 多呈现器(presenters)——S8.5
呈现从"单数 `opts.onRender`"变为"**可叠加的多个 presenter**":同一 View 快照广播给所有呈现目标(文字 / SVG / 音频…)。
- **注册**:`api.addPresenter(fn)`,`fn(snapshot)` 收 `view()` 信封(`{view, actions, pos, nodeKind}`);返回 `remove()` 以便 teardown(呼应 `on()` 返回 off)。
- **广播**:每次 `render()` **算一次快照**,按**注册顺序**依次调用各 presenter;**各自取所需字段**(文字读 `view.body`、SVG 读 `view.scene`、音频读 `view.audio`),互不覆盖(不同渲染目标)。
- **per-presenter 隔离**:某个 presenter 抛错 → `console.error` 大声报(每次都报、不去重)后**继续广播其余 presenter**,且 `enter/apply` 随后的自动存档不被连坐(否则呈现层 bug 会让其余呈现器全冻 + 玩家进度静默丢失)。fail-loud 不变:错误持续可见,作者期由静态闸(如 graph-audit 的 audio 预设名检查)抓根因。
- **注册形态(S11-b-ex)**:呈现器工厂(`createDomPresenter`/`createSvgPresenter`/`createAudioPresenter`)返回 use-able 插件 `{id, install, present, …}`,经 `engine.use(createXPresenter(opts))` 注册——`install` 内调 `addPresenter`;DOM 呈现器的 `install` 还捕获 `api`(=engine)以接选项点击。**已删** `.plugin` 解包与 DOM 的独立 `attach`。挂载点参数统一 `slot`(`createSvgPresenter({slot})`、各能力插件 `{slot}`)。`createEngine(W, {onRender: fn})` 仍兼容(`fn`→`presenters[0]`)。
- **无 presenter**:`render()` 直接返回、**不触发 `view()` 分派**,保持 logic-only / headless 语义(见 lesson ⑪:dispatch 在 render/view 时才发生;核心测 G2 据此)。
- **顺序约定**:玩法模块先 `use`/注册,呈现/工具插件后注册;`on()` 是同步 Observer → 注册顺序 = 调用顺序,可预测。
- **teardown(S8.5-d 评估结论;v39 收紧)**:bgm 的"重开归零"**无需核心加事件**——`reset()` → `enter(start)` → `render()` 已把起点快照广播给呈现器,bgm 变更检测自然停/换(故 **core 零改**)。仅"整体卸载某呈现器"才需显式清理 → 由呈现器自带 `dispose()`；AudioPresenter 会幂等撤销 `addPresenter()` 返回的注册、autoplay 手势 listener 与工具栏按钮/onclick，再停止 bgm/music/ambient 并关闭 AudioContext。dispose 后不可重装，后续 present 不再建资源。

### 4.7 fail-loud 校验(引擎强制 / 工具检查;`docs/design-principles.md`)
Amatlas 对 **AI 作者**默认 **fail-loud(违约即报),不静默退化**——形式契约违约会被立刻拦下,而非产出坏结果。三档(详见 `docs/design-principles.md`):
- **引擎运行时抛(确定性违约)**:未知 `node.kind`(`start()` 预检)/ **模块认领 `node.kind` 却无 `render`/`actions`**(`registerModule` 抛,否则该 kind 节点静默空渲染)/ **模块 `systems[].on` 非非空事件名串或 `run` 非函数**(`registerModule` 抛,否则该 system 永久静默不触发)/ 死链(`enter` 不存在节点)/ 门控字段(`available`/`requires`/`when`)**存在但非函数**(写成定值/字符串旧版会被当无条件、锁失效)/ 跑团 `dice` 格式非 `NdS` / **`world.seed`·`opts.seed` 非有限整数**(`createEngine` 抛;非整数会被 `>>>0` 静默截断 → 破坏同种子复现)；**字段别名/错形态(round7)**:跑团检定 `check` 用 `name`(应 `label`)·`onSuccess/onFailure`(应 `success`/`fail` 对象)·`skill` 写成函数(应技能名字符串)/ 成就缺 `when` 函数(误用 `check`/`condition` 等别名 → 永不解锁)/ **`audio.ambient`(v8/v39)未知预设名 / 非法 AmbientSpec**(`layers` 非数组或空、layer 缺 `color`|`filter`、`color`/`filter.type`/`transients[].kind` 非枚举、`filter.freq/q` 或 LFO `rate/depth` 非有限 number → 呈现器 `resolveAmbient`/`buildAmbience` 抛)/ **`scene.elements[].art`(v9)非法 art-spec**(未知 `shape` / 缺必需 attr / 数值 attr 非数 / `fill`·`stroke` 非颜色串 / 含 `on*`·`<script`·`href`·`url(`·`<` 注入面 / 空数组或非对象图元 → 呈现器 `renderArtSpec` 抛)/ **字段放错对象(v11)**:exit 写 links 字段(`requires`/`run`/`once`/`lockHint`/`showWhenLocked`)、link 写 `available`、scene 节点写 `checks` → 抛 / **检定分支(v12)**:`checks[].success/fail` 含未知键(`sets`/`goto`/`target` 等别名)或 `to` 形态错 → 抛 / **音乐(v13/v14/v39)**:`timbre` 非对象/值非串、MIDI 坏文件(非 SMF / format 2 / division 0 / 截断 / 超 65536 音符)、给了 music 但漏引 `presenters/compose-music.js`、给了 `{midi}` 但漏引 `presenters/midi-music.js` → 抛 / **检定增强(v16/v17/v39)**:`dice` 非串非函数(或函数形结果非 `NdS`/`kh/kl` 取舍数越界)、`advantage`·`disadvantage` 非 bool 非函数、`bonus` 定值或函数返回非有限 number、`crit`·`fumble`·`partial` 非对象或含未知键、`partialBand` 非数 → `actions()` 抛 / **sfx 自定义 spec(v19/v39)**:`audio.sfx` 外层非数组 / `SfxSpec.type` 非波形枚举 / 数值字段(`freq`/`freqEnd`/`hpFreq`/`dur`/`gain`/`attack`/`decay`/`sustain`/`release`/`lpFreq`/`distort`)非有限数 / `noise` 非布尔 / `sfx[]` 项既非字符串非对象 → 呈现器 `present`/`playSfx`/`resolveSfx` 抛。
- **工具静态/装配拦(P0,接 Stop hook)**:`graph-audit` 死链 / 结构断裂 / 无保底出口(无 `lockHint`)/ **exit 字段错位 · link 写 `available` 静态 P0,`success.to`/`fail.to` 计入图边(v11/v12)**;装配探针 核心挂载点 `#look`/`#choices` 缺 / 起点首屏无动作 / 自动游玩撞运行时 NaN / **自动游玩走入「声明了出口却走不出」的 soft-lock 死节点(round7)**。
- **报告但放行(P1,可疑)**:孤儿 / 死胡同 / 死 flag / 死 state 键 / 未初始化数值字段 / 假选择 / 非核心挂载点缺;运行时 `load`/`saveLocal` 吞了"合法数据却抛错"、跑团坏 `cost.res` / 空检定后果、**`scene.elements[].art` 未知预设名**(退化为 kind 的 glyph)会 `console.warn`;**坏档(v11)**:版本不识/引擎字段形状非法 → `load` 拒绝+warn;**音乐(v13/v14/v39)**:`timbre` 未知板名、`music` 未知预设名 → warn(once)+回退；漏引 compose-music.js 或 `{midi}` 漏引 midi-music.js → 装配探针静态 P1 点名。
> 含义:**违约会被告知**(不靠你猜)。这让你能放手写内容——形式错了闸会拦,内容创意不受限(校验只管"形式正确性",不裁"玩法对不对")。

## 五、服务契约(核心提供,模块/系统调用)
- **RNG**:`api.rng()`→[0,1) 确定性(推进 `state.rngSeed`,mulberry32);`api.dice(n,sides)`。**累加器入档** → 同档逐抽复现、测试可断言。种子由 `opts.seed`/`world.seed`(**有限整数**,省略=默认)一次设定;非整数 fail-loud(见 §4.7)。
- **时钟**:`api.clock.advance(d=1)`(单调 +d)/ 读 `api.clock.t` 或 `state.clock.t`;世界/模块也可直接写 `state.clock.t`(demo 的 nightfall 即直接置 2)。单调只增 → 时间性 beat 天然只触发一次。`advance` 的显式 `d` 必须是有限非负 number，且 `t+d` 的结果也必须有限；省略=`+1`，`0`/小数/正数合法，坏值或溢出在修改 state 前抛。直接写 `state.clock.t` 绕过服务校验，作者需自行维持同一有限非负不变量，读档闸会拒绝不合法值。
  - **决定(0 起算,有意)**:核心 `clock.t` 是**单位无关的单调计数器,从 0 起**(`unit` 默认 `'turn'`)。蓝图/旧 world-engine 的 `start:1`(「第 1 天」)是**那个类型的日历语义**,不是核心不变量。"第几天/第几回合"的**展示**是世界/模块层的事(可 `t→label` 映射,或世界自定义起点),核心不预设 1-based。→ 保持核心类型无关、与数组/多数计数器一致。
- **事件总线**:`api.emit(type,payload)` / `api.on(type,fn)`(同步 Observer,非队列；事件名是开放字符串，`__proto__` 等也按普通键处理)。核心内置事件:`enter`(payload `{pos,node,first}`,移动/启动后)、`action`(payload `{action}`,每次 apply)、`save-rejected`(payload `{source,reason}`,`load`/`loadLocal`/`importCode` 遇坏档形状被弃时触发;呈现层可据此提示玩家「自动续档被忽略」,`source` 区分三入口)。系统间**经事件组合**,互不直接依赖(跑团把"骰子→检定→后果→时钟"用事件串起即此价值)。
  - **异常边界(v25)**:`api.on` listener 是 observer；抛错会逐个报到 `console.error` 后隔离，后续 observer、render、自动存档继续。它适合旁听、UI/插件同步与统计，不拥有中止核心状态转移的权力。
  - `registerModule` 的 `systems[].run(state,ev)` 是玩法事务参与者，不走上述隔离；抛错同步传播，确保坏 `event.when/run` 等模块契约仍 fail-loud。两类虽共享事件顺序，但异常权力不同。
  - `restore` 是例外的核心保留 critical 生命周期：只运行模块 systems，不经 `api.emit` 广播 observer。`deactivate` 停止当前瞬时会话，`activate` 依据当前 state 建立新会话；`source` 区分 `load/loadLocal/importCode`，`rollback:true` 表示失败补偿。模块不得在其中调用 `enter/apply/load/reset` 或制造到访副作用；deactivate 必须幂等，activate 部分失败须先自行 stop 再抛，rAF/异步回调须用 generation 门控。
  - 隔离不是全局事务回滚：observer 或 restore system 抛错前自行写出的网络、第三方 storage、全局单例等外部副作用不可能由核心通用撤销；恢复事务只尽力补偿按 restore 协议登记的实时会话资源。

## 六、存档契约
序列化整个 `state`(含 `pos/clock/rngSeed/seen/flags/_once` + 模块组件 + 模块账本如 `_eventsDone`)。渲染器/系统是**纯代码不入档**;**呈现帧产物有意不入 state**(如 `pendingBeats`,故读档/纯动作不会复放 beat)。
**`file://` 双击运行时 localStorage 可能不可用 → 必须提供"导出成文件/存档码"兜底**(`exportCode`/`importCode`,base64);localStorage 仅作便利。`load/loadLocal/importCode` 只替换持久 state，**绝不 `enter`**(否则把读档误记成一次新到访,污染 `seen`)；v40 起它们在 render 前通过 critical `restore/deactivate→activate` 重建实时会话，同节点也换代。候选生命周期/render/回写失败时核心尽力清候选、恢复旧 state、rollback activate 旧会话并重绘；不承诺回滚模块任意未登记外部副作用。
**存档边界三守则(易用性审计批)**:① `load` 与 `loadLocal` 走**同一道坏档形状闸**(版本不识/引擎自有字段形状非法 → false + 当前状态不动；`clock` 若出现必须是含有限非负 `t` 的非数组对象，不能用 `[]/{}` 绕过；`rngSeed` 若出现必须是**有限整数**（int32；`Infinity`/非整数会在 `rng()` 的 `|0` 里被静默清零/截断 → 拒档）；自动续档是最高频读档通道,不豁免);② `load` 只有在 hydrate+render+自动续档回写全成功后才返回 true；回写失败返回 false 并恢复读档前内存 state(否则「读档成功→刷新」=静默回滚到旧磁盘档);③ `storage` 解析全链 try/catch(隐私模式下连 `typeof localStorage` 求值都抛 SecurityError → 降级 null 不白屏),显式 `storage:null`(关持久化)被尊重、不被 `||` 吞。
**便携存档身份(v37)**:核心存档信封固定为 `{v:2,gameId:<world.id 小写>,state}`。`load`/`loadLocal`/`importCode` 对版本与 `gameId` 使用同一道闸；缺/坏/不匹配均返回 false 且当前 state 不动。`gameId` 绑定可移植内容身份 `world.id`，不绑定可覆盖的 storage `saveKey`：同一游戏内容升级或换嵌入槽位仍能导入自己的档，不同游戏即使地图骨架相同也不能互灌 `flags/_once`。Amatlas 未发布，本次 clean cut 不读取旧 `{v:1,state}`。
**每游戏存档键(v24)**:Chromium 的 `file://` 游戏可能共享可见的 localStorage 空间，因此核心以必填 `world.id` 派生稳定命名空间 `amatlas:game:<uuid 小写>`。`createEngine(W,{saveKey})` / `manifest.saveKey` 只在嵌入或人工迁移时作为显式非空 override；正常游戏省略它。核心只读 `api.saveKey` 是最终键的单一真相，`Amatlas.boot` 和手写插件装配都从这里继承：核心断点续传写裸键，SavePlugin 写 `<saveKey>:auto` / `<saveKey>:slot:N`，AchievementPlugin 写 `<saveKey>:ach`。内容升级不换 key；复制 demo 做新游戏则必须换 `world.id`。成就账本跨 reset 保留、不入 state 档。

## 七、构建契约(对接 pipeline/build)
一个游戏的**运行时** = 核心 + 所选模块运行时 + 该游戏**数据**(WORLD + 配置)。**源码模块化**(数据/内容/配置分文件,便于 AI 改与审);**构建**(S6)把三者内联成**一个 all-in-one HTML**(原则④)。`test/inline-demo.cjs` 是该内联思路的最小预演。

## 八、与早期原型 world-engine 的对应(历史:确保 S2/S3 是"抽取+抽象"而非重写)
早期单文件原型 world-engine(已被本模块化设计取代)的 `pos / seen / flags / maps / nodes / save` → 进核心;`look` → 模块 `render`;
**`to`(普通连接)→ 核心 `node.exits[]` 默认移动;`links`(带条件/副作用的连接)→ 模块 `node.links[]` + 模块 `actions`**;
`events` → 模块系统(`on:'enter'` 跑 beat)。**新增**:dispatch 抽象、RNG/事件总线、导出兜底、`_once`/`_eventsDone` 账本。

## 九、核心 API(`init(api)` / `start()` 拿到的句柄)
`registerModule, use, addPresenter, start, enter, apply, view, reset, firstTime, visits, linkActions, rng, dice, clock, on, off, emit, serialize, load, loadLocal, saveLocal, exportCode, importCode, world, saveKey`,以及只读 `state`(getter)。其中 **`saveKey`(v24)** 是核心根据显式 override 或 `world.id` 解析出的只读最终存档命名空间，boot/插件只继承、不另算；**`linkActions(node,state)`(v6)** = `node.links` → 动作的统一逻辑,模块在 `actions()` 里调它即获得一致的 links 出口/锁定/安全网行为。模块通常在 `init` 里存下 `api` 供 `render`/`systems` 取 `firstTime()`、`world`、服务等。
> **注册唯一入口 = `use`**(吃 函数 / `{install}` 对象 / 数组;S11-b-ex)。`registerModule`/`addPresenter` 是 `install` 体调用的**底层原语**,不作教学路径。
