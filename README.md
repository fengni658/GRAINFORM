# 粒序 / GRAINFORM 0.4.11

原生 JavaScript、ES Modules、Canvas 2D 和 Web Worker 流沙方块游戏。当前 main 为已验收的 0.4.11 测试版。1 px CA 材料网格是离散游戏规则，不是连续硬圆物理认证。

## 运行

Node.js 20+，游戏与默认测试不需要第三方依赖：

```sh
npm start
npm test
```

打开 http://127.0.0.1:4181/ 。PORT 可调整端口，默认仅监听本机。根 index.html 与 play-b560060d5b73b.html 指向内容寻址构建。builds/b-560060d5b73b0e9f6b6d008b457beeaba4d90597bead659ec2339040eefcfe87/ 内 14 个文件逐字节复现验收源码；根模块是同字节副本，根 HTML 仅改写 CSS 与模块资源地址。

静态部署请保留 RUNTIME-MANIFEST.json 中全部 29 个运行时文件及相对路径。server.mjs 仅服务清单内文件，不公开测试与报告。dist/ 和旧 builds/ 是历史归档。本次 main 更新不改变任何已发布站点。

## 0.4.11 范围

- 288 × 512 全幅可玩区域，边缘、落底、出生区、容量与身份索引统一
- 保持 1 px 材料单元与 24 px 方块单元；初始刚体下降速度 46.224，保留等级增量与速度上限
- 有界复合呈现队列、独立传输回执与实际绘制 ACK，支持重同步和 epoch 切换
- 共享材质与消除高亮裁切，失败绘制可重试；预览异常正确恢复 Canvas 状态
- 不包含 0.4.12 的沙粒尺寸或样式修改

方向键或 A/D/W/S 移动、旋转、软降，空格硬降，P/Esc 暂停；触屏提供对应按键。失焦或后台返回后需手动继续。

## 验证与边界

本次发布重新运行 15/15 个独立规则、边界、身份、传输与发布完整性/HTTP 检查。此前对同一 14 文件源码完成的 66/66 原生检查与 12/12 独立检查记录已核对源码身份。默认测试是发布回归子集，不替代完整原生或浏览器测试。详见 [发布验证说明](validation/release-0.4.11/README.md)。

这是测试版，不是商用或全设备通过。有限浏览器场景不代表所有设备持续 60 fps。?qa 有测量成本；关闭诊断须删除该参数。

旧 Git 历史、dist/、旧 builds/、旧测试和报告均保留。test:0410、test:legacy、test:preview、verify:slots、verify:parity、verify:pixels、verify:pixels:browser 与 verify:browser 是历史工具，不是 0.4.11 验收命令，可能因当前几何或呈现协议而失败。旧像素 oracle 的既有差异没有被删改来制造通过。

上一版 main 保存在 [backup/0.4.10-before-0411](https://github.com/fengni658/GRAINFORM/tree/backup/0.4.10-before-0411)，其精确提交为 ddc8a1aed5a525b2efa8bd5da384b6961b790db2。更早备份及 QA 分支保持原样。

保留 [LICENSES.md](LICENSES.md)；UNLICENSED，公开源码不等于授予再分发许可。
