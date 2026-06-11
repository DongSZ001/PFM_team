#!/bin/bash
# sync_rag_data.sh - 同步 RAG 数据 (chroma_db + papers) 从远程源
# Usage:
#   ./sync_rag_data.sh                                  # 从默认 ECS 拉取
#   ./sync_rag_data.sh --chroma PATH --papers PATH       # 自定义路径
#   ./sync_rag_data.sh --oss-bucket BUCKET --region REGION  # 从 OSS 拉取

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 默认参数
CHROMA_SOURCE="admin@47.93.53.231:/data/rag/chroma_db.tar.gz"
PAPERS_SOURCE="admin@47.93.53.231:/data/rag/papers.tar.gz"
OSS_BUCKET=""
OSS_REGION="cn-hangzhou"
SSH_KEY="$HOME/.ssh/id_rsa"

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --chroma)
      CHROMA_SOURCE="$2"
      shift 2
      ;;
    --papers)
      PAPERS_SOURCE="$2"
      shift 2
      ;;
    --oss-bucket)
      OSS_BUCKET="$2"
      shift 2
      ;;
    --oss-region)
      OSS_REGION="$2"
      shift 2
      ;;
    --ssh-key)
      SSH_KEY="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--chroma PATH] [--papers PATH] [--oss-bucket BUCKET] [--oss-region REGION] [--ssh-key PATH]"
      echo ""
      echo "Default: 从 47.93.53.231 (admin@) SCP 拉取"
      echo "  - chroma_db.tar.gz → chroma_db/"
      echo "  - papers.tar.gz → papers/"
      echo ""
      echo "Examples:"
      echo "  $0                                            # 默认 ECS 拉取"
      echo "  $0 --chroma /backup/chroma_db.tar.gz         # 本地路径"
      echo "  $0 --oss-bucket pfm-team --oss-region cn-hangzhou  # OSS 拉取"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== Paper-RAG 数据同步 ==="
echo "目标目录: $SCRIPT_DIR"
echo ""

# 1. 同步 chroma_db
echo "[1/2] 同步 chroma_db (~1.4 GB)..."
if [ -n "$OSS_BUCKET" ]; then
  echo "  从 OSS 拉取: oss://$OSS_BUCKET@$OSS_REGION/chroma_db.tar.gz"
  if command -v ossutil &> /dev/null; then
    ossutil cp "oss://$OSS_BUCKET/chroma_db.tar.gz" "$SCRIPT_DIR/chroma_db.tar.gz" \
      --region "$OSS_REGION"
  else
    echo "ERROR: ossutil 未安装。请安装 ossutil 或使用 scp。"
    exit 1
  fi
elif [[ "$CHROMA_SOURCE" == *":"* ]]; then
  echo "  从 SCP 拉取: $CHROMA_SOURCE"
  scp -i "$SSH_KEY" "$CHROMA_SOURCE" "$SCRIPT_DIR/chroma_db.tar.gz"
else
  echo "  从本地复制: $CHROMA_SOURCE"
  cp "$CHROMA_SOURCE" "$SCRIPT_DIR/chroma_db.tar.gz"
fi

if [ -f "$SCRIPT_DIR/chroma_db.tar.gz" ]; then
  echo "  解压 chroma_db.tar.gz..."
  tar xzf "$SCRIPT_DIR/chroma_db.tar.gz"
  rm -f "$SCRIPT_DIR/chroma_db.tar.gz"
  echo "  ✅ chroma_db/ 同步完成"
else
  echo "  ❌ chroma_db.tar.gz 同步失败"
  exit 1
fi

# 2. 同步 papers
echo ""
echo "[2/2] 同步 papers (~16 GB)..."
if [ -n "$OSS_BUCKET" ]; then
  echo "  从 OSS 拉取: oss://$OSS_BUCKET@$OSS_REGION/papers.tar.gz"
  ossutil cp "oss://$OSS_BUCKET/papers.tar.gz" "$SCRIPT_DIR/papers.tar.gz" \
    --region "$OSS_REGION"
elif [[ "$PAPERS_SOURCE" == *":"* ]]; then
  echo "  从 SCP 拉取: $PAPERS_SOURCE"
  scp -i "$SSH_KEY" "$PAPERS_SOURCE" "$SCRIPT_DIR/papers.tar.gz"
else
  echo "  从本地复制: $PAPERS_SOURCE"
  cp "$PAPERS_SOURCE" "$SCRIPT_DIR/papers.tar.gz"
fi

if [ -f "$SCRIPT_DIR/papers.tar.gz" ]; then
  echo "  解压 papers.tar.gz..."
  tar xzf "$SCRIPT_DIR/papers.tar.gz"
  rm -f "$SCRIPT_DIR/papers.tar.gz"
  echo "  ✅ papers/ 同步完成"
else
  echo "  ❌ papers.tar.gz 同步失败"
  exit 1
fi

# 3. 验证
echo ""
echo "=== 验证 ==="
if [ -d chroma_db/chroma.sqlite3 ] || [ -f chroma_db/chroma.sqlite3 ]; then
  SIZE=$(stat -c %s chroma_db/chroma.sqlite3)
  echo "  chroma.sqlite3: $SIZE bytes"
fi
PAPER_COUNT=$(ls papers/ 2>/dev/null | wc -l)
echo "  papers/ 目录: $PAPER_COUNT 个"

echo ""
echo "✅ RAG 数据同步完成！"
echo "现在可以：python process_paper.py /path/to/paper.pdf"