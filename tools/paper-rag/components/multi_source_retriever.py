#!/usr/bin/env python3
"""
多源检索器 - 参考OpenScholar设计

检索来源:
1. ChromaDB (向量检索)
2. BM25 (关键词检索)
3. OpenAlex API (学术元数据)

作者: 基于OpenScholar论文优化
日期: 2026-04-08
"""

import os
import sys
import pickle
import requests
from typing import List, Dict, Any, Optional, Tuple
from rank_bm25 import BM25Okapi
import chromadb
from chromadb.config import Settings


class MultiSourceRetriever:
    """
    多源检索器
    
    支持三种检索源:
    - ChromaDB: 向量语义检索
    - BM25: 关键词精确匹配
    - OpenAlex: 学术API检索
    """
    
    def __init__(
        self,
        persist_dir: str,
        openalex_email: str = "research@example.com",
        top_k: int = 20,
        use_openalex: bool = True
    ):
        """
        初始化多源检索器
        
        Args:
            persist_dir: ChromaDB和BM25索引目录
            openalex_email: OpenAlex API联系邮箱（必填）
            top_k: 默认返回结果数
            use_openalex: 是否启用OpenAlex检索
        """
        self.persist_dir = persist_dir
        self.openalex_email = openalex_email
        self.default_top_k = top_k
        self.use_openalex = use_openalex
        
        # 初始化各源
        self._init_chromadb()
        self._load_bm25()
        
        print(f"[MultiSourceRetriever] 初始化完成")
        print(f"  - ChromaDB: {self.collection.count()} chunks")
        print(f"  - BM25: {len(self.bm25_ids)} papers")
        print(f"  - OpenAlex: {'启用' if use_openalex else '禁用'}")
    
    def _init_chromadb(self):
        """初始化ChromaDB客户端"""
        os.makedirs(self.persist_dir, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=self.persist_dir,
            settings=Settings(anonymized_telemetry=False, allow_reset=True)
        )
        self.collection = self.client.get_or_create_collection(
            name="papers",
            metadata={"description": "Materials science papers RAG"}
        )
    
    def _load_bm25(self) -> bool:
        """加载BM25索引"""
        # 主索引
        bm25_path = os.path.join(self.persist_dir, "bm25.pkl")
        if os.path.exists(bm25_path):
            try:
                with open(bm25_path, "rb") as f:
                    data = pickle.load(f)
                    self.bm25_index = data["index"]
                    self.bm25_ids = data["ids"]
                print(f"[MultiSourceRetriever] BM25主索引已加载: {len(self.bm25_ids)} papers")
            except Exception as e:
                print(f"[MultiSourceRetriever] BM25加载失败: {e}")
                self.bm25_index = None
                self.bm25_ids = []
        
        # 增量索引
        inc_path = os.path.join(self.persist_dir, "bm25_incremental.pkl")
        if os.path.exists(inc_path):
            try:
                with open(inc_path, "rb") as f:
                    data = pickle.load(f)
                    self.bm25_incremental = data["index"]
                    self.bm25_incremental_ids = data["ids"]
                print(f"[MultiSourceRetriever] BM25增量索引已加载: {len(self.bm25_incremental_ids)} papers")
            except Exception as e:
                print(f"[MultiSourceRetriever] BM25增量加载失败: {e}")
                self.bm25_incremental = None
                self.bm25_incremental_ids = []
        else:
            self.bm25_incremental = None
            self.bm25_incremental_ids = []
    
    def retrieve(
        self,
        query: str,
        top_k: int = 20,
        alpha: float = 0.5,
        sources: List[str] = None,
        use_reranker: bool = False
    ) -> List[Dict[str, Any]]:
        """
        多源检索
        
        Args:
            query: 查询文本
            top_k: 返回结果数
            alpha: 向量权重 (1-alpha = BM25权重)
            sources: 启用的检索源列表
            use_reranker: 是否使用重排序
            
        Returns:
            检索结果列表
        """
        if sources is None:
            sources = ["chroma", "bm25"]
            if self.use_openalex:
                sources.append("openalex")
        
        all_results = {}
        
        # 1. ChromaDB向量检索
        if "chroma" in sources:
            all_results["chroma"] = self._retrieve_chroma(query, top_k * 3)
        
        # 2. BM25关键词检索
        if "bm25" in sources:
            all_results["bm25"] = self._retrieve_bm25(query, top_k * 3)
        
        # 3. OpenAlex API检索
        if "openalex" in sources and self.use_openalex:
            all_results["openalex"] = self._retrieve_openalex(query, top_k)
        
        # 4. RRF融合
        fused = self._rrf_fusion(all_results, top_k, alpha)
        
        # 5. 去重
        deduplicated = self._deduplicate(fused)
        
        return deduplicated
    
    def _retrieve_chroma(
        self,
        query: str,
        top_k: int
    ) -> List[Dict[str, Any]]:
        """ChromaDB向量检索"""
        if self.collection.count() == 0:
            return []
        
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=top_k
            )
            
            items = []
            for rank, doc_id in enumerate(results["ids"][0]):
                distance = results["distances"][0][rank] if results.get("distances") else 0
                # 距离转相似度
                vector_score = 1.0 / (1.0 + distance)
                
                paper_name = doc_id.rsplit("_chunk", 1)[0]
                chunk_idx = int(doc_id.rsplit("_chunk", 1)[1]) if "_chunk" in doc_id else 0
                
                items.append({
                    "doc_id": doc_id,
                    "paper_name": paper_name,
                    "chunk_index": chunk_idx,
                    "vector_score": vector_score,
                    "bm25_score": 0.0,
                    "openalex_score": 0.0,
                    "source": "chroma",
                    "rank": rank + 1
                })
            
            return items
            
        except Exception as e:
            print(f"[ChromaDB检索失败] {e}")
            return []
    
    def _retrieve_bm25(
        self,
        query: str,
        top_k: int
    ) -> List[Dict[str, Any]]:
        """BM25关键词检索"""
        items = []
        
        # 主索引
        if self.bm25_index and self.bm25_ids:
            try:
                tokenized_query = query.split()
                scores = self.bm25_index.get_scores(tokenized_query)
                
                top_indices = sorted(
                    range(len(scores)),
                    key=lambda i: scores[i],
                    reverse=True
                )[:top_k]
                
                for rank, idx in enumerate(top_indices):
                    if scores[idx] > 0:
                        paper_name = self.bm25_ids[idx]
                        items.append({
                            "doc_id": f"{paper_name}_bm25",
                            "paper_name": paper_name,
                            "chunk_index": 0,
                            "vector_score": 0.0,
                            "bm25_score": float(scores[idx]),
                            "openalex_score": 0.0,
                            "source": "bm25",
                            "rank": rank + 1
                        })
            except Exception as e:
                print(f"[BM25主索引检索失败] {e}")
        
        # 增量索引
        if self.bm25_incremental and self.bm25_incremental_ids:
            try:
                tokenized_query = query.split()
                inc_scores = self.bm25_incremental.get_scores(tokenized_query)
                
                top_inc = sorted(
                    range(len(inc_scores)),
                    key=lambda i: inc_scores[i],
                    reverse=True
                )[:top_k]
                
                for rank, idx in enumerate(top_inc):
                    if inc_scores[idx] > 0:
                        paper_name = self.bm25_incremental_ids[idx]
                        # 检查是否已存在于主索引结果
                        existing = any(
                            item["paper_name"] == paper_name and item["source"] == "bm25"
                            for item in items
                        )
                        if not existing:
                            items.append({
                                "doc_id": f"{paper_name}_bm25_inc",
                                "paper_name": paper_name,
                                "chunk_index": 0,
                                "vector_score": 0.0,
                                "bm25_score": float(inc_scores[idx]),
                                "openalex_score": 0.0,
                                "source": "bm25_incremental",
                                "rank": rank + 1
                            })
            except Exception as e:
                print(f"[BM25增量索引检索失败] {e}")
        
        return items
    
    def _retrieve_openalex(
        self,
        query: str,
        top_k: int
    ) -> List[Dict[str, Any]]:
        """从OpenAlex检索学术论文"""
        api_url = "https://api.openalex.org/works"
        params = {
            "search": query,
            "per-page": top_k,
            "mailto": self.openalex_email,
            "filter": "open_access.is_oa:true",
            "sort": "cited_by_count:desc"
        }
        
        try:
            response = requests.get(api_url, params=params, timeout=15)
            if response.status_code != 200:
                print(f"[OpenAlex API失败] status: {response.status_code}")
                return []
            
            data = response.json()
            items = []
            
            for rank, work in enumerate(data.get("results", [])):
                # 提取作者（前5位）
                authors = [
                    a["author"]["display_name"] 
                    for a in work.get("authorships", [])[:5]
                ]
                
                # 论文标题作为paper_name
                title = work.get("title", "Unknown")
                paper_name = self._normalize_paper_name(title)
                
                items.append({
                    "doc_id": f"openalex_{work.get('id', '')}",
                    "paper_name": paper_name,
                    "doi": work.get("doi"),
                    "title": title,
                    "authors": authors,
                    "year": work.get("publication_year"),
                    "journal": (
                        work.get("primary_location", {})
                        .get("source", {})
                        .get("display_name")
                    ),
                    "cited_by_count": work.get("cited_by_count", 0),
                    "vector_score": 0.0,
                    "bm25_score": 0.0,
                    "openalex_score": 1.0,  # API返回的已是排序结果
                    "source": "openalex",
                    "rank": rank + 1,
                    "abstract": work.get("abstract_inverted_index")
                })
            
            return items
            
        except requests.exceptions.Timeout:
            print("[OpenAlex检索超时]")
        except requests.exceptions.RequestException as e:
            print(f"[OpenAlex检索失败] {e}")
        except Exception as e:
            print(f"[OpenAlex未知错误] {e}")
        
        return []
    
    def _normalize_paper_name(self, title: str) -> str:
        """将论文标题规范化为paper_name格式"""
        import re
        # 移除非字母数字字符
        name = re.sub(r'[^\w\s]', '', title)
        # 替换空格为下划线
        name = re.sub(r'\s+', '_', name)
        # 截断过长名称
        if len(name) > 100:
            name = name[:100]
        return name
    
    def _rrf_fusion(
        self,
        results: Dict[str, List],
        top_k: int,
        alpha: float = 0.5,
        k: int = 60
    ) -> List[Dict[str, Any]]:
        """
        RRF融合多源结果
        
        使用加权Reciprocal Rank Fusion
        """
        scores = {}
        
        for source, items in results.items():
            # 不同来源的权重
            if source == "chroma":
                weight = alpha
            elif source == "bm25" or source == "bm25_incremental":
                weight = 1 - alpha
            elif source == "openalex":
                weight = 0.8  # OpenAlex权重稍低
            else:
                weight = 1.0
            
            for item in items:
                key = item["paper_name"]
                
                if key not in scores:
                    scores[key] = {
                        "item": item.copy(),
                        "fused_score": 0.0
                    }
                
                # RRF分数
                rank = item.get("rank", k)
                rrf = 1.0 / (k + rank)
                
                # 乘以权重
                if source == "chroma":
                    item["vector_rrf"] = rrf * weight
                    scores[key]["item"]["vector_rrf"] = rrf * weight
                elif source in ["bm25", "bm25_incremental"]:
                    item["bm25_rrf"] = rrf * weight
                    scores[key]["item"]["bm25_rrf"] = rrf * weight
                elif source == "openalex":
                    item["openalex_rrf"] = rrf * weight
                    scores[key]["item"]["openalex_rrf"] = rrf * weight
                
                scores[key]["fused_score"] += rrf * weight
        
        # 按融合分数排序
        sorted_scores = sorted(
            scores.values(),
            key=lambda x: x["fused_score"],
            reverse=True
        )
        
        return [s["item"] for s in sorted_scores[:top_k]]
    
    def _deduplicate(
        self,
        results: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """论文级去重，保留最高分结果"""
        paper_best = {}
        
        for item in results:
            paper = item["paper_name"]
            if paper not in paper_best or item["fused_score"] > paper_best[paper]["fused_score"]:
                paper_best[paper] = item
        
        return list(paper_best.values())
    
    def get_stats(self) -> Dict[str, Any]:
        """获取检索器状态"""
        return {
            "chromadb_count": self.collection.count() if self.collection else 0,
            "bm25_main_count": len(self.bm25_ids) if hasattr(self, "bm25_ids") else 0,
            "bm25_incremental_count": len(self.bm25_incremental_ids) if hasattr(self, "bmbm25_incremental_ids") else 0,
            "openalex_enabled": self.use_openalex
        }


def query_multisource(
    query: str,
    top_k: int = 10,
    alpha: float = 0.5,
    use_openalex: bool = True
) -> List[Dict[str, Any]]:
    """
    便捷多源检索函数
    
    Example:
        results = query_multisource("BiFeO3 piezoelectric d33", top_k=10)
        for r in results:
            print(f"{r['paper_name']}: score={r['fused_score']:.4f}")
    """
    retriever = MultiSourceRetriever(
        persist_dir="/data/home/3220245455/llm/vllm/agent/workspace/rag/chroma_db",
        use_openalex=use_openalex
    )
    return retriever.retrieve(query, top_k=top_k, alpha=alpha)


if __name__ == "__main__":
    print("=== 多源检索测试 ===\n")
    
    # 测试查询
    test_queries = [
        "BiFeO3 ferroelectric piezoelectric",
        "machine learning materials design",
        "deep learning crystal structure prediction"
    ]
    
    for q in test_queries:
        print(f"\n查询: {q}")
        print("-" * 50)
        
        results = query_multisource(q, top_k=5, alpha=0.7)
        
        print(f"找到 {len(results)} 条结果:")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['paper_name'][:60]}")
            print(f"     fused={r['fused_score']:.4f} "
                  f"vec={r.get('vector_score', 0):.2f} "
                  f"bm25={r.get('bm25_score', 0):.2f} "
                  f"source={r['source']}")
