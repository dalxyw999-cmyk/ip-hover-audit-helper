# IP / 手机号悬停审核助手

一个适合个人在办公电脑上使用的 Chrome 插件：当你在审核后台网页中把鼠标移动到 IP 地址或手机号上时，会弹出中文信息卡片，帮助你快速判断 IP 风险，或对手机号进行微信人工核验记录。

## 当前能力

这个仓库当前已经是“IP + 手机号”合并版，不是两个完全分开的 Chrome 扩展。

- 全中文 UI
- 自动识别网页中的 IPv4 文本
- 自动识别网页中的中国大陆手机号
- 悬停查询 IP 基础信息
- IP 支持双数据源交叉验证提示
- IP 展示 0~100 的欺诈值，便于快速排序风险高低
- 手机号支持一键复制
- 手机号支持手动记录微信核验结果
- 展示网络属性、风险等级、匿名属性、ASN、运营商、组织信息
- 支持主/备数据源切换
- 本地缓存，减少重复请求
- 支持域名白名单，只在你的公司后台启用
- 支持“直接悬停”或“Alt + 悬停”两种触发方式

## 默认数据源

- 主数据源：ipapi.is
- 备用数据源：ipquery

数据源测试报告见：`docs/data-source-evaluation.md`

## 项目结构

```text
ip-hover-audit-helper/
├── extension/                 # Chrome 插件目录（可直接加载）
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── content.css
│   ├── options.html
│   ├── options.css
│   ├── options.js
│   └── lib/
├── tests/                     # 规则与数据源适配单测
├── scripts/                   # 数据源评估脚本
└── docs/                      # PRD、技术设计、数据源报告
```

## 安装方法

1. 打开 Chrome，进入 `chrome://extensions/`
2. 打开右上角“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择本项目的 `extension/` 目录
5. 点击扩展的“详细信息”或“扩展选项”进入设置页
6. 如果你要直接打开本地测试页 `docs/test-page.html` 来验证，请在扩展详情里打开“允许访问文件网址”

## 推荐首次配置

1. 在“允许启用的域名”中填入你的公司后台域名，例如：
   - `admin.example.com`
   - `review.example.com`
2. 如果你担心误触，把“触发方式”改成“按住 Alt 再悬停”
3. 主数据源保留 `ipapi.is`
4. 备用数据源保留 `ipquery`
5. 缓存时长先用默认 24 小时

## 开发与自测

运行单元测试：

```bash
npm test
```

运行单测 + 语法检查：

```bash
npm run check
```

重新生成数据源测试报告：

```bash
node scripts/evaluate-sources.mjs
```

## 本地测试页

- IP 测试页：`docs/test-page.html`
- 手机号测试页：`docs/test-phone.html`

## 重要说明

1. “家庭/住宅 IP”与“机房 IP”本质上是情报判断，不是绝对真值。
2. 不同数据源对同一 IP 可能给出不同标签，因此插件会优先展示“判断依据”。
3. 本插件默认只会发送你实际查询的单个 IP，不会上传整页 HTML、账号信息或其他业务字段。
4. 是否能在你的公司网络下完全直连，仍建议你在实际办公网络中进行一次加载验证。
