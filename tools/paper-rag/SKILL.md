---
name: paper-rag
description: 论文RAG知识库系统。当用户提供论文PDF或询问科研问题时激活。(1) 用户发送论文PDF时：调用process_paper.py处理并存放到rag/data目录。(2) 用户询问科研问题时：执行Agentic RAG流程，检索知识库并生成带引用的回答。触发场景：上传论文、询问论文内容、学术问题、材料科学问题、铁电/压电材料相关问题。
---

# Paper-RAG 技能

论文RAG知识库系统，支持论文处理存储和Agentic RAG问答。

## 目录结构

```
/data/home/3220245455/llm/vllm/agent/workspace/rag/
├── data/                    # 论文PDF临时存储目录
├── papers/                  # 解析后的论文内容
├── chroma_db/               # 向量数据库
├── components/              # RAG核心组件
│   ├── agent_pipeline.py   # Agentic RAG流程
│   ├── vector_store.py     # 向量存储
│   ├── multi_source_retriever.py  # 多源检索
│   ├── cross_encoder_ranker.py   # 重排序
│   └── llm_interface.py    # LLM接口
├── process_paper.py         # 论文解析脚本
└── demo.py                  # MinerU解析
```

## 论文处理流程

当用户发送论文PDF时：

```bash
python /data/home/3220245455/llm/vllm/agent/workspace/rag/process_paper.py <pdf_path> [paper_name] [--force]
```

**处理流程：**
1. PDF复制到 `rag/data/` 目录
2. 使用MinerU解析PDF
3. 提取Markdown和图片到 `rag/papers/{论文名}/`
4. 更新ChromaDB向量索引
5. 从Crossref验证期刊信息

**输出位置：**
- 论文内容: `rag/papers/{论文名}/{论文名}.md`
- 图片: `rag/papers/{论文名}/images/`

## Agentic RAG问答流程

当用户询问科研问题时，执行以下流程：

1. **多源检索**: ChromaDB + BM25 + OpenAlex
2. **Cross-Encoder重排序**: 优化检索结果
3. **Self-Feedback迭代**: 优化回答质量
4. **引用标注**: 自动添加文献引用

**入口脚本:**

```python
# 使用RAG Pipeline
import sys
sys.path.insert(0, '/data/home/3220245455/llm/vllm/agent/workspace/rag')
from components.agent_pipeline import RAGPipeline, RAGPipelineResult

pipeline = RAGPipeline(
    enable_rerank=True,
    enable_feedback=True,
    enable_citation=True
)

result = pipeline.run("用户问题")
# result.answer - 回答内容
# result.citations - 引用列表
# result.retrieved_docs - 检索文档
```

**直接调用:**

```python
from components.agent_pipeline import query_with_rag

answer = query_with_rag(
    query="用户问题",
    enable_rerank=True,
    enable_feedback=True,
    top_k=10
)
```

## 检索已收录论文

查看已处理论文列表：

```bash
ls /data/home/3220245455/llm/vllm/agent/workspace/rag/papers/ | head -50
```

搜索特定论文：

```bash
grep -r "关键词" /data/home/3220245455/llm/vllm/agent/workspace/rag/papers/*/*.md | head -20
```

## 常用命令

```bash
# 查看知识库统计
ls /data/home/3220245455/llm/vllm/agent/workspace/rag/papers/ | wc -l

# 查看索引中的论文
python -c "from rag.components.vector_store import HybridVectorStore; store = HybridVectorStore('rag/chroma_db'); print(store.collection.count(), 'chunks')"

# 强制重新处理论文
python process_paper.py <pdf_path> --force
```

## 详细流程参考

- **Agentic RAG流程**: 查看 `references/agentic_rag_flow.md`
- **检索器使用**: 查看 `references/retriever_usage.md`
- **向量库管理**: 查看 `references/vectorstore_usage.md`
