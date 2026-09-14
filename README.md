# Fomo Plus · 实时动态增强

非官方浏览器扩展（MV3）—— 优化 [fomo.family](https://fomo.family) 左侧实时动态（通知）栏：卡片化布局、链标签、@handle、合约地址一键复制、连接状态。

> 与 fomo.family / Robinhood 无任何关系；仅本地展示增强，不代理任何交易行为。

## 功能

- 通知栏卡片化：买入 = 绿框，卖出 = 红框，观点 = 白框（盈利/官方公告保持原生渲染）
- 每行左对齐排版；币种行单行排布，超长币种名省略号
- @handle（来自 app 自己的流量）、链标签（SOL / ETH / BNB / BASE / MON / RH）、合约地址整行 + 一键复制（复制后 ✓ 反馈）
- 面板头部「已连接 / 连接中 / 已断开」状态点（对应 app 的实时 WS）
- 舒适 / 紧凑两种密度；popup 内可开关所有增强项，改动即时生效

## 安全性

- **不读取任何凭据**：不碰 cookie / localStorage / sessionStorage / IndexedDB；无 host 权限之外的 API
- **不发起任何网络请求**：数据完全来自 app 自己的流量镜像（`src/inject.js` 只包装页面自身的 fetch/XHR/WS，参数原样透传）
- **无注入落点**：无 `innerHTML` / `eval` / `new Function` / `document.write`；页面数据只经 `textContent` / `setAttribute`
- 无后台脚本、无遥测、无远程代码、无第三方依赖（6 个文件，~700 行）
- 隔离世界只接收 JSON 字符串；页面对象图 / getter / 原型链不会跨越边界
- 事件通道带 `v:1` 协议号、字段白名单、长度/条数上限；地址以 app 渲染的 DOM 为准（payload 只补空缺）

### 边界（务必了解）

- 插件跑在 fomo 页面自己的 JS 上下文（MAIN world），**不是安全边界**：页面或其中任何第三方脚本本来就能做同样的事；它只做展示，**不要当防钓鱼工具用**
- 合约地址复制功能仅供快速核对，抄送前后请以 app 自身的地址行核对

## 安装（未打包扩展）

1. 下载/克隆本仓库
2. 浏览器打开 `chrome://extensions`（Brave 同理）
3. 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本目录
4. 打开 fomo.family 即生效；改代码后在扩展页点刷新再刷新页面

## 隐私

- 无遥测、无分析、无更新上报；`chrome.storage.sync` 仅存 6 个 UI 开关（布尔 + 密度），随浏览器账号同步
- 不读写剪贴板历史；仅在你点击复制按钮时 `writeText` 卡片上已显示的合约地址

## 文件

```
manifest.json        MV3 清单（permissions: storage）
src/inject.js        MAIN world：镜像 app 的 /feed 响应 + WS 状态（只读，不发请求）
src/content.js       隔离世界：装饰/注入 DOM，读写偏好
src/styles.css       全部样式（限定 html[data-fp="on"]，关闭即恢复原生）
popup/               设置面板
```

## License

MIT
