# Windows 原型第二轮密度与窄屏修复

2026-11-28，Asia/Shanghai。源码修复完成，等待第三轮云端验证。仅修改 `source/prototypes/d4-09/windows.css`；未改16项浏览器用例及断言，未改产品原生源或旧测试，未执行本地程序/浏览器/Node/CSS运行验证。

## 失败证据

Actions `46086386919/a1`，root发布源码简称 `f5ed304`。Linux与Windows都14/16，两个失败完全对应W14/W15；报告均无这两case的runtimeErrors。此前启动SyntaxError已在本轮实际云端解析和其余14项中消失，但不能因此忽略布局失败。

| 原始报告 | SHA256 |
|---|---|
| `work/d4-09/evidence-readbacks/46086386919-a1/windows-Linux-report.json` | `b09127750aa6a67844ba1e3541587527d40c3d516bfd660d3a683be450baa967` |
| `work/d4-09/evidence-readbacks/46086386919-a1/windows-Windows-report.json` | `b27bd81e23a50dfec06924fa1146bf51320bc8c6b0e9f9056b7ddc6023617809` |

W14两OS均：`compact row remains reasonably dense: 51`。原用例要求紧凑第一条事项行实测高度≤48px，不能把设定的CSS变量40当作真实高度。

W15在360×860：rootClient/rootScroll=360/360，workspace mainClient=291；Linux mainScroll=364、Windows=348。四象限和计时页已先通过该宽度检查，在dashboard失败后循环停止，**本轮并未完成后续route或412全页面验证**。

实际查看两张既有小图：`screenshots/Linux/windows/W14-first-failure-preview.jpg` 和 `W15-first-failure-preview.jpg`。W15清楚可见右侧“查看”操作被挤出工作区、底部横向滚动条，故这是内容布局错误，不能通过隐藏滚动条解决。原PNG和root生成的preview映射保留；本次没有覆盖或重新生成原图。

## 根因和改动

### W14：table height不是内容上限

原 `.is-compact` 只把 `--row-height` 从48改成40，但table cell实际双行文字继承1.5行高：名称12×1.5=18、元信息10×1.5=15、上间距3、上下padding14及border1，共51。两个OS均51与该构成一致。若仅进一步降低height变量，文本和padding仍会撑开table row。

新增紧凑专用样式：cell上下padding各4，名称line-height16，元信息line-height13、margin-top2。保留原12/10字号、两行文字、按钮、记录内容与columns；理论内容40px，最终高度仍以第三轮浏览器测量为准。普通密度未改。

### W15：单列grid仍受内容最小宽度撑开

原≤1000规则将dashboard两列变成 `grid-template-columns:1fr`。grid track的自动最小宽度与section/aside的默认min-width:auto保留了行内nowrap文本贡献；dashboard队列仍是一行“色点 + 双行主信息 + 状态 + 查看”。小图与报告显示整个内容列宽超过可用空间。

修复分为结构与内容两层：

- ≤1000的dashboard/timer/chart统一为 `minmax(0,1fr)`，四种主grid的直接子项显式 `min-width:0`。≤760的feedback/form单列也使用 `minmax(0,1fr)`，避免同类intrinsic-size问题。
- dashboard窄屏队列改为真实两行grid：第一行色点与完整主信息，第二行状态和可点击“查看”。没有色点的流程项首行占满宽度。名称、元信息允许自然/长词换行，去除这些窄屏queue文字原有ellipsis；不隐藏内容。
- 窄屏section标题/右侧入口、project进展caption允许换行；项目/活动长文字允许断行。page-actions允许按钮换行；setting文字容器min-width0，version来源长字符串允许换行。

没有新增overflow-x:hidden、宽度负值、scale缩小页面、display:none内容或测试宽度容差；没有删掉任何入口或样本记录。旧desktop结构保留。

## 全route静态复核

| route组 | 审阅的布局约束 | 此轮处理/保留 |
|---|---|---|
| 四象限 | quadrant自身min-width0，任务正文overflow-wrap，主board已有minmax0；360已云端通过 | 保留原行为，不碰拖动或折叠JS |
| 番茄 | focus-panel min-width0、digits clamp、actions wrap、窄timer单列；360已云端通过 | 主grid规则统一minmax0，数字/任务逻辑不改 |
| 工作台 | 单列grid最小内容、queue单行、section标题与项目caption | 上述实际两行布局与文字换行修复 |
| 事项/项目/模板/实例/往来/跟进/归档 | fixed table、内部work-list滚动、≤1000详情切换、窄列规则 | 保留现有表格/详情及按钮；compact只调整垂直度量 |
| 统计 | chart单列、7bar最小16、donut/legend宽度 | track允许收缩，原chart最小宽和legend保留，待两OS逐页测量 |
| 设置 | setting flex文字与switch、version/actions长文本 | min-width0、来源换行与既有actions wrap |
| 反馈 | 窄单列、横向反馈卡片自身scroll、form grid/field宽度 | 单列track minmax0与grid child minwidth0，保持内部卡片滚动与全部正文/按钮 |

静态审阅不等同执行通过。W15原有360/412×13route循环和详情返回保持不变，第三轮必须实际跑完才能确认新约束覆盖所有页面；若揭露新失败继续修内容，不缩断言。W14后半键盘动作也需要在行高断言通过后实际执行。

## 交接校验

修复后CSS34850字节，SHA256 `1fd95bd5611d8c9bb9aa8093619b2cec04280ef4c0b11a20f1017dcbf5461f9e`，git diff为29行追加；静态括号计数485/485仅作文本完整性参考，不冒充CSS解析/运行通过。`git diff --name-only -- windows tests/d4-08 tests/d4-09/windows`为空。

root接管第三轮提交/Actions。新原生driver编写已按最新指令暂停，当前只完成原生实施计划及测试计划，无新增native执行或生产代码修改。全部原报告、失败截图和诊断文档保留。
