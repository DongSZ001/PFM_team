# RAG 数据：chroma_db + papers

本目录是 RAG 数据的"指针"位置。**实际数据存储在阿里云 ECS 47.93.53.231** 或 OSS 桶中。

## 目录布局

```
domain-assets/rag/
├── README.md                  ← 本文件
└── sync_rag_data.sh           ← 软链到 tools/paper-rag/sync_rag_data.sh
```

## 数据组成（不在 Git 仓库）

| 数据 | 大小 | 内容 |
|------|------|------|
| `chroma_db/chroma.sqlite3` | 979 MB | ChromaDB 向量数据库 |
| `chroma_db/8e898d85-.../` | 448 MB | ChromaDB 索引数据 |
| `chroma_db/bm25_incremental.pkl` | 80 KB | BM25 索引（在 tools/paper-rag/chroma_db/ 仓库内）|
| `papers/` | 16 GB | 17,503 篇 ferro/压电论文 Markdown + 图片 |

## 同步

```bash
# 在 PFM_team 根目录
cd domain-assets/rag
ln -sf ../../tools/paper-rag/sync_rag_data.sh .

# 同步
./sync_rag_data.sh
```

详见 [`tools/paper-rag/SYNC_DATA.md`](../../tools/paper-rag/SYNC_DATA.md)