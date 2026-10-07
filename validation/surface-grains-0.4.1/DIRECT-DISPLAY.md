# 0.4.1 · 直接显示与有界视觉提交

这是一次待真实浏览器验证的显示管线实验，不是性能通过声明。基于WAIT_FAILED已修正的候选；shader、核参数、576×864表面栅格、288×432物理网格、碰撞、材料、调度、输入与音频均不变。

## 为什么只改这条管线

fa66fd2的SwiftShader普通局：提交p95 3.25ms，外层2D合成p95 43.8ms；接近完整回调p95的原生样本为48.352ms wall /5.042ms主线程CPU。密集坏帧提交3.7ms，合成535ms，原生回调545.326/9.645ms；暂停后另有583.328/7.113ms。初始化20.7ms和模块首次193.372ms单列。

阻塞集中在WebGL canvas交给2D drawImage的时候；这可能包含等待着色完成或跨上下文传输，现有trace未证明逐帧原生ReadPixels，因此不把“强制读回”当作已确认根因。旧记录中模型revision926、已观察完成670，pending记录最多52，最终排空；fence观察上界2.35秒也不是屏幕延迟。

本轮让普通游戏直接显示WebGL棋盘，把原canvas作为透明2D活动块/幽灵层，移除该路径显式drawImage(WebGLCanvas)。不减小砂砾、不降低物理粒度、不省略模拟时间。

## 显示与队列约束

- 仅普通游戏明确启用directDisplay，底层插在原gameCanvas前，二者z-index均0。底层绝对定位于已有board-shell，pointer-events:none且aria-hidden；原焦点/指针入口、阴影1、墙边2、提示4和模态5保持。HTML/CSS不改
- 原2D canvas首次用alpha:true创建；前景改变时先clearRect，再画活动块和幽灵。GPU底层保持2×固定栅格，前景保留现有DPR尺寸
- 在尺寸重配、上传和任何draw命令之前，必须先有空闲提交槽。最多一条live completion fence；忙时不提交、不回退CPU，也不把已接受revision提前成当前模型revision
- 当前模型继续正常计算。仅视觉请求合并到最新状态，不保存中间棋盘数组队列；暂停后即使revision不再变化，也持续轮询并最终提交最新状态
- 可选GPU elapsed query最多64条；每次已接受提交始终有独立completion fence。等待query结果不能占住视觉提交槽，pending记录可含旧计时记录，不能把其长度当作在途GPU任务数
- 新游戏/新Game对象/上下文恢复采用代际标记。旧GPU层先隐藏，保留一次新棋盘CPU快照覆盖；本代GPU完成后才显示底层。CPU覆盖会在前景刷新时重新绘制，避免clearRect把它擦掉。正常硬件也有这次CPU建图成本，必须测冷启动、重开和恢复，不能省略
- WAIT_FAILED或真正GL错误仍立即清理并回退CPU，显示原因；同revision强制重画有效。不支持WebGL时仍保留同一较大粒形及已知CPU密集成本限制

前景可以先于较慢的新背景更新。队列有界并不保证没有可见滞后，不能用快速RAF或提交来宣称流畅；实际录像和输入可见时间是必需门槛。

## 本地检查与未验证项

本地原版50/50、细沙146/146以及75个JavaScript/ES Module语法检查通过。独立叠层/队列/生命周期专项23项通过；加上GPU源码与核检查共28项。发现并修复了直接CPU回退忽略显式lastRevision失效的问题。模拟检查不执行真实GL或浏览器合成。

保持原始shader像素不等于最终显示完全相同：旧路径由高质量2D drawImage缩放，直接DOM canvas由浏览器合成器缩放。必须在实际352/428px及相应DPR、四种视口中对照截图，检查粒形、真空格、色界、边缘、活动块残影、指针对齐、模态层级和恢复画面。对照实验室仍保留离屏比较路径，其计时不能代表新的普通游戏显示管线。

## 浏览器复验

1. 先重跑真实WAIT_FAILED、GL错误、context loss/恢复及40组owner/runner/RGBA。新绘制管线的最终截图须比较实际两个canvas的合成，不能只读单一gameCanvas
2. 普通页正常/高辨识、移动/旋转/落下、暂停/恢复/重开、同revision新棋盘、尺寸变化和强制CPU全部检查。重开时不能重现旧代沙盘；透明前景不能截获或错移指针
3. 固定普通输入与相同密集唤醒对照fa66，分别报告完整callback、surface提交、GPU elapsed（可用且非disjoint时）、GPU完成、CPU初始覆盖、页面首次可见及真实paint/视频节奏。记录真正的输入到首个可见变化
4. 可见surface摘要应为direct-webgl-plus-2d，inFlightSubmissions与maxInFlightSubmissions始终≤1。检查oldestInFlightWallMs、lastRequested/lastSubmitted/lastCompleted、completionTickLag，以及停止输入后的最终状态排空。completionTickLag是渲染请求的逻辑tick差，不是屏幕呈现时延
5. 若仅CPU回调变快，但GPU完成、实际画面或输入可见仍严重滞后，则本实验失败。保留软件GPU身份、全部坏峰及旧CPU失败数据；未知硬件GPU表现不作推断，不能视为验收通过
