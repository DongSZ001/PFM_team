#!/usr/bin/env python3
"""
RAG Agent Pipeline - 集成检索、Self-Feedback、引用标注

完整流程:
1. 多源检索 (ChromaDB + BM25 + OpenAlex)
2. Cross-encoder重排序
3. Self-Feedback迭代优化
4. 引用标注与验证

作者: science-agent
日期: 2026-04-09
"""

import os
import time
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass

from .multi_source_retriever import MultiSourceRetriever, query_multisource
from .cross_encoder_ranker import CrossEncoderRanker, rerank_documents
from .llm_interface import (
    UnifiedLLM, 
    LLMProvider, 
    get_unified_llm,
    MiniMaxLLM,
    VLLMClient
)
from ..agents.self_feedback import SelfFeedbackAgent
from ..agents.citation_annotator import CitationAnnotator
from ..evaluation.rag_evaluator import RAGEvaluator


@dataclass
class RAGPipelineResult:
    """RAG Pipeline结果"""
    query: str
    answer: str
    retrieved_docs: List[Dict]
    reranked_docs: List[Dict]
    feedback_history: List[List[str]]
    iterations: int
    citations: List[Dict]
    evaluation: Optional[Dict]
    latency_ms: float
    llm_provider: str


class RAGPipeline:
    """
    RAG Agent Pipeline
    
    整合多源检索、Self-Feedback、引用标注的完整流程
    """
    
    def __init__(
        self,
        retriever: Optional[MultiSourceRetriever] = None,
        ranker: Optional[CrossEncoderRanker] = None,
        llm: Optional[UnifiedLLM] = None,
        enable_rerank: bool = True,
        enable_feedback: bool = True,
        enable_citation: bool = True,
        enable_evaluation: bool = False,
        openalex_email: str = "research@example.com"
    ):
        """
        初始化RAG Pipeline
        
        Args:
            retriever: 多源检索器（默认创建）
            ranker: Cross-encoder重排序器（默认启用）
            llm: 统一LLM接口
            enable_rerank: 是否启用重排序
            enable_feedback: 是否启用Self-Feedback
            enable_citation: 是否启用引用标注
            enable_evaluation: 是否启用评估
            openalex_email: OpenAlex API联系邮箱
        """
        # 检索器
        self.retriever = retriever or MultiSourceRetriever(
            persist_dir="/data/home/3220245455/llm/vllm/agent/workspace/rag/chroma_db",
            use_openalex=True,
            openalex_email=openalex_email
        )
        
        # 重排序器
        self.ranker = ranker
        self.enable_rerank = enable_rerank
        
        # LLM
        self.llm = llm or get_unified_llm(
            primary=LLMProvider.MINIMAX,
            fallback=LLMProvider.VLLM
        )
        
        # Self-Feedback
        self.enable_feedback = enable_feedback
        if enable_feedback:
            self.feedback_agent = SelfFeedbackAgent(
                llm_generate=self.llm,
                max_iterations=3
            )
        
        # 引用标注器
        self.enable_citation = enable_citation
        if enable_citation:
            self.citation_annotator = CitationAnnotator()
        
        # 评估器
        self.enable_evaluation = enable_evaluation
        if enable_evaluation:
            self.evaluator = RAGEvaluator(llm_judge=self.llm)
        
        print("[RAGPipeline] 初始化完成")
        print(f"  - 多源检索: ✅")
        print(f"  - Cross-encoder重排序: {'✅' if enable_rerank else '❌'}")
        print(f"  - Self-Feedback: {'✅' if enable_feedback else '❌'}")
        print(f"  - 引用标注: {'✅' if enable_citation else '❌'}")
        print(f"  - 评估模式: {'✅' if enable_evaluation else '❌'}")
    
    def query(
        self,
        query: str,
        top_k: int = 20,
        alpha: float = 0.7,
        return_reranked: bool = False,
        **kwargs
    ) -> RAGPipelineResult:
        """
        执行完整RAG查询
        
        Args:
            query: 用户查询
            top_k: 返回结果数
            alpha: 向量权重
            return_reranked: 是否返回重排序后的文档
            **kwargs: 传递给各模块的参数
            
        Returns:
            RAGPipelineResult: 包含答案、文档、迭代历史等
        """
        start_time = time.time()
        
        # Step 1: 多源检索
        print(f"\n[RAGPipeline] 检索: {query}")
        retrieved = self.retriever.retrieve(
            query=query,
            top_k=top_k * 2,  # 检索更多用于重排序
            alpha=alpha
        )
        print(f"[RAGPipeline] 检索到 {len(retrieved)} 条结果")
        
        # Step 2: Cross-encoder重排序
        reranked = retrieved
        if self.enable_rerank and self.ranker:
            print(f"[RAGPipeline] 执行重排序...")
            original_scores = [r.get('fused_score', 0) for r in retrieved]
            reranked = self.ranker.rerank(
                query=query,
                documents=retrieved,
                top_k=top_k,
                original_scores=original_scores
            )
            print(f"[RAGPipeline] 重排序完成，保留 {len(reranked)} 条")
        
        # Step 3: Self-Feedback
        feedback_history = []
        iterations = 0
        final_answer = ""
        
        if self.enable_feedback:
            print(f"[RAGPipeline] 执行Self-Feedback...")
            
            # 构建检索函数用于反馈后再检索
            def retrieval_func(q):
                return self.retriever.retrieve(q, top_k=10, alpha=alpha)
            
            sf_result = self.feedback_agent.generate_with_feedback(
                query=query,
                retrieved_context=reranked,
                retrieval_func=retrieval_func
            )
            
            final_answer = sf_result.final_answer
            feedback_history = sf_result.feedback_history
            iterations = sf_result.iterations
        else:
            # 简单生成
            context_text = self._format_context(reranked[:top_k])
            prompt = f"""基于以下上下文，回答用户问题。

上下文:
{context_text}

问题: {query}

请生成准确、完整的回答，并适当添加引用标注。"""
            
            response = self.llm.generate(prompt, **kwargs)
            final_answer = response.content
        
        # Step 4: 引用标注
        if self.enable_citation:
            print(f"[RAGPipeline] 添加引用标注...")
            final_answer = self.citation_annotator.annotate(
                final_answer,
                reranked[:top_k]
            )
        
        # Step 5: 评估
        evaluation = None
        if self.enable_evaluation:
            eval_result = self.evaluator.evaluate(
                query=query,
                ground_truth_docs=[],  # 可传入ground truth
                retrieved_docs=reranked[:top_k],
                generated_answer=final_answer
            )
            evaluation = eval_result.to_dict()
        
        latency_ms = (time.time() - start_time) * 1000
        
        return RAGPipelineResult(
            query=query,
            answer=final_answer,
            retrieved_docs=retrieved,
            reranked_docs=reranked[:top_k] if return_reranked else [],
            feedback_history=feedback_history,
            iterations=iterations,
            citations=[],  # 从annotator获取
            evaluation=evaluation,
            latency_ms=latency_ms,
            llm_provider=self.llm.primary.value
        )
    
    def _format_context(self, docs: List[Dict]) -> str:
        """格式化上下文"""
        if not docs:
            return "无可用上下文"
        
        formatted = []
        for i, doc in enumerate(docs, 1):
            paper_name = doc.get("paper_name", f"文档{i}")
            text = doc.get('chunk_text', doc.get('text', ''))
            formatted.append(f"[{i}] {paper_name}\n{text[:300]}")
        
        return "\n\n".join(formatted)
    
    def get_stats(self) -> Dict[str, Any]:
        """获取Pipeline状态"""
        return {
            "retriever": self.retriever.get_stats(),
            "ranker": self.ranker.get_stats() if self.ranker else None,
            "enable_rerank": self.enable_rerank,
            "enable_feedback": self.enable_feedback,
            "enable_citation": self.enable_citation,
            "enable_evaluation": self.enable_evaluation
        }


