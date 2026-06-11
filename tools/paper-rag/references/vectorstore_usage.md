# 向量库管理指南

## HybridVectorStore

混合向量存储，支持ChromaDB持久化。

## 初始化

```python
from components.vector_store import HybridVectorStore

store = HybridVectorStore(
    persist_dir="/data/home/3220245455/llm/vllm/agent/workspace/rag/chroma_db"
)
```

## 添加论文到索引

```python
result = store.add_paper("/data/home/3220245455/llm/vllm/agent/workspace/rag/papers/论文名")
# result = {'status': 'success', 'chunks_added': 50}
```

## 检索

```python
docs = store.query(query="铁电材料", top_k=5)
```

## 查看统计

```python
print(f"总chunks: {store.collection.count()}")
```

## 重建索引

```python
store.index_papers()
```

## 删除论文

```python
store.delete_paper(paper_name="论文名")
```
