# gxtodo 网页复刻分析

观察日期：2026-10-16（Asia/Shanghai）。

承接对话：codex://threads/01a14029-1619-7812-8d47-486194ba8b2c

## 观察范围

在获得用户提供的登录信息后登录 https://www.gxtodo.com/web/ 。通过内置浏览器查看任务四象限、任务编辑表单、便签、项目及创建表单、地点、标签、任务显示方式菜单。原站仅做读取与打开表单，未保存、删除或修改原站业务数据。登录信息未写入项目文件。

主界面为 90 像素深灰侧栏、顶部日期与显示控制、四色象限和右侧任务编辑栏。任务字段包括优先级、开始/结束时间、项目、提醒、标签、地点、备注、子任务。任务显示方式包含四象限与时间轴。

## REA 证据

工具：此前已经安装的 rea-agents 6.5.0，复用 Node.js 24 运行。

通过浏览器已加载资源清单确认业务脚本 URL，再用受支持的 CDP Debugger.getScriptSource 读取已加载脚本，不执行脚本包进行分析。

公开脚本：https://qn.gxtodo.com/dist/js/todo.min.js?v=6.17

- 公开脚本：M:/dev/rea-gxtodo-evidence/todo.min.js
- REA 完整结果：M:/dev/rea-gxtodo-evidence/rea-analysis.json
- 本地分析入口元数据：M:/dev/rea-gxtodo-evidence/package.json
- 原站布局参考：reference-task.png

分析命令参数：

    rea analyze-javascript-application M:/dev/rea-gxtodo-evidence --source-path todo.min.js --max-semantic-nodes 6000 --max-semantic-nodes-per-file 6000 --format json

REA 返回退出码 0。解析 JavaScript 文件 1 个、访问 AST 节点 58,548 个、findings 47 项、解析失败 0。47 项是工具返回的发现数，不等同于 47 个产品功能。分析设置限制保留的语义节点数量，关系图覆盖不完整。

额外静态文本检查发现 task/list、task/four、task/timeline、note/list、project/create、project/list、position/list、tag/list 等路由字符串，及 jQuery、moment 引用；资源清单含 jQuery 2.1.1 和 Bootstrap 3.2.0。以上只证明代码或已加载资源中存在这些名称。

## 证据边界

REA 对文本做静态分析，没有执行下载的业务脚本。动态表达式、混淆及运行时构造的依赖可能无法恢复。未选中的入口元数据文件未作源代码分析。分析输出不能证明特定代码路径实际执行，也不包括服务端源码、数据库、云同步逻辑或地图服务实现。

本地版根据观察到的界面和交互独立编写，运行时不使用原站 JS、CSS、服务接口、登录信息或第三方地图密钥。

## 验收记录

- 模型测试：5 项通过。
- 任务创建、项目/标签/地点关联、备注、子任务、完成状态：浏览器验证通过。
- 页面刷新、Node 服务停止后重新启动：验收任务及完成状态仍存在。
- 便签创建、跨模块搜索：验证通过。
- 项目新增、归档：验证通过。
- 删除流程使用页面内确认弹窗；临时验收任务、便签与项目已清理。
- 初始保留 4 条演示任务、1 条演示便签、1 个演示项目。

原生确认框曾阻塞内置浏览器，已将本地删除流程改成页面内确认框并重新验证。

补充验证：JSON 导出内容与磁盘 state.json 完全一致，保留 4 条演示任务、1 条便签、1 个项目；浏览器错误日志为空。一键启停脚本已使服务从旧进程重启为新进程，重启后页面和数据正常。


## 2026-10-17：Android 个人功能与 0.4.0

REA inspect-android-package 确认包名 net.icycloud.fdtodolist、版本 7.1.2（110），API 21–34。classes.json 的业务类清单包含 EzAcTaskRepeat、EzAcTaskAlert、EzAcTaskRemarkReview、EzAcTaskWeight、AcStat 和 MyAppWidgetProvider。已通过 inspect-android-class 和 inspect-android-method 检查重复、提醒的 onCreate，读取 repeat_data/start_time/repeat_end/weekday 与 is_all_day/alert_time/start_at 字段。原网页已保存脚本中发现 repeatMode 的每天/每周/每月/每年以及提醒时间选项。

新增证据保存在 M:/dev/rea-gxtodo-android/：EzAcTaskRepeat.json、EzAcTaskAlert.json、repeat-ui.json、alert-ui.json。静态类名与字段不能证明原版完整运行行为；本地版采用完成后生成下一次的明确规则。当前重复任务与提醒用法见 [README 的功能说明](../README.md#功能)。


## 2026-10-17：0.5.0 原版手机交互观察

用户授权连接手机并开启模拟点击权限后，观察高效 ToDo 的头像抽屉菜单、点击任务区域先放大象限、再点击任务打开详情及两层返回。原版放大象限约占宽高的 85%，其他象限保留窄边；本地版按空间利用要求采用单象限占满任务区。用户指定的左下角菜单入口在本地版手机端实现。未修改原版任务。当前手机交互功能见 [README 的功能说明](../README.md#功能)。


## 2026-10-17：四象限交界的用途

用户进一步指出：原版保留的窄边和角块是另外三个真实象限，用于切换和接收拖放；0.5.0 将其隐藏的处理不正确。本轮读取原版当前左下象限放大画面，确认上方、右侧与右上角分别保留其余三个象限。0.5.1 按此修正，并补上标题整行新建与最右侧加号，当前象限切换与新建方式见 [README 的功能说明](../README.md#功能)。
