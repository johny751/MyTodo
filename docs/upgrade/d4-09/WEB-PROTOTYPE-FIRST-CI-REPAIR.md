# Web 原型首轮 CI 诊断与修复

2026-11-28，Asia/Shanghai。失败源码 `57a0438e1fe0e4a5be32eb46ce39f7746f7ed84e`，Actions `46084728532/attempt 1`。本记录对应修复源码准备阶段；未本地执行原型或测试，修复通过与否等待后续 Actions。

## 原始失败与证据

Linux 与 Windows 均实际执行16例，13通过/3失败。两套runtimeErrors、remoteRequests和infrastructureErrors均为零；Linux的Obscured是harness命中检查抛出的错误，不冒充应用未捕获异常。

| 用例 | Linux | Windows | 判定 |
|---|---|---|---|
| W409-P01 | 首页标题期望“工作台”，实际“今天，把重要的事往前推进” | 相同 | 导航标签被测试错误当作正文标题 |
| W409-P10 | 真实计时开始并经过一秒，返回首页后同一标题断言失败 | 相同 | 计时后续操作尚未完成，不能记为计时全流程通过 |
| W409-P15 | 1440→360后首次菜单按钮命中检查抛出Obscured，未发送鼠标输入 | 菜单真实点击和首页选择完成，再遇首页标题断言 | Linux存在调整尺寸后的瞬时命中问题 |

官方ZIP保持在 `outputs/MyTodo-D4-09-CI/57a0438e1fe0e4a5be32eb46ce39f7746f7ed84e/46084728532-a1/archives/`：Linux `15238099635-d409-design-ubuntu-latest-46084728532-1.zip`，Windows `15238154583-d409-design-windows-latest-46084728532-1.zip`。本次直接读取其 `d409-prototype-web/input-trace.jsonl`，未重新下载或改写。

读回报告在 `work/d4-09/evidence-readbacks/46084728532-a1/`：

- `web-Linux-report.json` SHA256 `fc006d45539853f3c763ae39373e35d7efe7fe6fe11bf7ab3e172aafd9271784`。
- `web-Windows-report.json` SHA256 `371fa8cf24831951e50ea24c7189c18c5c006c58795d7c89c3720ec16f2944e2`。
- 已查看两端 `screenshots/<OS>/web/W409-P15-first-failure-preview.jpg`，均为360×900、X/Y比例1；原PNG及摘要在 `SUMMARY-WITH-PREVIEWS.json`。失败截图较命中异常稍晚，按钮已露出，不能凭截图声称异常瞬间无遮挡。

原报告、输入轨迹、失败截图和ZIP均保留；本文件不回写其结论。

## 诊断过程与边界

使用 diagnose 的证据→假设→修复→云端回归流程。项目限制所有执行在Actions，因此直接使用已有云端原失败作为反馈循环；本地只读取报告/轨迹、处理小图、静态检查源码。没有为本次修复创建Skill配置或修改项目权限。

修复前列出三项假设：

1. 导航名与正文标题不是同一个合同。若成立，route已正确、导航/面包屑正确，只有h1严格相等失败。两端报告及DOM文本支持，源码也明确首页和about使用不同正文标题。
2. 桌面切到手机时，关闭sidebar从未transform的位置过渡至translateX(-100%)，原规则的160ms transition和z-index40使它经过菜单按钮上方。若成立，快速Linux首次点按可能被挡，较慢Windows和稍晚失败截图可正常。输入轨迹与时间顺序符合；源码中该关闭层没有visibility/pointer-events限制。
3. 顶栏自身布局或遮罩永久挡住按钮。若成立，稍晚截图和Windows同尺寸也应持续不可点。两端图及Windows实际点击不支持该持续遮挡解释。

原harness没有保存异常瞬间的elementFromPoint目标，因此第2项是基于时序和CSS的诊断，不能夸成已有逐帧证据。修复直接消除关闭抽屉仍绘制/命中的来源；新增回归记录即时几何和命中对象，由后续云端结果验证。

## 精确修复

`tests/d4-09/web/prototype-cases.mjs`新增独立 `pageTitles`：首页为“今天，把重要的事往前推进”，about为“关于 MyTodo”；其余仍使用原准确标题。`route`继续严格校验route，并另外严格校验当前导航文字、面包屑与正文标题。没有删除标题断言或改成模糊包含；about是同一静态审查发现的未到达预期错误。

`prototypes/d4-09/web.css`仅调整≤640的drawer规则：删除响应断点触发的transform过渡；关闭时 `visibility:hidden;pointer-events:none`，明确nav-open时恢复visible/auto。关闭抽屉立即退出绘制、键盘可见性及指针命中区域；桌面sidebar规则不变，打开仍由原按钮/handler控制。

W409-P15分别从桌面切到360和412，使用原两帧settle后立即记录button/side/shade的几何、可见性与elementFromPoint结果，断言关闭drawer不绘制、不接收点击、遮罩未开且第一次菜单点击位置命中按钮。随后继续原真实导航、详情返回、编辑保存、无横溢出和截图序列。没有新增sleep、重试、跳过、直接DOM click或强制navigate。

## 后续验证与现状

保持16例和所有既有操作。下一轮须两OS全部16/16；P01真正到达20路由，P10真正完成计时后半程，P15真正走完360/412序列，并读取新增的即时几何。任何新失败继续留原始证据并诊断，不用本修复记录代替运行结果。

本地只完成静态diff检查。当前修复文件SHA256：web.css `afbdd211619330e848d68fdb4e720768dfa5ddcce5e98d97f5ba851b7dc76405`；prototype-cases.mjs `b10cfaf1941d50c533d82c030563b0eab2f385c198692a41f218d7c0f8f0b933`。web.js未改，真实共享UI、原164/21/2/3测试、业务模型/数据/计时核与生产边界均未改。
