# MD Live Editor

一个基于 Vue 3 + CodeMirror 6 的 Markdown 即时渲染编辑器。实现类似 Typora 的所见即所得编辑体验——光标所在区域显示语法标记，离开后自动渲染为格式化效果，切换过程平滑无割裂。

## How to Run

### Docker 方式（推荐）

```bash
docker-compose up --build -d
```

### 本地开发

```bash
cd frontend-editor
npm install
npm run dev
```

## Services

| 服务 | 地址 | 说明 |
|------|------|------|
| MD Live Editor | http://localhost:8081 | Docker 部署 |
| MD Live Editor (dev) | http://localhost:5173 | 本地开发 |

## 测试账号

本项目为纯前端编辑器，无需登录。

## 多文稿会话

编辑器支持在一个会话中管理多篇 Markdown 文稿（标签页模式）：

- **批量新建**：可一次新建多篇空白文稿（1 / 3 / 5 或自定义数量），自动命名去重（`untitled.md`、`untitled (1).md` …）。
- **多条打开**：通过"打开"按钮一次选择多个 `.md/.markdown/.mdx/.txt` 文件；单个文件读取失败会被隔离并提示，不影响其他文件，成功读取的内容原样保留、不被串改。
- **连续切换**：每个标签页拥有独立的 CodeMirror 状态（各自撤销历史、光标选择、滚动位置），快速来回切换不会让内容、文件名或保存状态互相串扰。
- **关闭保护**：关闭单个、关闭其他或全部关闭时，凡是有未保存更改的文稿都会弹出确认框，可选择「保存后关闭 / 不保存 / 取消」；`beforeunload`（刷新 / 关闭浏览器标签）同样会拦截未保存内容。
- **保存状态**：文稿是否"未保存"严格取决于其当前内容与上次保存快照是否一致；列表、当前文稿、文件名与保存状态始终指向同一份内容。
- **未知记录防护**：对已关闭或不存在的文稿执行写入 / 保存 / 重命名 / 切换都会被拒绝且不改动其他文稿；本地持久化中损坏或无法识别的记录会被安全跳过。

快捷键：`Ctrl/Cmd+N` 新建、`Ctrl/Cmd+O` 打开、`Ctrl/Cmd+S` 保存、`Ctrl/Cmd+W` 关闭当前标签。

## 图片插入说明

### 支持的图片格式

编辑器支持标准 Markdown 图片语法：`![替代文本](图片地址)`

### 图片路径类型

1. **网络图片（推荐）**
   - HTTP/HTTPS 地址：`![示例](https://example.com/image.png)`
   - 协议相对地址：`![示例](//example.com/image.png)`

2. **本地文件系统路径（不支持）**
   - ❌ Windows 路径：`![图片](C:\Users\username\image.png)`
   - ❌ Mac/Linux 路径：`![图片](/Users/username/image.png)`
   - ❌ 相对路径：`![图片](./images/photo.jpg)`

### 为什么不支持本地路径？

出于安全考虑，现代浏览器禁止网页直接访问用户本地文件系统。即使输入了正确的本地路径，浏览器也会拒绝加载图片。

### 解决方案

如需使用本地图片，请采用以下方式之一：

1. **上传到图床**：将图片上传到图床服务（如 imgur、SM.MS 等），使用返回的网络地址
2. **本地服务器**：使用本地 HTTP 服务器托管图片，通过 `http://localhost:port/image.png` 访问
3. **Base64 编码**：将小图片转换为 Base64 编码嵌入（不推荐大图片）

### 常见错误示例

```markdown
# 错误：语法颠倒
![C:\Users\benzhi\Desktop\BenZhiTec](错误示范)
# 正确语法应该是：
![错误示范](C:\Users\benzhi\Desktop\BenZhiTec)
# 但即使语法正确，本地路径仍然无法在浏览器中显示

# 正确：使用网络图片
![错误示范](https://example.com/error-demo.png)
```

### 错误提示说明

- **"浏览器无法访问本地路径"**：输入了 Windows/Mac/Linux 本地文件系统路径
- **"图片加载失败"**：网络图片地址无效或无法访问
- **"未指定路径"**：图片语法中缺少 URL 部分

## 题目内容

开发一个 Markdown 即时渲染编辑器，核心功能：

- 用户能够无损编辑 Markdown 文件并看到渲染效果
- 当光标所在区域存在语法标记时，展示语法标记（编辑模式）
- 当光标离开时，展示渲染效果（预览模式）
- 语法标记和渲染效果切换过程中，用户体验不能割裂
- 非双列模式，即时渲染

### 技术实现

- 基于 CodeMirror 6 的 Decoration 系统实现行内渲染
- 通过 ViewPlugin 监听光标位置，动态切换语法标记的显示/隐藏
- CSS transition 实现平滑过渡动画
- 底层始终保持原始 Markdown 文本，渲染仅是视觉层装饰
