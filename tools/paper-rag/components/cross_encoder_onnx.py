#!/usr/bin/env python3
"""
ONNX Cross-encoder - 使用本地ONNX模型进行重排序

优势:
1. 无需网络连接
2. CPU优化
3. 快速推理

作者: science-agent
日期: 2026-04-10
"""

import os
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

# 本地模型路径
LOCAL_MODEL_PATH = "/tmp/modelscope_models/cross-encoder/ms-marco-MiniLM-L12-v2"


class ONNXCrossEncoder:
    """
    ONNX Cross-encoder
    
    使用本地ONNX模型和tokenizer进行重排序
    """
    
    def __init__(
        self,
        model_path: Optional[str] = None,
        max_length: int = 512,
        device: str = "cpu"
    ):
        """
        初始化ONNX Cross-encoder
        
        Args:
            model_path: ONNX模型路径，默认使用本地缓存
            max_length: 最大序列长度
            device: 设备
        """
        self.max_length = max_length
        self.device = device
        
        # 模型路径
        if model_path is None:
            model_path = os.path.join(LOCAL_MODEL_PATH, "onnx/model.onnx")
        
        self.model_path = model_path
        
        # 加载模型和tokenizer
        self._load_model()
        self._load_tokenizer()
    
    def _load_model(self):
        """加载ONNX模型"""
        try:
            import onnxruntime as ort
            
            # 选择合适的providers
            providers = ['CPUExecutionProvider']
            
            self.session = ort.InferenceSession(
                self.model_path,
                providers=providers
            )
            
            # 获取输入输出名称
            self.input_names = [inp.name for inp in self.session.get_inputs()]
            self.output_names = [out.name for out in self.session.get_outputs()]
            
            print(f"[ONNXCrossEncoder] 模型加载成功: {self.model_path}")
            print(f"[ONNXCrossEncoder] 输入: {self.input_names}")
            print(f"[ONNXCrossEncoder] 输出: {self.output_names}")
            
        except Exception as e:
            print(f"[ONNXCrossEncoder] 模型加载失败: {e}")
            raise
    
    def _load_tokenizer(self):
        """加载本地tokenizer"""
        try:
            # 尝试使用transformers的本地tokenizer
            from transformers import AutoTokenizer
            
            tokenizer_path = LOCAL_MODEL_PATH
            self.tokenizer = AutoTokenizer.from_pretrained(
                tokenizer_path,
                local_files_only=True
            )
            print(f"[ONNXCrossEncoder] Tokenizer加载成功")
            
        except Exception as e:
            print(f"[ONNXCrossEncoder] Tokenizer加载失败: {e}")
            # 使用简单的分词器作为fallback
            self.tokenizer = None
    
    def encode(self, texts: List[str]) -> np.ndarray:
        """
        对文本进行编码
        
        Args:
            texts: 文本列表
            
        Returns:
            输入张量
        """
        if self.tokenizer:
            # 使用transformers tokenizer
            encoded = self.tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=self.max_length,
                return_tensors="np"
            )
            
            inputs = {
                "input_ids": encoded["input_ids"].astype(np.int64),
                "attention_mask": encoded["attention_mask"].astype(np.int64),
                "token_type_ids": encoded.get("token_type_ids", np.zeros_like(encoded["input_ids"])).astype(np.int64)
            }
        else:
            # Fallback: 简单分词
            raise RuntimeError("Tokenizer不可用")
        
        return inputs
    
    def predict(self, sentence_pairs: List[Tuple[str, str]]) -> np.ndarray:
        """
        预测句子对的相关性分数
        
        Args:
            sentence_pairs: [(query, doc), ...]
            
        Returns:
            分数数组
        """
        # 组合句子对为[query, doc]格式
        texts = [f"{q} [SEP] {d}" for q, d in sentence_pairs]
        
        # 编码
        inputs = self.encode(texts)
        
        # 推理
        logits = self.session.run(self.output_names, inputs)[0]
        
        # 返回分数（通常是sigmoid后的值）
        scores = 1.0 / (1.0 + np.exp(-logits.flatten()))
        
        return scores
    
    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 10,
        original_scores: Optional[List[float]] = None
    ) -> List[Dict[str, Any]]:
        """
        对文档进行重排序
        
        Args:
            query: 查询文本
            documents: 文档列表
            top_k: 返回前k个结果
            original_scores: 原始分数（用于融合）
            
        Returns:
            重排序后的文档列表
        """
        if not documents:
            return []
        
        # 构建句子对
        doc_texts = [doc.get('chunk_text', doc.get('text', '')) for doc in documents]
        sentence_pairs = [(query, text) for text in doc_texts]
        
        # 预测
        ce_scores = self.predict(sentence_pairs)
        
        # 融合分数
        if original_scores:
            # 归一化
            ce_norm = (ce_scores - ce_scores.min()) / (ce_scores.max() - ce_scores.min() + 1e-8)
            orig_norm = np.array(original_scores) / max(original_scores)
            
            # 融合
            final_scores = 0.6 * ce_norm + 0.4 * orig_norm
        else:
            final_scores = ce_scores
        
        # 排序
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


def create_onnx_cross_encoder() -> Optional[ONNXCrossEncoder]:
    """创建ONNX Cross-encoder，如果模型存在的话"""
    model_path = os.path.join(LOCAL_MODEL_PATH, "onnx/model.onnx")
    
    if os.path.exists(model_path):
        try:
            return ONNXCrossEncoder()
        except Exception as e:
            print(f"[create_onnx_cross_encoder] 创建失败: {e}")
            return None
    
    return None


if __name__ == "__main__":
    print("=== ONNX Cross-encoder 测试 ===\n")
    
    # 创建encoder
    encoder = create_onnx_cross_encoder()
    
    if encoder:
        # 测试句子对
        pairs = [
            ("BiFeO3 ferroelectric", "BiFeO3 is a ferroelectric material"),
            ("BiFeO3 ferroelectric", "PZT is a piezoelectric ceramic"),
            ("BiFeO3 ferroelectric", "Machine learning is AI"),
        ]
        
        scores = encoder.predict(pairs)
        print(f"\n句子对分数:")
        for pair, score in zip(pairs, scores):
            print(f"  {pair[0][:30]}... vs {pair[1][:30]}... -> {score:.4f}")
        
        # 测试重排序
        docs = [
            {"doc_id": "1", "paper_name": "BiFeO3", "chunk_text": "BiFeO3 ferroelectric properties", "vector_score": 0.9},
            {"doc_id": "2", "paper_name": "PZT", "chunk_text": "PZT piezoelectric ceramic", "vector_score": 0.8},
            {"doc_id": "3", "paper_name": "ML", "chunk_text": "Machine learning", "vector_score": 0.7},
        ]
        
        reranked = encoder.rerank("BiFeO3 ferroelectric", docs, top_k=3, original_scores=[0.9, 0.8, 0.7])
        
        print(f"\n重排序结果:")
        for r in reranked:
            print(f"  {r['new_rank']}. {r['paper_name']} (score={r['cross_encoder_score']:.4f})")
    else:
        print("无法创建ONNX Cross-encoder")
