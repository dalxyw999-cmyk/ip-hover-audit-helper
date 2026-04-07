# IP 悬停审核助手技术设计

## 1. 架构概览

插件基于 Chrome Manifest V3，实现方式如下：

- content script：扫描页面文本节点，把 IPv4 包装成可悬停元素，并渲染 tooltip
- background service worker：负责查询外部数据源、执行缓存、返回统一结构
- options page：提供中文设置页，管理域名白名单、触发方式、数据源和缓存
- classifier：根据数据源字段和本地规则，输出“网络属性 / 风险等级 / 判断依据”

## 2. 目录说明

```text
extension/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── options.html
├── options.css
├── options.js
└── lib/
    ├── classifier.js
    ├── config.js
    ├── content-main.js
    ├── data-sources.js
    └── ip-utils.js
```

## 3. 关键模块

### 3.1 `lib/ip-utils.js`
职责：
- 定义 IPv4 正则
- 抽取文本中的 IP
- 判断文本节点是否适合处理
- 把文本节点中的 IP 包装成 `span.ip-hover-audit-wrapper`

### 3.2 `lib/content-main.js`
职责：
- 读取配置并判断当前域名是否允许启用
- 扫描文档中的文本节点
- 监听 DOM 变更，覆盖异步渲染页面
- 监听鼠标/焦点事件
- 显示加载中、成功、失败三种 tooltip 状态

### 3.3 `background.js`
职责：
- 接收 `LOOKUP_IP` 消息
- 读取缓存
- 按主/备顺序调用数据源
- 对结果做统一分类
- 将 payload 写入 `chrome.storage.local`

### 3.4 `lib/data-sources.js`
职责：
- 封装 `ipapi.is` 与 `ipquery` 两个数据源
- 将不同接口的返回结构标准化为统一格式
- 输出统一字段：
  - `flags`
  - `location`
  - `asn`
  - `company`
  - `privacy`

### 3.5 `lib/classifier.js`
职责：
- 基于标准化结果做本地规则判断
- 输出：
  - `networkType`
  - `riskLevel`
  - `anonymitySummary`
  - `reasons`

## 4. 数据流

1. content script 识别到 IP 文本
2. 用户悬停触发查询
3. content script 向 background 发送 `LOOKUP_IP`
4. background 先查本地缓存
5. 如无缓存，按顺序请求：
   - `ipapi.is`
   - `ipquery`
6. background 标准化结果并调用 classifier
7. 返回给 content script
8. content script 用中文 tooltip 展示结果

## 5. 缓存设计

缓存位置：`chrome.storage.local`

缓存 key：
- `ip-cache:<ip>`

缓存内容：
- `timestamp`
- `payload`

缓存失效：
- 根据设置页中的 `cacheTtlHours` 计算 TTL
- 超时后自动重新查询
- 用户也可以手动清空全部缓存

## 6. 分类规则

优先级由高到低：

1. TOR
- 输出：`代理/VPN`
- 风险：高

2. VPN / Proxy
- 输出：`代理/VPN`
- 风险：高

3. Datacenter / Hosting / 云服务商关键词
- 输出：`机房/数据中心`
- 风险：高

4. Mobile
- 输出：`移动网络`
- 风险：中

5. ISP / 家庭宽带关键词
- 输出：`家庭/住宅网络`
- 风险：低

6. Business / Enterprise
- 输出：`企业网络`
- 风险：中

7. 其他情况
- 输出：`未知`
- 风险：中

## 7. 权限设计

### `storage`
用于保存：
- 用户设置
- IP 查询缓存

### `host_permissions`
当前包括：
- `https://api.ipapi.is/*`
- `https://api.ipquery.io/*`
- `http://*/*`
- `https://*/*`

说明：
- 为了让 content script 能在网页中工作，当前使用全站页面匹配
- 实际是否启用由设置页中的“域名白名单”二次控制
- 如果后续你只想在固定后台使用，可以把 manifest 的 matches 再缩窄

## 8. 数据源选择结论

### 主数据源：`ipapi.is`
优点：
- 可直连
- CORS 允许
- 返回字段完整
- 明确提供 datacenter / proxy / vpn / tor / ASN 类型字段

适用性：
- 最适合作为主数据源

### 备用数据源：`ipquery`
优点：
- 可直连
- CORS 允许
- 提供 risk 结构和 datacenter/vpn/proxy/tor 字段

局限：
- 对部分 ISP/国内 DNS 样本的判断可能偏保守或与主数据源不一致

适用性：
- 适合作为备用数据源与交叉参考

## 9. 测试方案

### 单元测试
文件：`tests/classifier.test.mjs`

覆盖：
- ipapi.is 机房样本标准化与分类
- ipapi.is ISP 样本分类
- ipapi.is 代理/VPN 样本分类
- ipquery 结果标准化

命令：

```bash
npm test
npm run check
```

### 数据源联调测试
脚本：`scripts/evaluate-sources.mjs`

输出：
- `docs/data-source-evaluation.md`

覆盖：
- 连通性
- CORS
- 字段覆盖
- 已知样本识别结果

## 10. 后续增强建议

- 增加 IPv6 识别
- 增加“复制结果”按钮的真实交互
- 增加侧边栏详情模式
- 增加你自己的黑名单 ASN / 组织关键词库
- 支持导入常见云厂商 ASN 列表，提升机房识别准确率
