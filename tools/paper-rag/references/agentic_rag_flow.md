# Agentic RAG 流程详解

## 完整流程

```
用户问题
    ↓
┌─────────────────────────────┐
│  1. 多源检索                  │
│  ChromaDB + BM25 + OpenAlex  │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  2. Cross-Encoder重排序       │
│  优化top-k结果               │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  3. Self-Feedback迭代        │
│  质量优化（如启用）            │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  4. 引用标注                  │
│  自动添加文献引用              │
└─────────────────────────────┘
    ↓
  最终回答
```

## 代码示例

```python
import sys
sys.path.insert(0, '/data/home/3220245455/llm/vllm/agent/workspace/rag')

from components.agent_pipeline import RAGPipeline, RAGPipelineResult

# 初始化Pipeline
pipeline = RAGPipeline(
    enable_rerank=True,      # 启用重排序
    enable_feedback=True,     # 启用Self-Feedback
    enable_citation=True,     # 启用引用标注
    enable_evaluation=False   # 禁用评估（加速）
)

# 执行查询
result: RAGPipelineResult = pipeline.run(
    query="铁电材料的极化翻转机制是什么？",
    top_k=10                  # 检索数量
)

print(f"回答: {result.answer}")
print(f"引用: {result.citations}")
print(f"检索文档数: {len(result.retrieved_docs)}")
print(f"迭代次数: {result.iterations}")
print(f"延迟: {result.latency_ms}ms")
```

## 返回值说明

```python
@dataclass
class RAGPipelineResult:
    query: str              # 原始问题
    answer: str             # 生成的回答
    retrieved_docs: List[Dict]  # 检索文档
    reranked_docs: List[Dict]  # 重排序后文档
    feedback_history: List[List[str]]  # 反馈历史
    iterations: int         # 迭代次数
    citations: List[Dict]   # 引用列表
    evaluation: Optional[Dict]  # 评估结果
    latency_ms: float       # 延迟
    llm_provider: str      # LLM供应商
```

## 直接查询函数

更简单的调用方式：

```python
from components.agent_pipeline import query_with_rag

answer = query_with_rag(
    query="PMN-PT的相变温度是多少？",
    enable_rerank=True,
    enable_feedback=True,
    top_k=5
)
```

## 高级用法

### 自定义检索器

```python
from components.multi_source_retriever import MultiSourceRetriever

retriever = MultiSourceRetriever(
    persist_dir="/data/home/3220245455/llm/vllm/agent/workspace/rag/chroma_db",
    use_openalex=True,
    openalex_email="your@email.com"
)

# 单独检索
docs = retriever.retrieve(query="铁电", top_k=10)
```

### 自定义LLM

```python
from components.llm_interface import UnifiedLLM, LLMProvider, get_unified_llm

llm = get_unified_llm(
    primary=LLMProvider.MINIMAX,
    fallback=LLMProvider.VLLM
)

pipeline = RAGPipeline(llm=llm)
```
