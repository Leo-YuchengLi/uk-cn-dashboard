# UK-CN 航线周报看板

英国-中国航线客运市场竞争情报看板，基于 BSP 票务数据，以国航(CA)视角分析市场份额、渠道分层、代理人竞争格局。

## 功能

- **市场总览** — 各航司月度份额趋势、本周vs上周环比、航程类型构成
- **城市对竞争力** — 城市对/机场对/国家对三级下钻，CA份额热力矩阵
- **渠道分层** — OTA/CONSOL/TMC/Trip.com 四渠道航司份额对比，支持排序切换
- **代理人战场** — 191个代理人×航司份额矩阵，按CA份额/总量排序
- **趋势与环比** — 周度变化、月度环比、航司增长排名
- **原始数据** — 8个Excel sheet原始表格查看
- **AI助手** — Gemini集成，自然语言查询数据、生成策略建议

## 前置要求

- **Node.js** 18+
- **Python** 3.9+（用于Excel解析）
- Python依赖：`pip install pandas openpyxl python-calamine`

## 快速开始

```bash
# 安装依赖
npm install
pip install -r requirements.txt

# 开发模式（浏览器）
npm run dev

# Electron 桌面模式
npm run electron:dev
```

## 使用方法

1. 启动应用后，点击左下角「导入周报 Excel」
2. 选择BSP周报Excel文件（文件名需含日期如 `UK-CN 6mon 20260604.xlsx`）
3. 等待解析完成（首次约3分钟，后续快照会累积）
4. 浏览各页面分析数据

## 打包

```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# 全平台
npm run electron:build:all
```

## 技术栈

- **前端**: React 19 + Vite + ECharts
- **桌面**: Electron 35
- **数据库**: SQLite (better-sqlite3)
- **解析**: Python (pandas + openpyxl + calamine)
- **AI**: Google Gemini 2.5 Flash

## 数据安全

所有数据存储在本地 SQLite，不上传任何服务器。AI助手需用户自行配置Gemini API Key。
