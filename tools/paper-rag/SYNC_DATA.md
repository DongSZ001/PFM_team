# 数据同步说明

## 重要：仓库只含 BM25 索引 + RAG 代码，**不含完整数据**

由于 GitHub 单文件 100 MB 限制和 5 GB 仓库硬限，**完整的 chroma_db/ 和 papers/ 数据没有上传到本仓库**。

仓库**仅包含**：
- `chroma_db/bm25_incremental.pkl` (80 KB) — BM25 关键词索引（轻量）
- 所有 RAG Python 组件代码

仓库**不包含**：
- `chroma_db/chroma.sqlite3` (979 MB) — ChromaDB 向量数据库
- `chroma_db/8e898d85-.../` (448 MB) — ChromaDB 索引数据
- `papers/` (16 GB) — 17,503 篇 PDF 解析后的 Markdown + 图片

## 同步方式

### 选项 A：从阿里云 ECS 47.93.53.231 同步（推荐）

如果 PFM_team 服务器与 RAG 数据源同地域：

```bash
# 在 47.93.53.231 上
cd /data/home/3220245455/llm/vllm/agent/workspace/rag
tar czf chroma_db.tar.gz chroma_db/
tar czf papers.tar.gz papers/

# 复制到 PFM_team 工作目录
cp chroma_db.tar.gz papers.tar.gz /home/admin/.openclaw/workspace/pf-assistant-webui/tools/paper-rag/

# 在 PFM_team 目录解压
cd tools/paper-rag
tar xzf chroma_db.tar.gz  # 还原 chroma_db/ 目录（含完整 1.4 GB 数据）
tar xzf papers.tar.gz     # 还原 papers/ 目录（含 17,503 篇论文）
```

### 选项 B：使用 sync_rag_data.sh 脚本

仓库提供 `sync_rag_data.sh` 自动化同步脚本（待配置 OSS/SCP 后可用）：

```bash
# 默认：从 ECS 47.93.53.231 拉取（需要 SSH 密钥）
cd tools/paper-rag
./sync_rag_data.sh

# 自定义：从指定路径同步
./sync_rag_data.sh --chroma /path/to/chroma_db.tar.gz --papers /path/to/papers.tar.gz
```

### 选项 C：从原始 PDF 重建（最慢但可重现）

如果完全无法获得 chroma_db.tar.gz，可以从原始 PDF 重新构建：

```bash
# 1. 获取 PDF 源（17,503 篇 ferro/压电 PDF）
#    来源：课题组内部分享 / 阿里云 OSS / arXiv 批量下载

# 2. 创建 papers/ 目录结构
mkdir -p papers

# 3. 批量处理 PDF
for pdf in /path/to/pdfs/*.pdf; do
    python process_paper.py "$pdf"
done

# 4. 重建向量索引（首次需要 2-4 小时）
python -c "
import sys
sys.path.insert(0, 'tools/paper-rag')
from components.vector_store import HybridVectorStore
store = HybridVectorStore('chroma_db/')
# 自动增量构建...
"
```

## 本地软链访问

`tools/paper-rag/` 中已建 2 个软链方便本地开发（**不进入 Git**，被 `.gitignore` 排除）：

| 软链 | 指向 | 大小 |
|------|------|------|
| `legacy_data` | `../../workspace/rag/` | 18 GB（17,503 论文 + chroma_db）|
| `legacy_skill` | `../../workspace/skills/paper-rag/` | 16 KB（原始技能）|

## 数据完整性检查

同步后验证：

```bash
# 检查 chroma.sqlite3
ls -la chroma_db/chroma.sqlite3  # 应该 ~979 MB

# 检查 BM25
ls -la chroma_db/bm25_incremental.pkl  # 80 KB

# 检查 papers
ls papers/ | wc -l  # 应该 17503

# 测 RAG Pipeline
python -c "
import sys
sys.path.insert(0, 'tools/paper-rag')
from components.vector_store import HybridVectorStore
store = HybridVectorStore('chroma_db/')
print('ChromaDB docs:', store.collection.count())
"
```

## 推荐存储位置

完整 RAG 数据建议存放在阿里云 ECS 47.93.53.231 本地：
- `/data/rag/chroma_db/` — 向量数据库
- `/data/rag/papers/` — 论文 Markdown + 图片

或者阿里云 OSS：
- `oss://pfm-team/rag/chroma_db.tar.gz`
- `oss://pfm-team/rag/papers.tar.gz`