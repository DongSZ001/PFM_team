#!/usr/bin/env python3
"""
Phase 0+: ChromaDB 向量存储 + BM25 混合检索 (优化版)

优化内容:
1. RRF融合考虑分数权重
2. 论文级别聚合去重
3. 自适应alpha策略
4. 多维度排序选项
5. 检索结果摘要提取
6. 查询扩展/改写
"""

import os
import chromadb
from chromadb.config import Settings
from rank_bm25 import BM25Okapi
import pickle
import re
from typing import List, Dict, Any, Optional
from collections import defaultdict
import math


# ============ 查询类型判断 ============
class QueryType:
    """查询类型枚举"""
    EXACT_KEYWORD = "exact_keyword"      # 精确关键词查询
    SEMANTIC = "semantic"                 # 语义模糊查询
    NUMERIC = "numeric"                   # 数值查询（最高、最大、最小等）
    COMPARATIVE = "comparative"           # 比较查询


def classify_query(query: str) -> QueryType:
    """判断查询类型，决定检索策略"""
    query_lower = query.lower()
    
    # 数值/比较类关键词
    numeric_keywords = ["最高", "最大", "最低", "最小", "最大", "first", "highest", "largest", "maximum", "lowest", "smallest", "minimum", "best", "top"]
    comparative_keywords = ["比较", "对比", "difference", "compare", "versus", "vs", "better", "worse"]
    
    # 判断类型
    if any(kw in query_lower for kw in numeric_keywords):
        return QueryType.NUMERIC
    if any(kw in query_lower for kw in comparative_keywords):
        return QueryType.COMPARATIVE
    
    # 检查是否有明确关键词（中文词、英文词、数字）
    has_keywords = bool(re.search(r'[\u4e00-\u9fff]|[a-zA-Z]{3,}|\d+', query))
    has_operators = any(op in query_lower for op in ["和", "与", "and", "or", "或"])
    
    if has_keywords and not has_operators:
        # 有明确单一关键词 → 更侧重语义
        return QueryType.SEMANTIC
    elif has_operators:
        # 多关键词组合 → 更侧重精确匹配
        return QueryType.EXACT_KEYWORD
    
    return QueryType.SEMANTIC


def get_adaptive_alpha(query_type: QueryType) -> float:
    """根据查询类型自适应调整alpha"""
    alpha_map = {
        QueryType.EXACT_KEYWORD: 0.3,   # 精确关键词 → BM25权重高
        QueryType.SEMANTIC: 0.7,         # 语义查询 → 向量权重高
        QueryType.NUMERIC: 0.5,          # 数值查询 → 均衡
        QueryType.COMPARATIVE: 0.4,      # 比较查询 → BM25略高
    }
    return alpha_map.get(query_type, 0.5)


