---
description: 把一个中文文字冒险游戏翻译成英文(或反向),产出独立的翻译版
argument-hint: <path/to/world.js> [target language, default: en]
---

翻译游戏:$ARGUMENTS

按 `references/translation-workflow.md` 执行。模块化游戏的**可翻译文本几乎都在 `world.js`**(节点 `look` 的字符串/函数返回文案、`links[].label`、`events` 的 `run` 返回文字)+ `index.html` 的 UI 字符串。翻译 = 改这些**字符串字面量内容**,保留 JS 结构。

## 1. 准备
- 读 `world.js`,搞清节点结构(和 `/audit-game` 一样的"先校准"原则)。
- 如果有 `canon.md`:从中提取所有角色名/专有术语/地名,建一份**翻译对照表**(glossary.md),全程保持一致。没有 canon → 手动从 `world.js` 提取。

```markdown
## glossary.md (示例)
| 中文 | English | 说明 |
|------|---------|------|
| 艾拉·沃斯 | Ella Voss | 主角,制图师 |
| 活墨水 | living ink | 核心资源 |
| 重排 | the Shift | 岛屿地形重组 |
| 制图师 | cartographer | 职业,非 mapmaker |
```

## 2. 提取可翻译文本
- 从 `world.js` 提取:节点正文(`look` 的字符串 / 函数返回的文案)、选项文本(`links[].label`)、beat 文字(`events` 的 `run` 返回)、状态条标签;再从 `index.html` 提取 UI 字符串(按钮/标题/meta)。
- **只翻译字符串字面量内容,保留 JS 结构**:`look:{first,return}` 的键、函数体逻辑、`${}` 插值、变量名、flag 名一律不动。**没有 `{{if}}` 标记**(模块化条件是 JS 函数/对象)。

## 3. 批次翻译
- 每批 10-15 节点(不超 20)。用子代理翻译(隔离 context)。
- 每个子代理必须拿到:**glossary.md**(术语一致)、**anti-slop 规则**(译文也要避免 AI 腔)、**风格要求**(文学性、感官细节、句子节奏变化——不要翻成"翻译腔"平板英文)。
- 输出格式用纯文本 `===NODE: map/id===...===END===`,**不用 JSON**(译文里的引号会破坏 JSON)。

## 4. 特殊处理
- **`「」`** → `""`(中文引号换英文引号)。
- **文本膨胀**:中文→英文通常膨胀 40-80%。翻译后检查 `links[].label` 是否溢出(尤其移动端);过长的选项考虑精简。
- **文化适应**(可选):默认直译 + 注释,用户可要求 transcreation(成语/诗句)。
- **`<title>` / meta**:页面标题、meta description 也要翻译。

## 5. 注入回 world.js
- 把译文写回 `world.js` 对应字符串(直接改 JS 文件,比改单 HTML 简单);模板字面量里转义译文中的 `` ` `` 和 `${`。
- UI 文本改 `index.html`(不在 `world.js` 内)。
- 改完 `node -c src/world.js`(和 `game.js`)查 JS 语法。
- 想要独立翻译版:复制整个游戏目录,在副本里改 `world.js` + `index.html`,再 `node pipeline/build/build.mjs`。

## 6. 验证(必做,不可跳过)
```bash
node -c src/world.js && echo "world.js JS OK"
# 结构必须和原版一致(翻译不应引入死链或改图)
node core/tooling/graph-audit.mjs src/world.js
# 残留中文(译文里不应有大段中文)
node -e "const fs=require('fs');const c=fs.readFileSync('src/world.js','utf8');const cn=(c.match(/[一-鿿]+/g)||[]).filter(x=>x.length>4);console.log('残留中文片段(>4字): '+cn.length);cn.slice(0,10).forEach(x=>console.log('  '+x));"
# 零依赖装配探针 + 构建；jsdom 是可选增强，已安装时可再加 --smoke，未安装则明确记录跳过
node core/tooling/assembly-probe.mjs src/index.html
node pipeline/build/build.mjs src/index.html
node -e "require.resolve('jsdom')" && node pipeline/build/build.mjs src/index.html --smoke
```

## 7. 输出
- 翻译版游戏目录(`world.js` + `index.html` 已译)+ 构建产物单 HTML。
- `glossary.md` — 翻译对照表(供后续维护/审核)。
- 翻译报告:节点数、翻译覆盖率、残留中文数、graph-audit 结果。
