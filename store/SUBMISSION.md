# Chrome Web Store 提交清单 — Fomo Plus

> 直接照抄到 [开发者信息中心](https://chrome.google.com/webstore/devconsole) 对应输入框。填错类别/用途是商店最常见的拒审原因，以下文案已按本扩展实际能力编写。

## 商品信息

| 字段 | 内容 |
| --- | --- |
| 名称 | Fomo Plus · 实时动态增强 |
| 简短描述（≤132 字符） | 优化 fomo.family 实时动态（通知）栏：卡片化布局、链标签、@handle、合约地址一键复制、连接状态。 |
| 详细描述 | 见下方「详细描述」整段 |
| 类别 | 财经（Finance） |
| 语言 | zh-CN（主要），en（次要） |
| 截图（≤5 张，1280×800 或 640×400） | store/screenshot-1-compare.png、store/screenshot-2-card.png（已有两张；可再补 popup 设置面板图） |
| 图标 | 未提供 128×128 时商店使用默认图（可后续补） |
| 官网 URL | https://github.com/tianzeteam/fomo-plus |
| 隐私政策 URL | https://github.com/tianzeteam/fomo-plus#隐私 |

### 详细描述（粘贴到「详细描述」输入框）

```
Fomo Plus 是一款非官方的浏览器扩展，用于优化 fomo.family 左侧实时动态（通知）栏的阅读体验。

功能：
· 通知卡片化——买入 = 绿框，卖出 = 红框，观点 = 白框；盈利与官方公告保持原生渲染
· 每行左对齐排版，币种行单行排布，超长币种名自动省略
· 新增 @handle（数据来自 app 自身请求的只读镜像）、链标签（SOL / ETH / BNB / BASE / MON / RH）
· 合约地址整行展示 + 一键复制（复制后显示 ✓ 反馈）
· 面板头部实时连接状态点：已连接 / 连接中 / 已断开
· 舒适 / 紧凑两种密度，工具栏弹窗内可随时开关所有增强项

安全与隐私：
· 不读取任何凭据：不访问 cookie、localStorage、sessionStorage、IndexedDB
· 不发起任何网络请求：所有数据来自 app 自身流量的只读镜像
· 无 innerHTML / eval 等注入落点；页面数据仅经 textContent / setAttribute 渲染
· 无后台脚本、无遥测、无远程代码、无第三方依赖
· 隔离世界仅接收 JSON 字符串（协议号 + 字段白名单 + 长度/条数上限）；合约地址以 app 渲染的 DOM 为准

说明：本扩展与 fomo.family / Robinhood 无任何隶属关系；仅做本地展示增强，不代理、不执行任何交易。设置随浏览器账号同步。
```

## 隐私标签页（逐项照抄）

| 字段 | 选择 / 填写 |
| --- | --- |
| 单一用途说明 | 优化 fomo.family 实时动态（通知）栏的展示：卡片化布局、链标签、@handle 与合约地址一键复制。全部处理在本地完成，扩展本身不联网 |
| 权限声明依据 → `storage` | ✅ 存储扩展设置；理由：仅保存用户界面偏好（各增强开关与列表密度），数据随浏览器账号同步，不含任何用户内容 |
| 其他敏感权限 | 无（未申请 host 权限、tabs、webRequest、cookies 等，无需逐条说明） |
| 数据使用披露 | ✅ 不收集/不使用任何用户数据（含浏览记录、站点内容、个人信息）；不传输、不出售、不用于广告 |
| 隐私政策 URL | https://github.com/tianzeteam/fomo-plus#隐私 |
| 分发位置 | 公开（默认；可在高级设置限制地区） |

## 打包与上传

```bash
# 在仓库根目录执行
zip -r fomo-plus-cws.zip . -x '.git/*' -x 'docs/*' -x 'store/*' -x 'baseline.md5' -x 'fomo-plus-cws*.zip'
```

- zip 根必须**直接包含 manifest.json**（当前 zip 顶层还包含 README/LICENSE，可保留）
- Dashboard →「新增项」→ 拖入 zip → 若报「缺少图标」，先忽略（有默认图）
- 更新版本时：升 `manifest.json` 的 `version`（如 1.0.1 → 1.0.2）→ 重新打 zip → 同一项目的「打包」页上传 → 再次审核

## 审核预期

- 权限极少（仅 storage）+ 数据披露「不收集数据」→ 通常走快速通道，几小时到 1-2 天
- 若被拒，常见原因是「单一用途说明」写得含糊 —— 按上面文案填写即可
- 上架后用户自动更新；未上架（本仓库未打包形态）需手动刷新
