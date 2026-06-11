# Round 48: Paper-RAG 集成

Date: 2026-06-11
Author: 总管 (MiniMax)

## 任务

将 `skills/paper-rag/` + `rag/` 知识库集成到 PFM_team 仓库的 `tools/paper-rag/`。

## 改动清单

### 新增
- `tools/paper-rag/` (504 KB, 27 文件)
  - SKILL.md (4 KB) — 技能入口
  - INSTALL.md (1.7 KB) — 安装说明
  - USAGE.md (5.2 KB) — 使用说明
  - SYNC_DATA.md (2.5 KB) — 数据同步说明
  - README.md (1.6 KB) — 工具概览
  - sync_rag_data.sh (3.4 KB) — 数据同步脚本
  - process_paper.py (12 KB) — PDF 处理
  - demo.py (16 KB) — MinerU 解析
  - rag_index.md (12 KB) — 17,503 篇论文索引
  - fusion_result.json (164 KB) — 多源融合结果
  - components/ (116 KB) — RAG 核心组件（6 个 .py）
  - agents/ (24 KB) — Agent 模块（2 个 .py）
  - memory/ (28 KB) — 项目记忆
  - evaluation/ (20 KB) — 评估
  - references/ (16 KB) — 子文档（3 个 .md）
  - chroma_db/bm25_incremental.pkl (80 KB) — BM25 索引

- `domain-assets/rag/` (1.7 KB)
  - README.md — 数据指针说明

- `docs/paper_rag_integration.md` (5.4 KB) — 集成指南

### 改动
- 无（保持向后兼容，新加内容为 additive）

## 数据同步说明

### 仓库内 (504 KB)
- ✅ RAG Python 代码
- ✅ SKILL.md / INSTALL / USAGE / SYNC_DATA
- ✅ BM25 索引 (80 KB)
- ❌ ChromaDB sqlite (979 MB) — GitHub 100 MB 限制
- ❌ ChromaDB 索引数据 (448 MB)
- ❌ 17,503 篇论文 (16 GB) — GitHub 5 GB 硬限

### 完整数据位置
- 阿里云 ECS 47.93.53.231: `/data/rag/`
- 阿里云 OSS: `oss://pfm-team/rag/` (待配置)

### 同步方式
- 默认：`./sync_rag_data.sh` 从 ECS SCP 拉取
- 自定义：`./sync_rag_data.sh --chroma /path --papers /path`
- OSS: `./sync_rag_data.sh --oss-bucket pfm-team`

## 集成状态

### 已完成
- ✅ 仓库内代码 + 文档完整
- ✅ 数据同步脚本（支持 SCP / OSS）
- ✅ PFM UI 集成指南（`docs/paper_rag_integration.md`）

### 待定
- ⏳ 给 DongSZ001 发 PR (需要 fork)
- ⏳ 配置 OSS 凭据（如果用 OSS 同步）
- ⏳ PFM WebUI 端集成（前端按钮 + 后端 route）

## 与 PFM 现有模块关系

| 关系 | 说明 |
|------|------|
| `pf_assistant/scripts/import-ferroelectric-landau.js` | 解析 ferro 数据库，可参考 RAG 工具做 PDF 解析 |
| `pf_assistant/src/materials/` | 材料参数管理，RAG 可作为"参数来源"补充 |
| `pf_assistant/src/server/runtime-routes.js` | 添加 `/api/paper-rag/query` endpoint |
| `domain-assets/parameters/ferroelectric/` | RAG 数据作为"领域资源"补充 |
| `tools/ferro-card-editor/` / `tools/ferro-landau-editor/` | 同类工具，RAG 工具并列放置 |

## 验证

```bash
# 1. 验证 RAG 工具可加载
cd tools/paper-rag
python -c "import sys; sys.path.insert(0, '.'); from components.agent_pipeline import RAGPipeline; print('OK')"

# 2. 验证 BM25 索引
python -c "import pickle; m = pickle.load(open('chroma_db/bm25_incremental.pkl', 'rb')); print(f'{len(m.documents)} docs')"

# 3. 同步数据（如果用 ECS 源）
./sync_rag_data.sh

# 4. 端到端测试
python -c "
import sys; sys.path.insert(0, '.')
from components.agent_pipeline import query_with_rag
r = query_with_rag('PMN-PT 的 d33 上限', top_k=3)
print(r[:200])
"
```

## 后续工作

- [ ] Fork PFM_team 到 `runoobworker/PFM_team` 做测试
- [ ] 测试通过后给 DongSZ001 发 PR
- [ ] PFM WebUI 集成 "📚 查论文" 按钮
- [ ] LLM API 配置（OpenAI / 本地 vLLM）
- [ ] 性能优化：持久化 Python 服务代替 spawn

## 教训

1. **GitHub 100 MB 单文件限制是 RAG 数据上传的硬约束** — chroma.sqlite3 979 MB 必须走 OSS 或 LFS
2. **RAG 库太大时优先传代码而非数据** — 让用户自己同步数据
3. **tools/ 是放领域工具的合理位置** — 跟 ferro-card-editor/ferro-landau-editor 并列
4. **同步脚本比手动复制更可靠** — 提供 sync_rag_data.sh 自动化
5. **PFM 项目已有 47 轮迭代历史** — 这次作为 round 48 整合，保持项目一致性