# 安装 Paper-RAG

## 系统要求

- **Python**: >= 3.10
- **操作系统**: Linux (aarch64/x86_64)
- **内存**: 建议 >= 16 GB
- **磁盘**: 完整版需要 18 GB（chroma_db 1.4 GB + papers 16 GB + 代码 0.6 MB）

## 依赖安装

```bash
cd tools/paper-rag

# 推荐：conda 环境
conda create -n pfm-rag python=3.10
conda activate pfm-rag

# Python 依赖
pip install chromadb sentence-transformers rank-bm25 transformers torch
pip install openalex-py pypdf loguru

# MinerU (用于 PDF 解析)
pip install magic-pdf[full] --upgrade
```

## 数据同步

详见 [`SYNC_DATA.md`](./SYNC_DATA.md)

## 验证安装

```bash
# 测试组件导入
python -c "
import sys
sys.path.insert(0, 'tools/paper-rag')
from components.agent_pipeline import RAGPipeline
from components.vector_store import HybridVectorStore
print('✅ All imports OK')
"

# 测试 BM25 加载
python -c "
import pickle
with open('chroma_db/bm25_incremental.pkl', 'rb') as f:
    bm25 = pickle.load(f)
print(f'✅ BM25 loaded, {len(bm25.documents)} docs in index')
"
```

## 常见问题

### ImportError: chromadb
```bash
pip install chromadb==0.4.24
```

### ModuleNotFoundError: No module named 'mineru'
```bash
pip install magic-pdf[full]
# 或: pip install mineru[pipeline]
```

### ChromaDB 找不到 chroma.sqlite3
参见 [`SYNC_DATA.md`](./SYNC_DATA.md) 同步数据

## 升级历史

- **v0.1** (2026-04): 初版，17,503 篇 ferro/压电论文
- **v0.2** (2026-06): 集成到 PFM_team 仓库 (tools/paper-rag/)