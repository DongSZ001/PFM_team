# Round 45 修改记录：导入 ferroelectric Landau 文献参数数据库

## 目标
- 将根目录 `ferroelectric_landau_coefficients_database.md` 中整理好的铁电 Landau 参数资料导入 SQLite 数据库。
- 保留文献参数的完整来源、表达式、单位和数据质量说明。
- 不覆盖现有 `ferro_parameter_models`，避免表达式型/待核验参数直接影响当前 Fortran 计算流程。

## 设计方案
- 新增独立 Landau 文献参数库表，和现有可执行铁电模型表分离。
- Markdown 中的 `value_expression` 按字符串保存，不强行数值化。
- 导入方式采用同步导入：每次导入会重建 `ferro_landau_*` 表中的内容，确保数据库与最新 Markdown 文件一致。
- 当前计算仍使用 `material-models.js` + `ferro_parameter_models`；Landau 库作为后续材料数据库、材料推荐、公式转换和人工核验的数据源。

## 新增数据库表
- `ferro_landau_source_sets`
  - 保存每个文献参数集，例如 `BTO_Wang2010_modified`、`PZT_Haun1989_composition`。
- `ferro_landau_coefficient_records`
  - 保存每条系数记录，包括 `coefficient_id`、`unit_reported`、`value_expression`、`notes`。
- `ferro_landau_references`
  - 保存参考文献列表 `[1]` 到 `[12]`。
- `ferro_landau_auxiliary_definitions`
  - 保存辅助定义，例如 BTO modified Wang、PZT Haun、KNN interpolation 的公式说明。
- `ferro_landau_data_quality_notes`
  - 保存 Markdown 末尾的数据质量备注。

## 修改内容
- `pf_assistant/database.js`
  - 新增 `initFerroLandauTables()`。
  - `initDb()` 中增加 Landau 表初始化。
  - 导出 `initFerroLandauTables()`，便于测试和仓库自初始化。
- `pf_assistant/schema.sql`
  - 追加 `ferro_landau_*` 表结构。
- `pf_assistant/src/ferro/landau-repository.js`
  - 新增 Markdown 解析器和 sqlite 导入仓库。
  - 支持 `parseFerroLandauMarkdown()`、`importFerroLandauDatabaseFromMarkdown()`、`getFerroLandauCounts()`、按 set 查询等接口。
- `pf_assistant/scripts/import-ferroelectric-landau.js`
  - 新增命令行导入脚本。
  - 默认导入根目录 `ferroelectric_landau_coefficients_database.md`。
- `test/ferro-landau-repository.test.js`
  - 新增解析和隔离数据库导入测试。

## 正式入库结果
导入文件：`ferroelectric_landau_coefficients_database.md`

当前 `pf_assistant/data/app.db` 中导入结果：

- source sets：19
- coefficient records：215
- references：12
- auxiliary definitions：3
- data quality notes：4

关键记录核验：

- `PZT_Haun1989_composition`
  - material_id = `PZT`
  - temperature_unit = `degree_C`
  - 保留 n1 系数冲突说明。
- `BFO_Cao2018_eighth`
  - `C11` = `228`，unit = `GPa`
  - `S44` = `15.4`，unit = `10^-12 m^2*N^-1`
- `BTO_Wang2010_modified`
  - 保留 `sigma1/sigma2/sigma3` 应力修正说明。

## 验证
- `node --check pf_assistant/database.js`：通过。
- `node --check pf_assistant/src/ferro/landau-repository.js`：通过。
- `node --check pf_assistant/scripts/import-ferroelectric-landau.js`：通过。
- `node --test test/ferro-landau-repository.test.js`：2 项通过。
- `node --test test/ferro-landau-repository.test.js test/ferro-material-repository.test.js test/ferro-routes.test.js`：6 项通过。
- `node --test test/gateway-ui.test.js`：51 项通过。
- 正式导入脚本执行成功。

## 注意事项
- Landau 文献参数库当前是“资料库”，不是“直接可运行模型库”。
- `value_expression` 中包含 `coth()`、`exp()`、`T0(x)`、`C_curie(x)` 等表达式或辅助函数，后续若要进入 Fortran 计算，需要单独做公式解释器/转换器和单位归一化。
- 部分单位带有 scale，例如 `10^5 C^-2*m^2*N`，导入时保留原始单位，不自动乘 scale。
- PZT Haun 的 `n1(x)` 存在文档内冲突，已保留备注，后续数值部署前需要人工确认。
