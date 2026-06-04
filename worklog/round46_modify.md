# Round 46 修改记录：开放铁电 Landau 文献参数库查询 API

## 目标
- 将 Round 45 已入库的 `ferro_landau_*` 文献参数库开放为后端查询接口。
- 前端或后续材料管理界面可以读取 Landau 参数集和系数记录。
- 暂不把表达式型 Landau 参数直接接入 Fortran 计算，避免单位 scale 和公式函数未归一化导致错误计算。

## 设计边界
- 本轮只做“查询 API”。
- 现有 `/api/ferro/materials` 仍只返回可执行铁电材料模型。
- 新增 `/api/ferro/landau/*` 返回文献参数库。
- Landau `valueExpression` 保持字符串，不在 API 层求值。

## 修改内容
- `pf_assistant/src/server/ferro-routes.js`
  - 注入默认 `landauRepository`。
  - 新增 `GET /api/ferro/landau/source-sets`。
  - 新增 `GET /api/ferro/landau/source-sets/:setKey/coefficients`。
  - 新增公开字段映射 `publicLandauSourceSet()` 和 `publicLandauCoefficientRecord()`。
- `test/ferro-routes.test.js`
  - 新增 Landau source sets / coefficient records 路由测试。
  - 覆盖 missing set 返回 404。
- `FE.md`
  - 追加 Landau 文献参数库查询接口说明。

## 新增接口
### 参数集列表
`GET /api/ferro/landau/source-sets`

返回字段：
- `setKey`
- `materialId`
- `materialName`
- `composition`
- `sourceRef`
- `order`
- `temperatureUnit`
- `variables`
- `notes`

### 参数集系数记录
`GET /api/ferro/landau/source-sets/:setKey/coefficients`

示例：
`GET /api/ferro/landau/source-sets/PZT_Haun1989_composition/coefficients`

返回字段：
- `setKey`
- `coefficientId`
- `normalizedCoefficientId`
- `unitReported`
- `valueExpression`
- `notes`

## 验证
- `node --check pf_assistant/src/server/ferro-routes.js`：通过。
- `node --test test/ferro-routes.test.js`：4 项通过。

## 注意事项
- 这些接口受现有登录态保护，直接未登录 curl 会返回“未登录”。
- Landau 文献库和可执行模型库仍然分离。
- 下一步若要实际参与计算，需要新增公式求值/单位归一化/可信度审核流程。
