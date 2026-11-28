# D4-09 设计 Token 与实际呈现映射

本表是设计值与实际候选源码的静态对应关系。`prototypes/d4-09/tokens.json`、`tokens.css` 是设计合同；当前三端通过显式样式和常量落实，不声称由同一文件自动生成。最终源码 SHA 由交付清单和 source-admission 指定，像素/交互结果另见对应 Actions 原报告。

## 色彩与平台适配

| 语义 | 设计值 | Web 候选 | Android 原生计时 | Windows 原生候选 |
|---|---|---|---|---|
| 正文 ink | `#203441` | `styles.css` 的 `body[data-d409-ui] --ink` | `D409TimerViews.INK` | `d409-ui.h D409_INK` |
| 次级文字 muted | `#607481` | `--muted` | `MUTED` | `D409_MUTED` |
| 画布 canvas | `#F2F6F8` | `--canvas`、`--bg` | `CANVAS` | `D409_CANVAS` |
| 表面 surface | `#FFFFFF` | `--surface` | `Color.WHITE` | `RGB(255,255,255)` 画刷 |
| 主色 accent | `#176B87` | `--accent`、`--blue` | `ACCENT` | `D409_ACCENT` |
| 专注色 focus | `#16776D` | `--focus` | `FOCUS`，计时环/主要动作 | 保留系统焦点框，主动作使用 accent；不声称同值 |
| 分隔 line | `#D8E2E8` | `--line` | `LINE` | `D409_LINE` |
| 选中 selected | `#E4F1F5` | `--selected` | `SELECTED` | `D409_SELECTED` |
| 危险 danger | `#B64343` | `--danger` | `DANGER` | 按钮 role 3 的 `RGB(182,67,67)` |
| 警告/成功/信息 | `#936015` / `#277348` / `#256B9E` | `--warning` / `--success` / `--info` | 计时 helper 未定义三种专用常量 | helper 未定义三种专用常量，保留原控件语义 |

原 Android 共享页面仍由 WebView 呈现，使用 Web 的主题；专门原生组件是计时面板和任务关联选择器。本阶段没有把十个主要页面全部改为原生控件。

## 尺寸、文字与输入

| 设计规范 | 实际候选适配 | 原因与验收方式 |
|---|---|---|
| 间距 4/8/12/16/24/32 | Web 显式 CSS 像素；Android dp；Windows `U(...)` 逻辑像素。局部沿用 3/5/10 等控件间距 | 保留成熟布局约束，不能以设计刻度推断全部像素一致；查看不同宽度原图 |
| 桌面圆角 8、Android 12、弹层 16 | Web 基础 8；Android 按钮 12、卡片 14、数字框 10；Win32 自绘按钮 6 | 原生密度与系统控件特色保留。未替换原生窗口、菜单或保存逻辑 |
| 桌面正文 14、Android 正文 16 | Web 正文 14、窄屏输入 16；Android 按钮 14、数字输入 18；Win32 沿用原正文体系 | Windows 标题 25/计时数字 64；Web 标题按区块 23/26、计时 64。文字完整性需原图/几何证据 |
| Android 触摸目标至少 48dp | 原生按钮最小宽高 48dp；数字框最小高 52dp | Web 窄屏部分控件是 44 CSS px，不将 CSS px 等同 dp |
| 字体 | Web 优先 Segoe UI / Microsoft YaHei / Noto Sans SC；数字使用 Bahnschrift / Consolas / monospace | 原生遵守平台字体；云端有 CJK 字体安装记录，实际设备字体未冒充已验收 |
| 键盘与焦点 | Win32 保留控件 ID、系统焦点、Ctrl+Enter；Web 保留真实 input/button/dialog | 输入、Tab、菜单、草稿往返均由独立新回归和冻结旧回归分别证明 |

## 关键实现文件

- Web：`prototypes/d4-01/styles.css`、`work-pages.js`、`personal-pages.js` 与 `prototypes/d4-08/v2-candidate-app.js`。
- Android：`android/d408/src/local/gxtodo/replica/D409TimerViews.java`、`D409TaskPicker.java`、原 `D408TimerActivity.java` 呈现接线；共享导航在 `prototypes/d4-01/mobile-controls.js`。
- Windows：`windows/d409-ui.h`、`d409-work-ui.inc`、`d408-work.c`、`d408-timer.c`、`d408-form.c`、`d408-feedback.c`。

四象限的成熟任务布局/拖动仍保留；工作管理与番茄钟是本轮主要重设计范围。原型用于体验设计，不是生产数据库或原生应用证明。三端候选仅使用原模型和隔离合成数据；不改变生产数据库、同步协议或签名升级身份。联系人、跟进、归档的负责人历史人工状态仍未知。
