#!/usr/bin/env python3
"""
Self-Feedback Agent - LLM自我反思与迭代优化

功能：
- 基于检索结果生成初始回答
- 识别回答中的知识盲点
- 通过再检索补充遗漏信息
- 迭代优化直到收敛或达到最大迭代次数

作者: science-agent
日期: 2026-04-09
"""

import time
from typing import List, Dict, Any, Callable, Optional
from dataclasses import dataclass


@dataclass
class SelfFeedbackResult:
    """Self-Feedback结果"""
    final_answer: str
    feedback_history: List[List[str]]  # 每轮迭代的[问题, 反馈, 回答]
    iterations: int
    context_used: List[Dict]  # 最终使用的上下文


class SelfFeedbackAgent:
    """
    Self-Feedback Agent
    
    通过LLM自我反思迭代优化回答质量
    """
    
    def __init__(
        self,
        llm_generate: Any,
        max_iterations: int = 3,
        min_confidence: float = 0.8
    ):
        """
        初始化Self-Feedback Agent
        
        Args:
            llm_generate: LLM生成器（需实现generate方法）
            max_iterations: 最大迭代次数
            min_confidence: 最小置信度（达到则提前停止）
        """
        self.llm = llm_generate
        self.max_iterations = max_iterations
        self.min_confidence = min_confidence
    
    def generate_with_feedback(
        self,
        query: str,
        retrieved_context: List[Dict],
        retrieval_func: Optional[Callable] = None
    ) -> SelfFeedbackResult:
        """
        带Self-Feedback的生成
        
        Args:
            query: 用户查询
            retrieved_context: 初始检索结果
            retrieval_func: 再检索函数（用于补充遗漏）
            
        Returns:
            SelfFeedbackResult: 包含最终回答和反馈历史
        """
        feedback_history = []
        current_context = retrieved_context.copy()
        final_answer = ""
        
        for iteration in range(self.max_iterations):
            print(f"[Self-Feedback] 迭代 {iteration + 1}/{self.max_iterations}")
            
            # 1. 基于当前上下文生成回答
            context_text = self._format_context(current_context)
            
            generate_prompt = f"""基于以下上下文信息，回答用户问题。

上下文:
{context_text}

问题: {query}

请生成一个准确、完整的回答。如果信息不足，请明确指出。"""
            
            response = self.llm.generate(generate_prompt)
            current_answer = response.content if hasattr(response, 'content') else str(response)
            
            # 2. LLM自我反思
            feedback_prompt = f"""请审查以下回答，识别其中的知识盲点或可改进之处。

问题: {query}
回答: {current_answer}
上下文: {context_text}

请指出：
1. 回答中哪些信息可能不准确或过时？
2. 有哪些重要点被遗漏了？
3. 回答是否完整？

如果回答已经很好，请只说"无需改进"。"""
            
            feedback_response = self.llm.generate(feedback_prompt)
            feedback = feedback_response.content if hasattr(feedback_response, 'content') else str(feedback_response)
            
            print(f"[Self-Feedback] 反馈: {feedback[:100]}...")
            
            # 检查是否需要再检索
            if "无需改进" in feedback or iteration == self.max_iterations - 1:
                final_answer = current_answer
                feedback_history.append([query, feedback, current_answer])
                break
            
            # 3. 基于反馈再检索
            if retrieval_func:
                # 提取反馈中的关键查询词
                follow_up_query = f"{query} {feedback[:200]}"
                additional_docs = retrieval_func(follow_up_query)
                current_context = self._merge_context(current_context, additional_docs)
            
            feedback_history.append([query, feedback, current_answer])
            
            # 短暂休息避免API限制
            time.sleep(0.1)
        
        return SelfFeedbackResult(
            final_answer=final_answer,
            feedback_history=feedback_history,
            iterations=iteration + 1,
            context_used=current_context
        )
    
    def _format_context(self, docs: List[Dict]) -> str:
        """格式化上下文"""
        if not docs:
            return "无可用上下文"
        
        formatted = []
        for i, doc in enumerate(docs, 1):
            paper_name = doc.get("paper_name", doc.get("metadata", {}).get("paper_title", f"文档{i}"))
            text = doc.get('chunk_text', doc.get('text', doc.get('content', '')))
            if isinstance(text, str):
                text = text[:500]  # 限制长度
            formatted.append(f"[{i}] {paper_name}\n{text}")
        
        return "\n\n".join(formatted)
    
    def _merge_context(
        self,
        existing: List[Dict],
        new: List[Dict]
    ) -> List[Dict]:
        """合并新旧上下文（去重）"""
        existing_ids = {doc.get('id', doc.get('chunk_id', '')) for doc in existing}
        merged = existing.copy()
        
        for doc in new:
            doc_id = doc.get('id', doc.get('chunk_id', ''))
            if doc_id not in existing_ids:
                merged.append(doc)
                existing_ids.add(doc_id)
        
        return merged[:20]  # 限制总数
