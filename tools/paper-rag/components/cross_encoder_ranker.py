#!/usr/bin/env python3
"""
Cross-encoder重排序模块

功能:
1. 使用Cross-encoder对初检结果进行精细排序
2. 支持本地模型和API模式

作者: science-agent
日期: 2026-04-09
"""

import os
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass


@dataclass
class RerankResult:
    """重排序结果"""
    doc_id: str
    paper_name: str
    original_rank: int
    new_rank: int
    cross_encoder_score: float
    final_score: float


class CrossEncoderRanker:
    """
    Cross-encoder重排序器
    
    使用Cross-encoder模型对检索结果进行精细排序。
    支持:
    1. 本地sentence-transformers模型
    2. API模式（如OpenAI、Jina等）
    """
    
    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-12-v2",
        use_api: bool = False,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        device: str = "cpu"
    ):
        """
        初始化Cross-encoder
        
        Args:
            model_name: 模型名称（本地或HuggingFace）
            use_api: 是否使用API模式
            api_url: API服务器地址
            api_key: API密钥
            device: 设备 ('cpu', 'cuda', 'mps')
        """
        self.model_name = model_name
        self.use_api = use_api
        self.api_url = api_url
        self.api_key = api_key
        self.device = device
        
        if use_api:
            self._init_api_client()
        else:
            self._init_local_model()
    
    def _init_local_model(self):
        """初始化本地模型（优先使用ModelScope本地缓存）"""
        # ModelScope模型映射 (HuggingFace ID -> ModelScope ID)
        modelscope_model_map = {
            "cross-encoder/ms-marco-MiniLM-L-12-v2": "cross-encoder/ms-marco-MiniLM-L12-v2",
        }
        
        model_to_load = modelscope_model_map.get(self.model_name, self.model_name)
        
        # 检查本地缓存
        local_cache = "/tmp/modelscope_models"
        model_cache_path = os.path.join(local_cache, model_to_load)
        
        if os.path.exists(model_cache_path):
            print(f"[CrossEncoderRanker] 发现本地模型: {model_cache_path}")
            try:
                from sentence_transformers import CrossEncoder
                self.model = CrossEncoder(model_cache_path, max_length=512, device=self.device)
                print(f"[CrossEncoderRanker] 本地模型加载成功!")
                return
            except Exception as e:
                print(f"[CrossEncoderRanker] 本地模型加载失败: {e}")
        
        # 尝试1: ModelScope sentence-transformers
        try:
            import modelscope
            from sentence_transformers import CrossEncoder
            
            cache_dir = os.path.expanduser("~/.cache/modelscope")
            os.makedirs(cache_dir, exist_ok=True)
            
            self.model = CrossEncoder(
                model_to_load,
                max_length=512,
                device=self.device,
                cache_dir=cache_dir
            )
            print(f"[CrossEncoderRanker] ModelScope模型加载成功: {model_to_load}")
            return
            
        except Exception as e:
            print(f"[CrossEncoderRanker] ModelScope尝试失败: {e}")
        
        # 尝试2: HuggingFace sentence-transformers
        try:
            from sentence_transformers import CrossEncoder
            
            self.model = CrossEncoder(
                self.model_name,
                max_length=512,
                device=self.device
            )
            print(f"[CrossEncoderRanker] HuggingFace模型加载成功: {self.model_name}")
            return
            
        except Exception as e:
            print(f"[CrossEncoderRanker] HuggingFace也失败: {e}")
        
        # 尝试3: HuggingFace transformers直接加载
        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForSequenceClassification
            
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
            self.model.to(self.device)
            self.model.eval()
            print(f"[CrossEncoderRanker] transformers模型加载成功: {self.model_name}")
            return
            
        except Exception as e:
            print(f"[CrossEncoderRanker] transformers加载失败: {e}")
        
        print("[CrossEncoderRanker] 无法下载任何模型，使用增强融合排序作为替代")
        self.model = None
        self.use_enhanced_fusion = True  # 标记使用增强融合
    
    def _init_api_client(self):
        """初始化API客户端"""
        import httpx
        
        if not self.api_url:
            # 默认使用Jina AI的reranker API
            self.api_url = "https://api.jina.ai/v1/rerank"
        
        self.client = httpx.Client(timeout=60)
        print(f"[CrossEncoderRanker] API模式初始化: {self.api_url}")
        self.model = None
        self.tokenizer = None
    
    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 10,
        batch_size: int = 32,
        original_scores: Optional[List[float]] = None
    ) -> List[Dict[str, Any]]:
        """
        对文档进行重排序
        
        Args:
            query: 查询文本
            documents: 文档列表（每项需包含chunk_text或text字段）
            top_k: 返回前k个结果
            batch_size: 批处理大小
            original_scores: 原始检索分数（用于加权融合）
            
        Returns:
            重排序后的文档列表
        """
        if not documents:
            return []
        
        if self.model is None and not self.use_api:
            if getattr(self, 'use_enhanced_fusion', False):
                # 使用增强融合排序
                return self._enhanced_fusion_rerank(query, documents, top_k, original_scores)
            else:
                # 无可用模型，返回原始顺序
                print("[CrossEncoderRanker] 无可用模型，返回原始顺序")
                return documents[:top_k]
        
        # 准备文本对
        doc_texts = []
        for doc in documents:
            text = doc.get('chunk_text', doc.get('text', ''))
            doc_texts.append((query, text[:1000]))  # 限制文本长度
        
        # 计算Cross-encoder分数
        if self.use_api:
            ce_scores = self._score_by_api(doc_texts)
        else:
            ce_scores = self._score_by_local(doc_texts, batch_size)
        
        # 融合原始分数和Cross-encoder分数
        final_scores = self._fuse_scores(
            ce_scores, 
            original_scores,
            ce_weight=0.7
        )
        
        # 按最终分数排序
        ranked_indices = np.argsort(final_scores)[::-1]
        
        # 构建结果
        reranked = []
        for new_rank, idx in enumerate(ranked_indices[:top_k], 1):
            doc = documents[idx].copy()
            doc['cross_encoder_score'] = float(ce_scores[idx])
            doc['final_score'] = float(final_scores[idx])
            doc['original_rank'] = idx + 1
            doc['new_rank'] = new_rank
            reranked.append(doc)
        
        return reranked
    
    def _score_by_local(
        self,
        sentence_pairs: List[Tuple[str, str]],
        batch_size: int
    ) -> np.ndarray:
        """使用本地模型计算分数"""
        # 优先尝试ONNX
        try:
            from .cross_encoder_onnx import create_onnx_cross_encoder
            
            onnx_encoder = create_onnx_cross_encoder()
            if onnx_encoder:
                return onnx_encoder.predict(sentence_pairs)
        except Exception as e:
            print(f"[CrossEncoderRanker] ONNX尝试失败: {e}")
        
        # 尝试sentence-transformers
        try:
            from sentence_transformers import CrossEncoder
            
            if isinstance(self.model, CrossEncoder):
                scores = self.model.predict(
                    sentence_pairs,
                    batch_size=batch_size,
                    show_progress_bar=False,
                    convert_to_numpy=True
                )
                return scores
            
        except Exception as e:
            print(f"[CrossEncoderRanker] sentence-transformers评分失败: {e}")
        
        # 回退到简化评分
        return self._fallback_scores(sentence_pairs)
    
    def _score_by_api(
        self,
        sentence_pairs: List[Tuple[str, str]]
    ) -> np.ndarray:
        """使用API计算分数"""
        import json
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key or ''}"
        }
        
        payload = {
            "model": self.model_name,
            "query": sentence_pairs[0][0],  # query
            "documents": [pair[1] for pair in sentence_pairs],
            "top_n": len(sentence_pairs),
            "return_documents": False
        }
        
        try:
            response = self.client.post(
                f"{self.api_url}/rerank",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                return np.array([r.get("relevance_score", 0) for r in results])
            else:
                print(f"[CrossEncoderRanker] API请求失败: {response.status_code}")
                
        except Exception as e:
            print(f"[CrossEncoderRanker] API评分失败: {e}")
        
        return self._fallback_scores(sentence_pairs)
    
    def _enhanced_fusion_rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int,
        original_scores: Optional[List[float]]
    ) -> List[Dict[str, Any]]:
        """
        增强融合排序（无需额外模型）
        
        结合多种特征进行重排序:
        1. 原始分数（向量/BM25）
        2. 查询-文档词重叠
        3. 查询关键词命中
        4. 文档长度惩罚
        """
        print("[CrossEncoderRanker] 使用增强融合排序")
        
        query_words = set(query.lower().split())
        query_keywords = set(w for w in query_words if len(w) > 2)  # 过滤短词
        
        fused_scores = []
        
        for i, doc in enumerate(documents):
            score = 0.0
            
            # 1. 原始分数
            if original_scores and i < len(original_scores):
                orig = original_scores[i]
                # 归一化到0-1
                orig_norm = min(orig / max(original_scores) if max(original_scores) > 0 else 0, 1.0)
                score += orig_norm * 0.4
            
            # 2. 查询-文档词重叠
            text = doc.get('chunk_text', doc.get('text', '')).lower()
            doc_words = set(text.split())
            overlap = query_keywords & doc_words
            if len(query_keywords) > 0:
                word_overlap_score = len(overlap) / len(query_keywords)
                score += word_overlap_score * 0.3
            
            # 3. 查询关键词精确匹配奖励
            for kw in query_keywords:
                if kw in text:
                    score += 0.05  # 每个关键词命中奖励
            
            # 4. 位置得分（靠前的文档轻微奖励）
            score += (len(documents) - i) / len(documents) * 0.1
            
            # 5. 文档长度惩罚（太长或太短都惩罚）
            text_len = len(text)
            if text_len < 50:
                score *= 0.8
            elif text_len > 2000:
                score *= 0.9
            
            fused_scores.append(score)
        
        # 按融合分数排序
        ranked_indices = np.argsort(fused_scores)[::-1]
        
        # 构建结果
        reranked = []
        for new_rank, idx in enumerate(ranked_indices[:top_k], 1):
            doc = documents[idx].copy()
            doc['cross_encoder_score'] = float(fused_scores[idx])
            doc['final_score'] = float(fused_scores[idx])
            doc['original_rank'] = idx + 1
            doc['new_rank'] = new_rank
            reranked.append(doc)
        
        return reranked
    
    def _fallback_scores(
        self,
        sentence_pairs: List[Tuple[str, str]]
    ) -> np.ndarray:
        """
        简化评分（当模型不可用时）
        
        基于词重叠计算简单相关性分数
        """
        scores = np.zeros(len(sentence_pairs))
        
        query_words = set(sentence_pairs[0][0].lower().split())
        
        for i, (query, doc_text) in enumerate(sentence_pairs):
            if i == 0:
                continue  # 跳过query
            
            doc_words = set(doc_text.lower().split())
            overlap = query_words & doc_words
            
            if len(query_words) > 0:
                scores[i] = len(overlap) / len(query_words)
        
        return scores
    
    def _fuse_scores(
        self,
        ce_scores: np.ndarray,
        original_scores: Optional[List[float]],
        ce_weight: float = 0.7
    ) -> np.ndarray:
        """
        融合Cross-encoder分数和原始检索分数
        
        Args:
            ce_scores: Cross-encoder分数
            original_scores: 原始检索分数（如BM25、向量相似度）
            ce_weight: Cross-encoder权重
            
        Returns:
            融合后的分数
        """
        # 归一化Cross-encoder分数
        ce_min, ce_max = ce_scores.min(), ce_scores.max()
        if ce_max > ce_min:
            ce_norm = (ce_scores - ce_min) / (ce_max - ce_min)
        else:
            ce_norm = np.ones_like(ce_scores) * 0.5
        
        if original_scores is None:
            # 无原始分数，只用Cross-encoder
            return ce_norm
        
        # 归一化原始分数
        orig = np.array(original_scores)
        orig_min, orig_max = orig.min(), orig.max()
        if orig_max > orig_min:
            orig_norm = (orig - orig_min) / (orig_max - orig_min)
        else:
            orig_norm = np.ones_like(orig) * 0.5
        
        # 加权融合
        orig_weight = 1 - ce_weight
        final = ce_weight * ce_norm + orig_weight * orig_norm
        
        return final
    
    def get_stats(self) -> Dict[str, Any]:
        """获取重排序器状态"""
        return {
            "model_name": self.model_name,
            "use_api": self.use_api,
            "api_url": self.api_url if self.use_api else None,
            "device": self.device
        }


