# Windows 原型首轮启动失败诊断

日期：2026-11-28，Asia/Shanghai。范围仅 `prototypes/d4-09/windows.js`，未修改原生源码、业务模块、旧测试或Windows16个浏览器用例。当前为源码修复完成、等待GitHub Actions验证，不宣称启动或用例已经通过。

## 原始失败与反馈环

首轮 source `57a0438e1fe0e4a5be32eb46ce39f7746f7ed84e`，Actions `46084728532/a1`。root已保留原始官方artifact ZIP与日志并核对其官方hash。本次读取的是root解出的两个报告：

| 报告 | SHA256 | 结果 |
|---|---|---|
| `work/d4-09/evidence-readbacks/46084728532-a1/windows-Linux-report.json` | `9d6399844d48e0ebff5ade85bd24d0853a20df7253b5ff5d2c1158a62b405694` | 16/16失败，全部未到prototype ready |
| `work/d4-09/evidence-readbacks/46084728532-a1/windows-Windows-report.json` | `c7e9fe76005d05b6f93485f1aa79734e731b3a7c95d6be4783a0e51411ee06b8` | 16/16失败，同一启动异常 |

两报告的每个case均记录 `Uncaught SyntaxError: Missing } in template expression`，CDP零基位置 `lineNumber:280,columnNumber:92`，对应原源码第281行。故表面的 `Timeout prototype ready` 是解析失败后的后果，不是应通过延长等待掩盖的慢加载。失败截图只包含HTML静态壳和预置“准备就绪”文字，真正的 `window.D409WindowsPrototype.ready` 未建立，不能把壳中文字视为成功启动。

现有云端browser case在两个OS、多个独立上下文重复同一失败，已提供直接且稳定的反馈环。遵循本项目只云端执行约束，本地没有运行Node语法检查、JS解释器、浏览器或产品测试；本次只读报告、读源码并修改文本。无需新增模拟版单元测试替代真实页面解析。

## 假设与排除

1. 指定行的模板插值缺少闭合符。预测：该行 `.map(...).join('')` 后没有 `${...}` 的 `}` 及外层模板终止反引号，补齐/拆开后应消除该解析错误。静态源码确认。
2. 相邻嵌套模板存在更早的未转义反引号。预测：错误指向虽在281行，但前一语句不能完整闭合。围绕函数边界逐项读取显示前序 `showHistory/field/relationChoices` 已闭合，直接缺陷位于新建实例picker分支。
3. artifact/路径/平台传输导致源码不完整。预测：两OS的输入hash或字节数不同。报告均为90714字节、SHA256 `0bc5dd5d32ddd02df84595668f35bb659aa84104b9591b28b084a64693c53e35`，与提交记录一致，且错误位置相同，未支持该假设。

## 修复

`beginNew(kind, quadrant)` 的 `kind==='instance'` 分支原来将条件表达式、外层HTML模板和templates.map内部HTML模板塞进同一条语句，其中 `.join('')` 后直接出现 `:`，缺少插值与外层字符串终止。

改为三个清楚步骤：`templateOptions`生成每个模板的选项，`templateContent`在非空/空状态间选择完整字符串，`showInfo`接收结果。保持原筛选、文案、步骤数/修订、`create-instance`和`goto-from-info`动作、数据和选择器。未改等待阈值、测试expectation或跳过任何用例。

修复文件为90826字节，SHA256 `e858db31cbdc8b211c4f9cae83ff9bdc779f7b7ee77bc9b54b88280be067dd01`。静态diff仅替换原错误语句为五行命名表达式；没有添加临时运行日志、调试API或测试专用状态注入口。

## 仍需完成的云端验证

root已在并行工作中修复中文路径scope检查，并使syntax step在此前scope失败时仍执行；这属于单独的门禁缺陷，不是此次JS启动根因。

下一轮应先以真实Node语法检查解析所有原型JS，然后在两个OS重跑原16项Windowsbrowser cases。W01实际导航13页和W09实例模板picker直接覆盖修复分支；所有case的ready与runtimeErrors检查共同覆盖整页启动。必须读取新报告及实际页面截图，确认不再有该SyntaxError，并继续处理任何被启动修复揭露的新失败。首轮报告/截图/日志不覆盖、不删除。

修复尚无运行验证，因此当前不能将“源码缺陷已修正”写为“Windows原型已通过”。原生UI实施继续等待root发出开始信号。
