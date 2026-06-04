# Ferro Material Management

更新时间：2026-06-04

## 分层

铁电材料系统分成两层：

- 真实物理数据层：`ferroelectric_landau_coefficients_database.md`、`landau-repository.js`、`landau-model-adapter.js`、`material-models.js`。这里决定可计算材料、Landau 系数、默认温度、真实输入参数和 Fortran `input.in`。
- 卡片增强层：`pf_assistant/src/ferro/material-card-catalog.json`。这里只决定聊天材料卡如何分组、文案、排序、默认可视化、推荐 variants 和隐藏策略，不保存真实物理系数。

`material-card-catalog.json` 不是白名单。`buildMaterialCards()` 的规则是：

1. 先生成 catalog 明确配置的材料族卡。
2. 收集 catalog 明确引用或显式隐藏的模型。
3. 对剩余 `active=true` 的真实材料模型自动 fallback。
4. fallback 按材料 family 合并，每种 active 材料体系至少一张卡。

因此 BFO/PMN-PT 可以手工合并成单卡多 variant，PTO/PZT/BTO/KNN/HZO 等未配置材料仍会自动出现。

## 当前手工分组卡

| familyId | 卡片 | 目的 |
|---|---|---|
| `bfo` | BFO | 固定显示四阶 Zhang2008、六阶 Hsieh2016、八阶 Cao2018，隐藏其他 BFO 推荐卡 |
| `pmn_pt` | PMN-PT | 固定显示 xPT = 0.30、0.42、0.70 三个组分 |

BFO 使用 `hideOtherModelsInFamily=true`，但该策略只影响 `familyId=bfo`，不会隐藏 PTO/PZT/BTO 等其他 family。

PMN-PT 的 composition 使用：

```json
{
  "enabled": true,
  "key": "xPT",
  "label": "PT组分",
  "legacyKey": "xf"
}
```

`legacyXf` 只用于旧 Fortran input 兼容，UI 不应显示 `xf=null`。

## Fallback 卡

catalog 没有配置的 active model 会自动生成 fallback family card。例如 PTO：

```json
{
  "cardType": "material_family",
  "familyId": "pto",
  "title": "PTO",
  "groupMode": "single",
  "composition": { "enabled": false },
  "variants": [
    {
      "variantId": "pto_landau_pto_default",
      "materialModelId": "landau:PTO_default",
      "buttonLabel": "默认"
    }
  ]
}
```

如果同一 family 有多个 active model 且没有 catalog 配置，会默认合并为一张 `model_source` 卡；每个 model 是一个 variant。

## 常见操作

新增一个 PTO 卡片：

1. 确认 PTO 的真实 material model 已存在于 Landau DB 或 ferro material repository。
2. 如果只想让它自动出现，不需要改 catalog。
3. 如果要改文案、排序或默认可视化，在 `families` 中新增 `familyId="pto"` 的配置。
4. 保存后刷新 catalog，聊天框下一次 `GET /api/ferro/materials` 就会看到新卡。

把 fallback 材料改成 catalog 管理：

1. 在编辑器中选择该 fallback family。
2. 点击新增或复制为 catalog family。
3. 填写 `familyId`、`title`、`subtitle`、`groupMode`、`variants`。
4. 每个 variant 填真实 `materialModelId` 或 `sourceSetKey`。
5. 保存并刷新。

新增 BFO variant：

1. 先在真实 Landau 数据库中添加 source set 和系数。
2. 在 BFO family 的 `variants` 中新增 variant。
3. 编辑器会警告 BFO 推荐卡建议只显示四阶/六阶/八阶；确认后可保存草稿，但默认推荐 UI 不建议随意增加。

新增 PMN-PT 组分：

1. 先在真实 Landau 数据库中添加对应组分 source set。
2. 在 `pmn_pt.variants` 中新增 `compositionValue`、`compositionDisplay`、`legacyXf`。
3. `compositionValue` 不能为 null。

隐藏材料：

- 隐藏整个 family：设置 `visibleInRecommendation=false`。
- 隐藏某个 variant：设置 `variant.visible=false`。
- 隐藏同 family 其他未列出模型：只在对应 family 设置 `hideOtherModelsInFamily=true`。

## 本地材料卡片编辑器

启动脚本：

```bash
tools/ferro-card-editor/start-ferro-card-editor.sh
```

Windows：

```bat
tools\ferro-card-editor\start-ferro-card-editor.bat
```

默认地址：

```text
http://127.0.0.1:4317
```

安全限制：

- 只绑定 `127.0.0.1`。
- 启动脚本会设置 `PFM_ENABLE_FERRO_CARD_EDITOR=1`。
- 工具只读写 `pf_assistant/src/ferro/material-card-catalog.json` 和备份目录。
- 保存前校验 JSON 和 schema。
- 保存时先生成备份，再 atomic write。
- 审计日志写入 `tools/ferro-card-editor/logs/editor-audit.log`。

