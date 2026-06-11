# Paper-RAG 工具

铁电/压电/相场主题论文 RAG 知识库工具。

## 概述

`paper-rag` 是 **铁电/压电/相场研究**的论文检索增强生成（RAG）工具，提供：

- **多源检索**: ChromaDB 向量库 + BM25 关键词检索 + OpenAlex 学术搜索
- **Cross-Encoder 重排序**: 优化检索结果相关性
- **Self-Feedback 迭代**: 自动改进回答质量
- **引用标注**: 自动添加文献引用（带 DOI/期刊信息）
- **论文解析**: PDF → Markdown（含图片/表格/公式）

## 目录结构

```
tools/paper-rag/
├── SKILL.md                  # 技能入口文档
├── INSTALL.md                # 安装说明
├── USAGE.md                  # 使用说明（PFM UI 集成）
├── SYNC_DATA.md              # 数据同步说明（chroma_db / papers）
├── sync_rag_data.sh          # 数据同步脚本
├── process_paper.py          # 论文 PDF 处理脚本
├── demo.py                   # MinerU 解析
├── rag_index.md              # 17,503 篇论文索引
├── fusion_result.json        # 多源检索融合结果
├── components/               # RAG 核心组件
│   ├── agent_pipeline.py     # Agentic RAG 主流程
│   ├── vector_store.py        # ChromaDB 向量存储
│   ├── multi_source_retriever.py  # 多源检索
│   ├── cross_encoder_ranker.py     # 重排序
│   ├── cross_encoder_onnx.py      # ONNX 推理
│   └── llm_interface.py       # LLM 接口
├── agents/                   # Agent 模块
│   ├── self_feedback.py       # 自我反馈
│   └── citation_annotator.py  # 引用标注
├── memory/                   # 项目记忆
│   └── project_memory.py
├── evaluation/               # 评估
│   └── rag_evaluator.py
├── references/               # 详细文档
│   ├── agentic_rag_flow.md
│   ├── retriever_usage.md
│   └── vectorstore_usage.md
└── chroma_db/                # BM25 索引 (80 KB)
    └── bm25_incremental.pkl
```

## 快速使用

### 1. 同步数据（首次使用）
参见 [`SYNC_DATA.md`](./SYNC_DATA.md)

### 2. 处理新论文
```bash
cd tools/paper-rag
python process_paper.py /path/to/paper.pdf
```

### 3. RAG 问答
```python
import sys
sys.path.insert(0, 'tools/paper-rag')
from components.agent_pipeline import query_with_rag

answer = query_with_rag(
    query="PMN-PT 的 d33 上限是多少？",
    enable_rerank=True,
    enable_feedback=True,
    top_k=10
)
print(answer)
```

详见 [`USAGE.md`](./USAGE.md)

## 与 PFM 助手集成

参见 [`docs/paper_rag_integration.md`](../../docs/paper_rag_integration.md)

## 论文统计

- **总数**: 17,503 篇
- **主题分布**: 铁电、压电、介电、相场、弛豫体、铁磁
- **最新收录**: 2026-04-05
- **数据来源**: MinerU 解析的 ferro/压电相关 PDF

## 维护

- **作者**: 课题组
- **许可**: 仅限课题组内部使用
- **归属**: 北京理工大学黄厚兵课题组