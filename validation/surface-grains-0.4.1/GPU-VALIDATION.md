# 0.4.1 GPU显示后端复验协议

状态：原始WebGL2代码、CPU精度参考和状态mock已建立。本地原版50/50、细沙132/132通过，其中GPU源码/核/状态mock14/14；72个JavaScript/ES Module语法检查通过。本精确修正候选尚待实际浏览器的shader编译与完整后端复测。此文件是执行协议，不是通过报告。

首轮实际WebGL2检查发现 `float[4](-10,-4,1,7)` 的整数元素不符合严格float数组构造要求。现仅改为 `float[4](-10.0,-4.0,1.0,7.0)`，其余shader与显示设计不变；新增源码回归防止复发。独立诊断中这一最小修改已成功编译，但修正后的正式候选仍须完整实际GL复测。源码检查和mock均不冒充shader编译、像素或性能通过。

## 实现与边界

固定288×432棋盘。两次实例化矩形光栅竞争分别求最近锚点和排除该锚点后的第二近锚点，最后绘制冻结的较大砂砾表面。每个片段先核对原格颜色；真实空格保持背景，颜色不混合。第二遍排除物理索引，不排除材料编号，相同材料的两个锚点依然独立。

需要WebGL2、至少23位fragment highp精度和32位浮点深度。R32UI颜色目标保存锚点索引，RGBA32F纹理只保存预计算核；不依赖float颜色附件扩展。实例按行列顺序提交，严格LESS；Float32同距的第一锚点优先，第二遍仍可选另一个同距锚点。当前冻结核的全量检查没有发现可共存不同位置的距离在Float32中重合；合成同距验证仍须进行。

GL初始化、shader/FBO或逐帧GL错误、失去上下文、完成fence失败都会明确使用CPU表面。context restored重新初始化并使缓存失效。不支持WebGL2时仍保留同一较大粒形，但CPU密集成本已知不通过，不承诺相同流畅度。离屏WebGL缓冲保留，保证未变化棋盘在活动块移动时仍可复用。

代码原创，无新增依赖、外部素材或服务。API依据：[WebGL2规范](https://registry.khronos.org/webgl/specs/latest/2.0/)及[GPU计时扩展规范](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)。

## 精度与readback门槛

1. 独立创建SurfaceGPU并使用与CPU完全相同的棋盘、颜色、material和clear mask。普通色/高辨识、clear/reduced-motion、纯色/混色、窄桥/单格真空隙/同色斜角、板边、奇数尺寸、稀疏无锚点及密集棋盘均覆盖
2. 从两张R32UI FBO读取owner/runner，翻转GL原点后与 `tests/fixtures/surface-gpu-oracle.mjs` 的Float32语义逐项严格一致。没有容许遗漏赢家的比例。构造同material的不同位置锚点，以及独立修改测试核为相等距离的场景，证明第二遍不会丢掉同距/同材料锚点
3. 最终RGBA与独立CPU颜色参考比较：每个颜色通道绝对误差不超过1，Alpha和所有真实空格必须完全一致；统计所有不一致字节和最大值，不只报平均值。单独比较原double比较CPU版本；若距离量化引起owner变化，列出具体核/坐标/距离，不混入颜色舍入容差
4. 反复重画静态状态严格稳定；棋盘和材料整体整数平移后（排除高辨识的既有坐标图案）对齐像素稳定。整帧复用、活动块移动、ready/playing/paused/over、重开、同revision换game、尺寸改变、偏好切换、上下文丢失/恢复/恢复失败都验证

## 真实动态与计时

`/preview/flow-lab.html`默认0.4.0参考，双方同物理状态，只比较外观。五场景同时间录制，正常352/428px棋盘观察移动粒形、剪切时局部重组、静止无爬纹、无大范围闪烁/胶感、孤粒分离时无不合理跟随。特别观察约1.4%细纹回退边界，以及跨真空隙取色但不填缝的少量案例。不能用放大静态图替代这些判断。

普通游戏另做固定输入短局和相同85%密集唤醒，记录完整callback、主线程所有阶段、间隔、模型年龄、欠账恢复、输入应用及首个可见画面。不能以双画布实验室耗时代表普通游戏。

可见QA的 `surface` 字段说明实际后端、失败原因、初始化wall、CPU提交、有效GPU elapsed、fence观察完成上界、pending/skipped/cancelled/disjoint计数，并提供playing子集。初始化单独记录wall：已有首次ready绘制在首个RAF之前，context restored也可在事件回调中初始化，因此不能把这些成本宣称已计入RAF统计；发生在RAF内部的初始化及轮询则计入app render/full callback。必须另看页面首次可见时间与完整主线程trace；`pixelBuild`表示CPU建图或GPU提交，不表示GPU完成。GPU query仅覆盖GPU绘制；fence上界还包括该表面的准备与排队，但不包括外层2D合成及实际显示扫描。真实输入到可见变化仍须浏览器/视频核对。

`?qa=1&renderer=cpu`或`?summary=1&renderer=cpu`固定CPU参考路径；普通地址自动检测。分别记录软件WebGL和实际硬件GPU环境，不能把API可用当作硬件加速，也不能用命令提交很快宣布性能通过。所有长帧、冷启动、失败及不利视频保留。完成这些检查前不能视为浏览器性能或动态视觉验收通过。
