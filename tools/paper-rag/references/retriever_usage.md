# 多源检索器使用指南

## MultiSourceRetriever

支持三种检索源：
1. **ChromaDB** - 向量数据库检索
2. **BM25** - 关键词稀疏检索
3. **OpenAlex** - 学术论文API检索

## 基本用法

```python
from components.multi_source_retriever import MultiSourceRetriever

retriever = MultiSourceRetriever(
    persist_dir="/data/home/3220245455/llm/vllm/agent/workspace/rag/chroma_db",
    use_openalex=True,
    openalex_email="research@example.com"
)

# 检索
docs = retriever.retrieve(query="铁电材料", top_k=10)
```

## 单独使用某检索源

```python
# 仅ChromaDB
docs = retriever.retrieve_chroma(query="铁电", top_k=5)

# 仅BM25
docs = retriever.retrieve_bm25(query="piezoelectric", top_k=5)

# 仅OpenAlex
docs = retriever.retrieve_openalex(query="ferroelectric polymer", top_k=5)
```

## query_multisource 函数

```python
from components.multi_source_retriever import query_multisource

# 融合多源结果
docs = query_multisource(
    query="PZT铁电材料",
    retriever=retriever,
    top_k=10,
    weights=[0.4, 0.3, 0.3]  # ChromaDB, BM25, OpenAlex权重
)
```

## 返回格式

```python
{
    'id': 'doc_id',
    'content': '文档内容...',
    'metadata': {
        'source': 'chroma|bm25|openalex',
        'paper_title': '论文标题',
        'authors': ['作者列表'],
        'year': 2024,
        'journal': '期刊名'
    },
    'score': 0.85  # 相似度分数
}
```