def rerank_documents(
    query: str,
    documents: List[Dict[str, Any]],
    top_k: int = 10,
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-12-v2",
    original_scores: Optional[List[float]] = None
) -> List[Dict[str, Any]]:
    """
    便捷重排序函数
    
    Example:
        reranked = rerank_documents(
            query="BiFeO3 piezoelectric",
            documents=retrieved_docs,
            top_k=10
        )
    """
    ranker = CrossEncoderRanker(model_name=model_name)
    return ranker.rerank(
        query=query,
        documents=documents,
        top_k=top_k,
        original_scores=original_scores
    )


if __name__ == "__main__":
    print("=== Cross-encoder重排序测试 ===\n")
    
    # 模拟检索结果
    mock_docs = [
        {
            "doc_id": "doc1",
            "paper_name": "BiFeO3_Ferroelectric_2024",
            "chunk_text": "BiFeO3是一种重要的铁电材料，具有优异的压电性能，d33可达6000 pC/N。",
            "vector_score": 0.95,
            "bm25_score": 15.2
        },
        {
            "doc_id": "doc2",
            "paper_name": "PZT_Piezoelectric_2023",
            "chunk_text": "PZT陶瓷是传统的压电材料，d33约为200-600 pC/N。",
            "vector_score": 0.88,
            "bm25_score": 12.8
        },
        {
            "doc_id": "doc3",
            "paper_name": "Machine_Learning_Materials_2024",
            "chunk_text": "机器学习在材料科学中的应用越来越广泛，可用于预测材料性质。",
            "vector_score": 0.72,
            "bm25_score": 8.5
        }
    ]
    
    query = "BiFeO3 ferroelectric piezoelectric d33"
    
    print(f"查询: {query}")
    print(f"文档数: {len(mock_docs)}")
    print()
    
    # 测试重排序
    ranker = CrossEncoderRanker()
    reranked = ranker.rerank(
        query=query,
        documents=mock_docs,
        top_k=3,
        original_scores=[d['vector_score'] for d in mock_docs]
    )
    
    print("重排序结果:")
    for doc in reranked:
        print(f"  {doc['new_rank']}. {doc['paper_name']}")
        print(f"     ce_score={doc['cross_encoder_score']:.4f}, final={doc['final_score']:.4f}")
        print(f"     (original_rank={doc['original_rank']})")