编辑器可修改：

- family：`familyId`、`title`、`subtitle`、`description`、`groupMode`、`displayOrder`、`temperature`、`tags`、`visibleInRecommendation`、`hideOtherModelsInFamily`。
- composition：`enabled`、`key`、`label`、`legacyKey`。
- defaultVisualization：`mode`、`component`、`overlay.arrows`。
- variants：`variantId`、`materialModelId`、`sourceSetKey`、`buttonLabel`、`title`、`order`、`orderLabel`、`compositionValue`、`legacyXf`、`referenceLabel`、`shortDescription`、`visible`。
- default presets：`quick_2d`、`standard_2d`、`custom` 的文案、grid、steps、outputInterval。

保存后刷新聊天框材料卡：

1. 在编辑器点击“保存并刷新材料缓存”。
2. 主服务必须在管理模式启用 `PFM_ENABLE_FERRO_CARD_EDITOR=1`，否则 reload endpoint 会返回 404。
3. 刷新后，聊天框下一次输入“模拟铁电畴”或调用 `/api/ferro/materials` 会返回新卡片。
4. 如果 reload 失败，重启 `pf-assistant-webui` 也会重新读取 catalog。

## 不要在 catalog 里改物理系数

如果要修改真实物理系数，请修改真实数据源：

- Landau 系数：`ferroelectric_landau_coefficients_database.md`，然后重新导入。
- 内置模型：`pf_assistant/src/ferro/material-models.js`。
- 数据库 material model：`material-repository.js` 管理的 ferro parameter models。

不要把真实 Landau 系数、弹性系数、电致伸缩系数写进 `material-card-catalog.json`。

## 本地 Landau 参数编辑器

如果需要维护真实 Landau 系数，可以使用独立工具：

```bash
tools/ferro-landau-editor/start-ferro-landau-editor.sh
```

Windows：

```bat
tools\ferro-landau-editor\start-ferro-landau-editor.bat
```

默认地址：

```text
http://127.0.0.1:4318
```

它和 `ferro-card-editor` 的区别：

| 工具 | 修改对象 | 是否影响真实计算 |
|---|---|---|
| `ferro-card-editor` | `material-card-catalog.json`，材料卡文案、分组、排序、默认可视化 | 不直接改物理系数 |
| `ferro-landau-editor` | SQLite 中的 `ferro_landau_source_sets` 和 `ferro_landau_coefficient_records` | 会影响 Landau 模型计算 |

Landau 编辑器可维护：

- source set：`set_key`、`material_id`、`material_name`、`composition`、`source_ref`、`polynomial_order`、`temperature_unit`、`variables`、`notes`。
- coefficient records：`coefficient_id`、`unit_reported`、`value_expression`、`notes`。

保存前会检查：

- `set_key/material_id/material_name` 是否为空。
- `coefficient_id` 是否重复。
- `value_expression` 是否通过安全表达式白名单。
- 是否具备可运行模型建议字段：`alpha1/alpha11/alpha12`、`Q11/Q12/Q44`。
- 是否具备完整弹性组：`S11/S12/S44` 或 `C11/C12/C44`。

保存时会：

1. 导出当前 Landau DB 为 Markdown 备份。
2. upsert source set。
3. replace 当前 set 的 coefficient records。
4. 写入 audit log：`pf_assistant_data/admin-logs/ferro-landau-editor.log`。

普通主服务中的管理 API 只在 `PFM_ENABLE_FERRO_LANDAU_EDITOR=1` 时开放：

```http
GET  /api/ferro/admin/landau/source-sets
GET  /api/ferro/admin/landau/source-sets/:setKey
POST /api/ferro/admin/landau/validate
POST /api/ferro/admin/landau/source-sets
GET  /api/ferro/admin/landau/export-markdown
```

保存后，`landau-model-adapter.js` 会在下一次列出 runnable material models 时读取新的 source set 和 coefficients；聊天材料卡会通过 fallback 或 catalog variant 引用显示。

## 常见错误

- `xf=null`：composition 没有正确关闭或 `compositionValue/legacyXf` 缺失。
- `materialModelId 找不到`：catalog variant 引用了不存在的真实模型。
- `sourceSetKey 找不到`：Landau DB 未导入或 key 拼写不一致。
- catalog 被当白名单：会导致 PTO/PZT/BTO/KNN/HZO 消失；应使用 fallback。
- `hideOtherModelsInFamily` 误伤其他 family：只能按当前 `familyId` 生效。
- `variant_111` 用在非 BFO：编辑器会提示 warning。