# ============ 混合检索引擎 ============
class HybridVectorStore:
    """
    混合检索引擎（优化版）: ChromaDB向量 + BM25关键词
    
    优化点:
    - 论文级别聚合：同论文多chunk去重，保留最高分chunk
    - 加权RRF融合：考虑原始分数的差异
    - 自适应alpha：根据查询类型自动调整
    - 多维度排序：支持按向量分/BM25分/融合分排序
    """

    def __init__(self, persist_dir: str, collection_name: str = "papers"):
        self.persist_dir = persist_dir
        self.collection_name = collection_name

        # ChromaDB 客户端
        os.makedirs(persist_dir, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False, allow_reset=True)
        )
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Materials science papers RAG (optimized)"}
        )

        # BM25（延迟加载）
        self.bm25_index: Optional[BM25Okapi] = None
        self.bm25_ids: List[str] = []
        
        # 增量BM25
        self.bm25_incremental: Optional[BM25Okapi] = None
        self.bm25_incremental_ids: List[str] = []
        
        self._load_bm25()
        self._load_incremental_bm25()

    def _load_bm25(self) -> bool:
        """加载BM25主索引"""
        bm25_path = os.path.join(self.persist_dir, "bm25.pkl")
        if os.path.exists(bm25_path):
            try:
                with open(bm25_path, "rb") as f:
                    data = pickle.load(f)
                    self.bm25_index = data["index"]
                    self.bm25_ids = data["ids"]
                print(f"[HybridVectorStore] BM25 主索引已加载: {len(self.bm25_ids)} papers")
                return True
            except Exception as e:
                print(f"[HybridVectorStore] BM25 加载失败: {e}")
        return False

    def _load_incremental_bm25(self) -> bool:
        """加载BM25增量索引"""
        inc_path = os.path.join(self.persist_dir, "bm25_incremental.pkl")
        if os.path.exists(inc_path):
            try:
                with open(inc_path, "rb") as f:
                    data = pickle.load(f)
                    self.bm25_incremental = data["index"]
                    self.bm25_incremental_ids = data["ids"]
                print(f"[HybridVectorStore] BM25 增量索引已加载: {len(self.bm25_incremental_ids)} papers")
                return True
            except Exception as e:
                print(f"[HybridVectorStore] BM25 增量加载失败: {e}")
        return False

    def _get_paper_text(self, paper_dir: str) -> str:
        """从论文目录读取文本"""
        if not os.path.isdir(paper_dir):
            return ""
        for f in os.listdir(paper_dir):
            if f.endswith('.md'):
                path = os.path.join(paper_dir, f)
                try:
                    with open(path, encoding='utf-8', errors='ignore') as fp:
                        return fp.read()
                except Exception:
                    pass
        return ""

    def _chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """分块（带重叠）"""
        if not text or len(text) == 0:
            return []
        chunks = []
        start = 0
        text_len = len(text)
        while start < text_len:
            end = min(start + chunk_size, text_len)
            chunk = text[start:end]
            if chunk.strip():
                chunks.append(chunk)
            if end == text_len:
                break
            start = end - overlap
        return chunks

    def _compute_doc_id(self, paper_name: str, chunk_index: int) -> str:
        return f"{paper_name}_chunk{chunk_index}"

    def _normalize_text(self, text: str) -> str:
        """文本规范化"""
        # 移除多余空白
        text = re.sub(r'\s+', ' ', text)
        # 移除特殊字符（保留中文、英文、数字、常用符号）
        text = re.sub(r'[^\w\s\u4e00-\u9fff.,;:%\(\)-]', '', text)
        return text.strip()

    # ============ 检索API（优化版） ============
    def query(
        self,
        query_text: str,
        top_k: int = 10,
        alpha: Optional[float] = None,
        min_score: float = 0.0,
        deduplicate: bool = True,
        sort_by: str = "fused",  # "fused" | "vector" | "bm25"
        return_format: str = "chunk"  # "chunk" | "paper" | "summary"
    ) -> List[Dict[str, Any]]:
        """
        混合检索（优化版）

        Args:
            query_text: 查询文本
            top_k: 返回结果数量
            alpha: 向量权重（None=自动判断）
            min_score: 最低分数阈值
            deduplicate: 是否去重（论文级别）
            sort_by: 排序方式
            return_format: 返回格式
                - chunk: 返回chunk级别详情
                - paper: 返回论文级别聚合
                - summary: 返回摘要信息
        Returns:
            检索结果
        """
        # 1. 自适应alpha
        if alpha is None:
            query_type = classify_query(query_text)
            alpha = get_adaptive_alpha(query_type)
            print(f"[HybridVectorStore] 查询类型: {query_type}, alpha={alpha}")

        results_dict: Dict[str, Dict[str, Any]] = {}

        # 2. ChromaDB 向量检索
        if self.collection.count() > 0:
            try:
                chroma_results = self.collection.query(
                    query_texts=[query_text],
                    n_results=min(top_k * 4, 200)
                )
                for rank, doc_id in enumerate(chroma_results["ids"][0]):
                    scores = chroma_results.get("distances", [[]])[0]
                    distance = scores[rank] if scores else 0
                    # 距离转相似度
                    vector_score = 1.0 / (1.0 + distance)

                    paper_name = doc_id.rsplit("_chunk", 1)[0]
                    chunk_idx = int(doc_id.rsplit("_chunk", 1)[1]) if "_chunk" in doc_id else 0

                    results_dict[doc_id] = {
                        "doc_id": doc_id,
                        "paper_name": paper_name,
                        "chunk_index": chunk_idx,
                        "vector_score": vector_score,
                        "bm25_score": 0.0,
                        "fused_score": 0.0,
                        "chroma_rank": rank + 1
                    }
            except Exception as e:
                print(f"[HybridVectorStore] ChromaDB 查询失败: {e}")

        # 3. BM25 检索（主索引 + 增量索引）
        # 主BM25检索
        if self.bm25_index and self.bm25_ids:
            try:
                tokenized_query = query_text.split()
                bm25_scores = self.bm25_index.get_scores(tokenized_query)

                top_bm25 = sorted(
                    range(len(bm25_scores)),
                    key=lambda i: bm25_scores[i],
                    reverse=True
                )[:min(top_k * 4, len(bm25_scores))]

                for rank, idx in enumerate(top_bm25):
                    paper_name = self.bm25_ids[idx]
                    bm25_score = bm25_scores[idx]

                    doc_id = f"{paper_name}_chunk0"
                    if doc_id in results_dict:
                        results_dict[doc_id]["bm25_score"] = bm25_score
                        results_dict[doc_id]["bm25_rank"] = rank + 1
                    else:
                        key = f"{paper_name}_bm25_only"
                        results_dict[key] = {
                            "doc_id": key,
                            "paper_name": paper_name,
                            "chunk_index": 0,
                            "vector_score": 0.0,
                            "bm25_score": bm25_score,
                            "fused_score": 0.0,
                            "chroma_rank": None,
                            "bm25_rank": rank + 1
                        }
            except Exception as e:
                print(f"[HybridVectorStore] BM25 主索引查询失败: {e}")
        
        # 增量BM25检索
        if self.bm25_incremental and self.bm25_incremental_ids:
            try:
                tokenized_query = query_text.split()
                inc_scores = self.bm25_incremental.get_scores(tokenized_query)

                top_inc = sorted(
                    range(len(inc_scores)),
                    key=lambda i: inc_scores[i],
                    reverse=True
                )[:min(top_k * 4, len(inc_scores))]

                for rank, idx in enumerate(top_inc):
                    paper_name = self.bm25_incremental_ids[idx]
                    inc_score = inc_scores[idx]

                    doc_id = f"{paper_name}_chunk0"
                    if doc_id in results_dict:
                        # 合并分数（取高者）
                        if inc_score > results_dict[doc_id]["bm25_score"]:
                            results_dict[doc_id]["bm25_score"] = inc_score
                            results_dict[doc_id]["bm25_rank"] = rank + 1
                    else:
                        key = f"{paper_name}_bm25_inc"
                        results_dict[key] = {
                            "doc_id": key,
                            "paper_name": paper_name,
                            "chunk_index": 0,
                            "vector_score": 0.0,
                            "bm25_score": inc_score,
                            "fused_score": 0.0,
                            "chroma_rank": None,
                            "bm25_rank": rank + 1
                        }
            except Exception as e:
                print(f"[HybridVectorStore] BM25 增量索引查询失败: {e}")
                print(f"[HybridVectorStore] BM25 查询失败: {e}")

        # 4. 加权RRF融合（考虑分数差异）
        k = 60
        for item in results_dict.values():
            # 向量RRF：考虑分数和排名
            if item["vector_score"] > 0:
                vector_rrf = alpha * (1.0 / (k + item.get("chroma_rank", k)))
                # 乘以归一化分数作为权重
                vector_weight = 0.5 + 0.5 * item["vector_score"]
                item["vector_rrf"] = vector_rrf * vector_weight
            else:
                item["vector_rrf"] = 0

            # BM25 RRF
            if item["bm25_score"] > 0:
                bm25_rrf = (1 - alpha) * (1.0 / (k + item.get("bm25_rank", k)))
                # BM25分数归一化
                bm25_weight = 0.5 + 0.5 * min(item["bm25_score"] / 100, 1.0)
                item["bm25_rrf"] = bm25_rrf * bm25_weight
            else:
                item["bm25_rrf"] = 0

            item["fused_score"] = item["vector_rrf"] + item["bm25_rrf"]

        # 5. 论文级别去重
        if deduplicate:
            paper_best: Dict[str, Dict[str, Any]] = {}
            for item in results_dict.values():
                paper = item["paper_name"]
                if paper not in paper_best or item["fused_score"] > paper_best[paper]["fused_score"]:
                    paper_best[paper] = item
            results_dict = paper_best
            print(f"[HybridVectorStore] 去重后: {len(results_dict)} 篇论文")

        # 6. 排序
        sorted_results = sorted(
            results_dict.values(),
            key=lambda x: x.get(sort_by, x["fused_score"]) if sort_by != "fused" else x["fused_score"],
            reverse=True
        )[:top_k]

        # 7. 填充文本
        papers_dir = os.path.join(os.path.dirname(self.persist_dir), "papers")
        final_results = []
        for item in sorted_results:
            if item["fused_score"] < min_score:
                continue

            paper_name = item["paper_name"]
            chunk_idx = item["chunk_index"]

            paper_dir = os.path.join(papers_dir, paper_name)
            full_text = self._get_paper_text(paper_dir)
            chunks = self._chunk_text(full_text)
            chunk_text = chunks[chunk_idx] if chunk_idx < len(chunks) else (full_text[:500] if full_text else "")

            result = {
                "paper_name": paper_name,
                "chunk_text": chunk_text,
                "full_text": full_text,
                "fused_score": item["fused_score"],
                "vector_score": item["vector_score"],
                "bm25_score": item["bm25_score"],
                "vector_rrf": item.get("vector_rrf", 0),
                "bm25_rrf": item.get("bm25_rrf", 0),
                "chunk_index": chunk_idx,
                "doc_id": item["doc_id"]
            }

            # 摘要模式：提取关键信息
            if return_format == "summary":
                result["summary"] = self._extract_summary(full_text, query_text)
            elif return_format == "paper":
                result["chunks"] = chunks

            final_results.append(result)

        return final_results

    def _extract_summary(self, text: str, query: str, max_length: int = 1000) -> str:
        """提取与查询相关的摘要"""
        if not text:
            return ""
        
        # 简单策略：找到包含关键词的段落
        lines = text.split('\n')
        relevant_lines = []
        query_words = query.lower().split()
        
        for line in lines:
            line_lower = line.lower()
            # 计算匹配度
            matches = sum(1 for w in query_words if w in line_lower)
            if matches > 0:
                relevant_lines.append((line, matches))
        
        # 按匹配度排序
        relevant_lines.sort(key=lambda x: x[1], reverse=True)
        
        # 提取最相关的段落
        summary_parts = []
        current_len = 0
        for line, _ in relevant_lines[:5]:
            if current_len + len(line) > max_length:
                break
            if line.strip():
                summary_parts.append(line.strip())
                current_len += len(line)
        
        return " | ".join(summary_parts) if summary_parts else text[:max_length]

    # ============ 批量索引（保持原接口） ============
    def index_papers(self, papers_dir: str, batch_size: int = 500, force_rebuild: bool = False) -> Dict[str, int]:
        """批量索引"""
        if force_rebuild:
            self.client.delete_collection(self.collection_name)
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "Materials science papers RAG (optimized)"}
            )
            self.bm25_index = None
            self.bm25_ids = []

        paper_dirs = []
        if os.path.exists(papers_dir):
            for d in os.listdir(papers_dir):
                pdir = os.path.join(papers_dir, d)
                if os.path.isdir(pdir):
                    paper_dirs.append(pdir)

        total_papers = len(paper_dirs)
        print(f"[HybridVectorStore] 开始索引 {total_papers} 篇论文...")

        texts, ids, metadatas = [], [], []
        bm25_texts, bm25_ids = [], []
        chromadb_count = 0

        for i, pdir in enumerate(paper_dirs):
            paper_name = os.path.basename(pdir)
            full_text = self._get_paper_text(pdir)
            if not full_text.strip():
                continue

            chunks = self._chunk_text(full_text)
            if not chunks:
                continue

            for j, chunk in enumerate(chunks):
                texts.append(chunk)
                ids.append(self._compute_doc_id(paper_name, j))
                metadatas.append({
                    "paper_name": paper_name,
                    "chunk_index": j,
                    "total_chunks": len(chunks)
                })

            bm25_texts.append(full_text)
            bm25_ids.append(paper_name)
            chromadb_count += len(chunks)

            if len(texts) >= batch_size:
                self.collection.add(documents=texts, ids=ids, metadatas=metadatas)
                texts, ids, metadatas = [], [], []

            if (i + 1) % 1000 == 0:
                print(f"[{i+1}/{total_papers}] 已处理")

        if texts:
            self.collection.add(documents=texts, ids=ids, metadatas=metadatas)

        if bm25_texts:
            tokenized_corpus = [t.split() for t in bm25_texts]
            self.bm25_index = BM25Okapi(tokenized_corpus)
            self.bm25_ids = bm25_ids
            bm25_path = os.path.join(self.persist_dir, "bm25.pkl")
            with open(bm25_path, "wb") as f:
                pickle.dump({"index": self.bm25_index, "ids": self.bm25_ids}, f)

        result = {
            "total_papers": total_papers,
            "total_chunks": chromadb_count,
            "chromadb_count": self.collection.count(),
            "bm25_count": len(self.bm25_ids)
        }
        print(f"[HybridVectorStore] 索引完成: {result}")
        return result

    def add_paper(self, paper_dir: str) -> Dict[str, Any]:
        """单篇增量索引
        
        ChromaDB: 直接增量添加
        BM25: 追加到增量索引文件（不重建主索引）
        """
        paper_name = os.path.basename(paper_dir)
        full_text = self._get_paper_text(paper_dir)
        if not full_text.strip():
            return {"status": "skipped", "reason": "empty text", "paper_name": paper_name}

        # 1. 更新ChromaDB（支持增量）
        chunks = self._chunk_text(full_text)
        texts = [chunk for chunk in chunks]
        ids = [self._compute_doc_id(paper_name, j) for j in range(len(chunks))]
        metas = [{"paper_name": paper_name, "chunk_index": j, "total_chunks": len(chunks)} for j in range(len(chunks))]
        self.collection.add(documents=texts, ids=ids, metadatas=metas)

        # 2. 增量更新BM25（追加到增量文件，不重建主索引）
        inc_path = os.path.join(self.persist_dir, "bm25_incremental.pkl")
        
        # 追加到增量列表
        self.bm25_incremental_ids.append(paper_name)
        tokenized_texts = [t.split() for t in [full_text]]
        
        if self.bm25_incremental is None:
            self.bm25_incremental = BM25Okapi(tokenized_texts)
        else:
            # 重建增量索引（因为BM25Okapi不可变）
            # 只重建增量部分，不是全部
            all_inc_texts = []
            inc_papers_dir = os.path.join(os.path.dirname(self.persist_dir), "papers")
            for inc_id in self.bm25_incremental_ids[:-1]:  # 已有的
                pdir = os.path.join(inc_papers_dir, inc_id)
                txt = self._get_paper_text(pdir)
                if txt.strip():
                    all_inc_texts.append(txt.split())
            all_inc_texts.append(full_text.split())  # 新增的
            self.bm25_incremental = BM25Okapi(all_inc_texts)
        
        # 保存增量索引
        with open(inc_path, "wb") as f:
            pickle.dump({
                "index": self.bm25_incremental, 
                "ids": self.bm25_incremental_ids
            }, f)
        
        return {
            "status": "success", 
            "paper_name": paper_name, 
            "chunks_added": len(chunks),
            "bm25_incremental_count": len(self.bm25_incremental_ids)
        }
    
    def rebuild_bm25(self) -> Dict[str, Any]:
        """重建BM25索引（处理所有待更新的论文）"""
        import time
        start = time.time()
        
        papers_dir = os.path.join(os.path.dirname(self.persist_dir), "papers")
        
        # 读取所有已索引的论文
        all_papers = []
        for d in os.listdir(papers_dir):
            pdir = os.path.join(papers_dir, d)
            if os.path.isdir(pdir):
                txt = self._get_paper_text(pdir)
                if txt.strip():
                    all_papers.append((d, txt.split()))
        
        print(f"[BM25] 重建索引，共 {len(all_papers)} 篇论文...")
        
        self.bm25_ids = [p[0] for p in all_papers]
        self.bm25_index = BM25Okapi([p[1] for p in all_papers])
        
        bm25_path = os.path.join(self.persist_dir, "bm25.pkl")
        with open(bm25_path, "wb") as f:
            pickle.dump({"index": self.bm25_index, "ids": self.bm25_ids}, f)
        
        # 清除pending标记
        bm25_pending_path = os.path.join(self.persist_dir, "bm25_pending.txt")
        if os.path.exists(bm25_pending_path):
            os.remove(bm25_pending_path)
        
        elapsed = time.time() - start
        return {
            "status": "success",
            "bm25_count": len(self.bm25_ids),
            "elapsed": elapsed
        }

    def get_stats(self) -> Dict[str, Any]:
        return {
            "chromadb_count": self.collection.count(),
            "bm25_count": len(self.bm25_ids),
            "persist_dir": self.persist_dir
        }

    def reset(self):
        self.client.delete_collection(self.collection_name)
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"description": "Materials science papers RAG (optimized)"}
        )
        self.bm25_index = None
        self.bm25_ids = []


