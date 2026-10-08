# 最小未来 GPU 实现合同（未执行）

此文件仅规定未来实现的必要条件，不授权或包含 GPU 修改、运行或发布。当前交付到 CPU 证明为止并冻结。

## 输入与代际一致性

- 仍使用 cell=4、grid origin=(28,-16)、58×110格、每格16正常槽+第17槽witness、稳定array slot编码slot+1。
- 旧桶、旧预测anchor、旧alive/slot身份必须来自同一代；新预测位置、删除状态必须属于同一完整下一代。读入数据在本轮rank期间不可变化。
- 初次建桶使用既有完整17层peel。后续只有完整有效旧桶才可作为rank来源：未知/无效/overflow/域外/非有限/drift失效均不能被当作有效旧状态，sticky invalidity不得清除。
- GPU position沿用cell-local signed code。cell解码和相邻anchor差应使用整数cell差+local差，保持highp sampler，不能重新引入absolute-world float32相减。

## 整轮资格决定

每个下一代活粒必须已有同身份旧活slot，且旧anchor→新anchor的每轴位移严格小于4，新cell在grid内。新粒、复活或重用slot，以及无法证明移动界，必须在任何新桶被采用前触发整轮完整rebuild；不能仅对个别粒fallback。

core中的输入各轴60上限不能代替上述资格检查。若采用解析充分界，必须真正保证旧final drift≤1，以及下一次预测每轴位移界；1+.25=1.25只在.25确实被证明时有效。没有证明不得新增clamp改变物理以冒充合同通过。

资格判定如何做到GPU-resident、全局可靠，属于未来实现任务；本CPU验证没有解决或声称解决这一点。现有step不做readback的合同仍须保持。旧anchor证据必须在predict覆盖gridPosition前取得/保留，或以另一个可靠充分条件替代。

## Rank 与 scatter

对每个新活粒 i：

1. 取其新目标cell c，按既有dy、dx、slot顺序读以c为中心的旧3×3桶，每桶正常0..15槽。
2. 对候选j读取同代新预测位置；跳过dead，跳过新cell不等于c者。
3. rank等于剩余候选中stable slot小于i的数量。稳定slot唯一、旧桶完整和资格成立保证自粒恰好出现一次，并保证rank唯一连续。
4. rank0..15写正常槽；rank16写overflow witness并令结果无效。rank>16无桶位置，但不能丢掉粒子状态或把结果称为有效。已成立的连续rank证明保证任何>16人口都有rank16 witness。
5. 输出pixel为原atlas的 `(parity=rank%2, x=cellX, y=floor(rank/2)*110+cellY)`，使用精确pixel中心和point size1。清理所有将被查询的输出槽，避免沿用旧代残留。禁用会丢弃/混合唯一写入的渲染状态。

## 存储与同步限制

- Rank读取两张旧atlas。新scatter framebuffer附件不得与任一活动sampler纹理相同，即使采样区域/写入区域不同，也不能绕过WebGL反馈规则。
- 需独立新旧输出或经验证的独立rank暂存/分阶段方案；本合同不指定哪个方案，也没有替实现增加纹理。
- 在整个rank/rebuild、诊断和代际切换正确完成前，新桶不得作为碰撞邻居输入。不得混合部分rank结果与部分peel结果。
- slot、cell和rank必须保留精确整数表示，且不得对越界取模造成别名。

## 最低验收

先保留本目录17项CPU合同测试。另在单独授权的真实GPU阶段验证：真实shader编译、所有cell/17层逐槽对照sort oracle、边界与负y、删除、新粒整轮fallback、严格4界fallback、16/17/144合流overflow、无效旧桶拒绝、无active-sampler/framebuffer feedback、代际切换及无step readback。

GPU桶正确后还须独立重跑原physics/material/invalidity门。没有实际测量前不声明加速；正确桶也不等于物理门或商业帧率通过。
