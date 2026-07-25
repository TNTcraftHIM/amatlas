# 审计规则(先校准工具,再下结论)

> text-adventure 专属审计流程(audit 工作流 / `/revisit-check` / `/balance-check` / 96 场景战例细节)在
> `text-adventure-game` skill + 其 `references/`(audit-checklist / narrative-path-audit)。本规则留**通用审计哲学**。

## 铁律
- **先校准工具,再下结论**:静态分析/正则会漏掉运行时构造(`.push`/`.splice`/动态生成/scene-effects)。**解析器盲区会变成你口中的假 bug。** 先读代码搞清全部运行时机制,再让工具判断——在那之前任何"异常"只是"可疑"。
- **能跑就跑**:唯一 100% 可靠的验证是真浏览器实玩;基础自动链是零依赖 `core/tooling/graph-audit.mjs` + `core/tooling/assembly-probe.mjs`(自动游玩)+ build，已安装 jsdom 时再追加 `build --smoke` headless 烟雾。结构层用引擎自带审计 `core/tooling/graph-audit.mjs`(死链/可达/死胡同,退出码非零=P0,先修)。**但 graph-audit 是静态图审计、必要非充分**——运行时崩(`event.when` 写错、NaN、门控非函数)它看不到,**必须再跑 assembly-probe + 真机实玩；能用 jsdom 时再补 smoke**。未安装可选 jsdom 要诚实记录跳过，不当作游戏失败；别把“过了 graph-audit / 审计就绪”当“完成”(showcase round5:模型只过静态门就标 ✅,结果运行时崩、结局不可达)。
- **区分确认/待确认**:报告分级 P0→P3,每条标 [确认] 或 [待确认-需运行验证];结尾列"已确认健康、无需改动"的部分。
- 被说"误判":回去逐行核对代码,确认后明确撤回 + 说根因。修复必须落在引擎实际能力内。

## 反面教材(静态 vs 动态,必须记住)
某纯静态 audit 脚本在 96 场景真实游戏上只认出 65 场景、报 32 个死链其中 31 个假阳性;动态感知版:1 个真死链、0 假阳性。**差距来自是否纳入 `.push`/动态生成/scene-effects** → 工具不懂运行时就别下结论。

## 别把"防误判"泛化成"无视引擎自带工具"(S11-b showcase 教训)
上面这条针对**外部报告 / AI 审查 / 纯 grep 脚本**声称的 bug(主观、常误判)。**别泛化成"静态审计都不可信"**:`core/tooling/graph-audit.mjs` 是**引擎自带的确定性工具**——引擎节点转移只经 `exits/links.to`(`enter←action.to`),它的可达性 = 真可达性,且把带 `requires` 的边也算可达。所以它报的**死链(P0)、结构断裂(大比例不可达 P0)不是"解析器盲区假阳性"**:退出码非零 = 必先修,**不能当"审计误判"放过**(实测弱模型曾用"防误判"把 12 个真孤儿整体合理化忽略 → 半数内容不可达仍交付)。"会误判"专指外部报告与动态生成的死链,**不含 graph-audit 的 P0**。