# 全局Pipeline实例
_pipeline: Optional[RAGPipeline] = None


def get_rag_pipeline(
    primary_llm: LLMProvider = LLMProvider.MINIMAX,
    fallback_llm: Optional[LLMProvider] = LLMProvider.VLLM,
    enable_rerank: bool = True,
    enable_feedback: bool = True,
    enable_citation: bool = True,
    **kwargs
) -> RAGPipeline:
    """
    获取全局RAGPipeline实例
    
    Example:
        pipeline = get_rag_pipeline()
        result = pipeline.query("BiFeO3的d33是多少？")
        print(result.answer)
    """
    global _pipeline
    
    if _pipeline is None:
        llm = get_unified_llm(primary=primary_llm, fallback=fallback_llm)
        
        _pipeline = RAGPipeline(
            llm=llm,
            enable_rerank=enable_rerank,
            enable_feedback=enable_feedback,
            enable_citation=enable_citation,
            **kwargs
        )
    
    return _pipeline


def reset_rag_pipeline():
    """重置全局Pipeline实例"""
    global _pipeline
    _pipeline = None


def rag_query(
    query: str,
    top_k: int = 10,
    llm_provider: str = "minimax"
) -> str:
    """
    便捷RAG查询函数
    
    Example:
        answer = rag_query("BiFeO3的压电性能如何？")
    """
    provider = LLMProvider.MINIMAX if llm_provider == "minimax" else LLMProvider.VLLM
    
    pipeline = get_rag_pipeline(primary_llm=provider)
    result = pipeline.query(query, top_k=top_k)
    
    return result.answer


if __name__ == "__main__":
    print("=== RAG Pipeline 测试 ===\n")
    
    # 初始化Pipeline
    pipeline = get_rag_pipeline(
        primary_llm=LLMProvider.MINIMAX,
        fallback_llm=None,  # 测试时不使用fallback
        enable_rerank=True,
        enable_feedback=True,
        enable_citation=True
    )
    
    # 执行查询
    test_queries = [
        "BiFeO3 ferroelectric piezoelectric d33",
        "machine learning materials design",
        "deep learning crystal structure prediction"
    ]
    
    for q in test_queries:
        print(f"\n{'='*60}")
        print(f"查询: {q}")
        print('='*60)
        
        result = pipeline.query(q, top_k=5)
        
        print(f"\n答案:\n{result.answer[:500]}...")
        print(f"\n延迟: {result.latency_ms:.0f}ms")
        print(f"迭代次数: {result.iterations}")
