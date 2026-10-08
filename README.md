# CoC 模组团务

管理跑过的 CoC 模组：三态状态（卫星中 / 进行中 / 已结团）、PC 名单与照片、角色卡 Excel 关联与在线预览。

在线地址：https://clairexin1115.github.io/coc_PcOrganizer/

## 两种运行模式

- **本地服务器模式**：`npm install && npm run dev`，打开 http://localhost:3000 。数据存于 `server-data/`，局域网内其他设备也可访问。
- **静态模式（GitHub Pages 等）**：构建产物 `dist/` 是纯静态站点，无需服务器。此时数据保存在访问者浏览器的 localStorage 中，每人各自独立。

模式自动检测：页面能访问 `/api/state` 就用服务器，否则自动降级为静态模式。

## 更新网站内容

修改代码后执行：

```bash
bash deploy.sh
```

脚本会自动构建并把 `dist/` 发布到 `gh-pages` 分支，几分钟后网站更新。

首次部署需要先在仓库 Settings → Pages → Source 选择 `gh-pages` 分支（本项目已完成）。
