# 数据源测试报告

生成时间：2026-04-07T15:15:43.548Z

| IP | 样本说明 | 数据源 | HTTP | CORS | 耗时(ms) | 识别结果 | 风险 | ASN/组织 | 运营商/组织 | 地理位置 | 判断依据 |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| 8.8.8.8 | Google Public DNS，典型云服务商/机房样本 | ipapi.is | 200 | * | 1981 | 机房/数据中心 | 高 | AS15169 Google LLC | Google LLC | United States / California / Mountain View | 命中机房/云服务商特征 |
| 8.8.8.8 | Google Public DNS，典型云服务商/机房样本 | ipquery | 200 | * | 811 | 机房/数据中心 | 高 | AS15169 Google LLC | Google LLC | United States / California / Mountain View | 命中机房/云服务商特征 |
| 1.1.1.1 | Cloudflare Public DNS，典型云服务商/机房样本 | ipapi.is | 200 | * | 303 | 代理/VPN | 高 | AS13335 Cloudflare, Inc. | APNIC Research and Development | Australia / Queensland / Brisbane | 命中 VPN 标签 |
| 1.1.1.1 | Cloudflare Public DNS，典型云服务商/机房样本 | ipquery | 200 | * | 714 | 机房/数据中心 | 高 | AS13335 Cloudflare, Inc. | Cloudflare, Inc. | Australia / New South Wales / Sydney | 命中机房/云服务商特征 |
| 23.236.48.55 | Google Cloud 文档示例，机房样本 | ipapi.is | 200 | * | 307 | 机房/数据中心 | 高 | AS396982 Google LLC | Google LLC | United States / Iowa / Council Bluffs | 命中机房/云服务商特征 |
| 23.236.48.55 | Google Cloud 文档示例，机房样本 | ipquery | 200 | * | 743 | 机房/数据中心 | 高 | AS15169 Google LLC | Google LLC | United States / Iowa / Council Bluffs | 命中机房/云服务商特征 |
| 32.5.140.2 | AT&T ISP 段，偏家庭/ISP 样本 | ipapi.is | 200 | * | 278 | 家庭/住宅网络 | 低 | AS7018 AT&T Enterprises, LLC | AT&T Global Network Services, LLC | United States / Virginia / Arlington | 命中 ISP/家庭宽带特征 |
| 32.5.140.2 | AT&T ISP 段，偏家庭/ISP 样本 | ipquery | 200 | * | 1097 | 未知 | 中 | AS7018 AT&T Services, Inc. | AT&T Services, Inc. | United States / New York / New York | 数据源信息不足，建议复核 |
| 223.5.5.5 | 阿里公共 DNS，国内云服务商样本 | ipapi.is | 200 | * | 219 | 机房/数据中心 | 高 | AS45102 Alibaba (US) Technology Co., Ltd. | Aliyun Computing Co., LTD | China / Zhejiang / Hangzhou | 命中机房/云服务商特征 |
| 223.5.5.5 | 阿里公共 DNS，国内云服务商样本 | ipquery | 200 | * | 1038 | 机房/数据中心 | 高 | AS37963 Hangzhou Alibaba Advertising Co.,Ltd. | Hangzhou Alibaba Advertising Co | China / Zhejiang / Hangzhou | 命中机房/云服务商特征 |
| 114.114.114.114 | 114 DNS，国内常见公共 DNS 样本 | ipapi.is | 200 | * | 222 | 机房/数据中心 | 高 | AS21859 Zenlayer Inc | NanJing XinFeng Information Technologies, Inc. | China / Jiangsu / Nanjing | 命中机房/云服务商特征 |
| 114.114.114.114 | 114 DNS，国内常见公共 DNS 样本 | ipquery | 200 | * | 834 | 家庭/住宅网络 | 低 | AS137702 China Telecom | China Unicom Shandong Province network | China / Shandong / Qingdao | 命中 ISP/家庭宽带特征 |

## 结论

- ipapi.is：可直连、返回字段最完整，包含 is_datacenter / is_proxy / is_vpn / ASN 类型等关键字段，适合作为主数据源。
- ipquery：可直连、CORS 允许，提供 is_datacenter / is_proxy / is_vpn / is_tor / risk_score 等风险字段，适合作为备用数据源。
- 本报告只验证了当前网络环境下的连通性、字段覆盖和对已知样本的识别一致性；对你公司网络是否完全放行，仍建议你在实际办公网络中再装载插件验证一次。