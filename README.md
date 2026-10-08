# CoC 模组团务

管理跑过的 CoC 模组：三态状态（卫星中 / 进行中 / 已结团）、PC 名单与照片、角色卡 Excel 关联与在线预览。

## 两种运行模式

- **本地服务器模式**：`npm install && npm run dev`，打开 http://localhost:3000 。数据存于 `server-data/`，局域网内其他设备也可访问。
- **静态模式（GitHub Pages 等）**：构建产物 `dist/` 是纯静态站点，无需服务器。此时数据保存在访问者浏览器的 localStorage 中，每人各自独立。

模式自动检测：页面能访问 `/api/state` 就用服务器，否则自动降级为静态模式。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个公开仓库（例如 `coc-modules`），不要勾选 README。
2. 在本目录执行：
   ```bash
   git init
   git add .
   git commit -m "CoC module tracker"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
3. 仓库 Settings → Pages → Source 选择 "GitHub Actions"。
4. 稍等片刻，Actions 跑完后即可通过 `https://<你的用户名>.github.io/<仓库名>/` 访问。

之后每次 `git push` 都会自动重新部署。