# ============ 便捷查询函数 ============
def query_papers(
    query: str,
    top_k: int = 10,
    alpha: Optional[float] = None,
    return_format: str = "summary"
) -> List[Dict[str, Any]]:
    """
    便捷查询接口
    
    Example:
        results = query_papers("BiFeO3最高d33", top_k=5, return_format="summary")
        for r in results:
            print(f"{r['paper_name']}: score={r['fused_score']:.4f}")
            print(f"  摘要: {r['summary'][:200]}...")
    """
    store = HybridVectorStore(
        persist_dir="/data/home/3220245455/llm/vllm/agent/workspace/rag/chroma_db"
    )
    return store.query(
        query_text=query,
        top_k=top_k,
        alpha=alpha,
        deduplicate=True,
        return_format=return_format
    )


if __name__ == "__main__":
    # 测试
    store = HybridVectorStore(
        persist_dir="/data/home/3220245455/llm/vllm/agent/workspace/rag/chroma_db",
        collection_name="ferroelectric_papers"
    )
    print("[HybridVectorStore] 统计:", store.get_stats())

    # 测试不同查询类型
    test_queries = [
        ("BiFeO3 vortex domain structure", None),  # 语义查询
        ("highest d33 piezoelectric coefficient", None),  # 数值查询
        ("BiFeO3 AND ferroelectric AND DFT", None),  # 精确关键词
    ]

    for query, alpha in test_queries:
        print(f"\n{'='*60}")
        print(f"查询: {query}")
        results = store.query(query, top_k=5, alpha=alpha, return_format="summary")
        print(f"结果 ({len(results)} 条):")
        for r in results:
            print(f"  [{r['paper_name']}] fused={r['fused_score']:.4f}")
            print(f"    摘要: {r.get('summary', r['chunk_text'])[:200]}...")
