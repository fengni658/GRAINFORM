# 粒序 / GRAINFORM 0.4.10

原生 JavaScript、ES Modules、Canvas 2D 和 Web Worker 流沙方块游戏。当前 main 为 **0.4.10 桌面测试版**。1 px CA 材料网格是离散游戏规则，不是连续硬圆物理认证。

## 运行

Node.js 20+，游戏及默认测试不需要第三方依赖或构建：

```sh
npm start
```

打开 http://127.0.0.1:4181/ 。PORT 可调整端口，默认仅监听本机。根 index.html 为当前入口，play-b6104e010aee4.html 是同内容的新入口。HTML 将 CSS 与模块指向内容寻址 builds/b-6104e010aee4cd4c26c50161fc744906a5ad1ec865d903282fad415de99c7b6b/，其 9 个文件与根目录同名源文件逐字节一致。Worker 的相对模块依赖留在同一 build 中，降低缓存混载风险。

静态部署请完整保留 RUNTIME-MANIFEST.json 中全部 20 个运行时文件及相对路径。server.mjs 仅服务清单内文件，不公开测试与报告。dist/ 是 0.4.0 及更早历史归档，不能当当前构建输出。本次 main 同步不会部署新站点。

## 0.4.10 范围

- 保持 0.4.9 物理运动、单位材料路径、质量、身份/代数、按块计分及有序 ACK
- 使用当前边缘/轮廓呈现，包括已有外角局部裁切边界
- 同一 settling burst 的短队列空窗可以继承最后实际 rAF 时间；长空窗、换块/换 burst、暂停、后台、重同步及 epoch 切换会失效
- settlingBurst 是只读阶段标识，不改变物理规则
- 加入已部署的内容寻址入口包装；此措施不等于确认了线上用户加载失败的根因
- 保持 288 × 432 逻辑范围和原速度；不含 0.4.11 手机窗口比例、范围扩大或初速调整

方向键或 A/D/W/S 移动、旋转、软降，空格硬降，P/Esc 暂停；失焦/后台返回后手动继续。

## 验证

```sh
npm test
npm run verify:slots
npm run verify:parity
```

本次暂存版本重新运行：默认 61/61 测试（36 个原功能测试适配当前 Canvas mock 与版本标签，23 个队列测试，2 个清单/HTTP 检查）。槽位与轨迹结果见 [本次验证说明](validation/release-0.4.10/README.md)。原断言运行失败日志、mock/标签差异及旧像素 oracle 均保留；没有删除像素断言来制造全绿。

可选 npm run verify:pixels 需要 @napi-rs/canvas；verify:pixels:browser 与 verify:browser 需要 Playwright/Chromium。这些是冻结旧绘制参考的比较或历史 smoke 工具，不能称为 0.4.10 全绿验收。旧像素 oracle 已知 70 个 screen 差异仍保留，其命令应报告 FAIL；72 个 raw-cell 与 72 个非 fallback cache 比较在既有证据中相等。

详细既有队列/落堆/browser 证据位于 [固定 QA 提交](https://github.com/fengni658/GRAINFORM/tree/99d57e31f2450afadd08285db6f0a0ec90c2e2d9/qa-artifacts) 的 queue-continuity runtime/validation 小包。当前同步使用同一核心运行时，随后仅 HTML 两个资源 URL 与 build 包装变化。

## 边界与历史

这是桌面测试版，不是商用或全设备通过。固定 60 Hz 步长不是持续 60 fps。独立浏览器落堆/队列与包装热更新有有限场景证据，不能代替真实 OS 后台、BFCache、Worker 故障恢复、移动设备或普通显示器手感测试。实际用户线上加载失败根因未确认。

?qa 有测量成本，?qa=0 仍开启诊断；关闭须删除参数。不要用累计模拟/墙时比例抹去峰值队列欠账。

保留旧 Git 历史、dist/、tests/preview/、validation/ 中旧报告、PREVIEW-NOTES.md 与 VALIDATION.md。历史报告不代表当前版本结论；test:legacy 与 test:preview 仍是历史套件。原 main 保存于 backup/0.4.9-before-0410。

保留 [LICENSES.md](LICENSES.md)；UNLICENSED，公开源码不等于授予再分发许可。
