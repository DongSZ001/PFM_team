#!/usr/bin/env python3
"""
RAG系统评估器 - 参考ScholarQABench

评估维度:
1. 检索质量 (Precision@K, Recall@K, NDCG)
2. 答案质量 (Correctness, Coverage, Fluency)
3. 引用准确率 (Citation Precision, Recall, F1)

作者: 基于ScholarQABench论文优化
日期: 2026-04-08
"""

import re
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field


@dataclass
class RAGEvaluationResult:
    """RAG评估结果"""
    # 检索指标
    retrieval_precision: float = 0.0
    retrieval_recall: float = 0.0
    retrieval_ndcg: float = 0.0
    
    # 答案质量
    answer_correctness: float = 0.0
    answer_coverage: float = 0.0
    answer_fluency: float = 0.0
    
    # 引用准确率
    citation_precision: float = 0.0
    citation_recall: float = 0.0
    citation_f1: float = 0.0
    
    # 综合分数
    overall_score: float = 0.0
    
    def to_dict(self) -> Dict[str, float]:
        return {
            "retrieval_precision": self.retrieval_precision,
            "retrieval_recall": self.retrieval_recall,
            "retrieval_ndcg": self.retrieval_ndcg,
            "answer_correctness": self.answer_correctness,
            "answer_coverage": self.answer_coverage,
            "answer_fluency": self.answer_fluency,
            "citation_precision": self.citation_precision,
            "citation_recall": self.citation_recall,
            "citation_f1": self.citation_f1,
            "overall_score": self.overall_score
        }
    
    def __str__(self) -> str:
        return f"""=== RAG评估结果 ===

【检索质量】
  Precision@10: {self.retrieval_precision:.4f}
  Recall@10:    {self.retrieval_recall:.4f}
  NDCG@10:     {self.retrieval_ndcg:.4f}

【答案质量】
  正确性: {self.answer_correctness:.4f}
  覆盖度: {self.answer_coverage:.4f}
  流利度: {self.answer_fluency:.4f}

【引用准确率】
  精确率: {self.citation_precision:.4f}
  召回率: {self.citation_recall:.4f}
  F1分数: {self.citation_f1:.4f}

【综合评分】: {self.overall_score:.4f}
"""


class RAGEvaluator:
    """
    RAG系统评估器
    
    参考ScholarQABench的多维度评估框架
    """
    
    def __init__(
        self,
        llm_judge: Optional[Callable] = None,
        k_values: List[int] = None
    ):
        """
        Args:
            llm_judge: LLM评判函数，用于答案质量评估
            k_values: 评估用的K值列表
        """
        self.llm_judge = llm_judge
        self.k_values = k_values or [5, 10, 20]
    
    def evaluate(
        self,
        query: str,
        ground_truth_docs: List[str],
        retrieved_docs: List[Dict],
        generated_answer: str,
        reference_answer: Optional[str] = None
    ) -> RAGEvaluationResult:
        """
        全面评估RAG系统
        
        Args:
            query: 用户查询
            ground_truth_docs: 相关文档列表（人工标注）
            retrieved_docs: 系统检索到的文档
            generated_answer: 生成的答案
            reference_answer: 参考答案（可选）
            
        Returns:
            RAGEvaluationResult: 评估结果
        """
        # 1. 检索评估
        retrieval_metrics = self._evaluate_retrieval(
            retrieved_docs, ground_truth_docs
        )
        
        # 2. 答案质量评估
        answer_metrics = self._evaluate_answer(
            query, generated_answer, reference_answer
        )
        
        # 3. 引用准确率评估
        citation_metrics = self._evaluate_citations(
            generated_answer, retrieved_docs, ground_truth_docs
        )
        
        # 4. 计算综合分数
        overall = self._compute_overall(
            retrieval_metrics,
            answer_metrics,
            citation_metrics
        )
        
        return RAGEvaluationResult(
            retrieval_precision=retrieval_metrics["precision"],
            retrieval_recall=retrieval_metrics["recall"],
            retrieval_ndcg=retrieval_metrics.get("ndcg", 0),
            answer_correctness=answer_metrics["correctness"],
            answer_coverage=answer_metrics["coverage"],
            answer_fluency=answer_metrics["fluency"],
            citation_precision=citation_metrics["precision"],
            citation_recall=citation_metrics["recall"],
            citation_f1=citation_metrics["f1"],
            overall_score=overall
        )
    
    def _evaluate_retrieval(
        self,
        retrieved: List[Dict],
        ground_truth: List[str],
        k_values: List[int] = None
    ) -> Dict[str, float]:
        """评估检索质量"""
        k_values = k_values or self.k_values
        retrieved_names = [d.get("paper_name", "") for d in retrieved]
        gt_set = set(ground_truth)
        
        results = {}
        
        for k in k_values:
            ret_k = set(retrieved_names[:k])
            
            # Precision@K
            overlap = len(ret_k & gt_set)
            precision = overlap / k if k > 0 else 0
            
            # Recall@K
            recall = overlap / len(gt_set) if len(gt_set) > 0 else 0
            
            results[f"precision@{k}"] = precision
            results[f"recall@{k}"] = recall
        
        # 综合分数
        results["precision"] = results.get("precision@10", 0)
        results["recall"] = results.get("recall@10", 0)
        
        # NDCG@K
        if retrieved and gt_set:
            dcg = 0
            for i, name in enumerate(retrieved_names[:10]):
                if name in gt_set:
                    dcg += 1 / (i + 1)
            
            # IDCG
            idcg = sum(1 / (i + 1) for i in range(min(len(gt_set), 10)))
            
            results["ndcg"] = dcg / idcg if idcg > 0 else 0
        else:
            results["ndcg"] = 0
        
        return results
    
    def _evaluate_answer(
        self,
        query: str,
        answer: str,
        reference: Optional[str] = None
    ) -> Dict[str, float]:
        """评估答案质量"""
        metrics = {
            "correctness": 0.5,
            "coverage": 0.5,
            "fluency": 0.5
        }
        
        if not answer:
            return metrics
        
        # 正确性
        if self.llm_judge and reference:
            metrics["correctness"] = self._llm_judge_correctness(
                query, answer, reference
            )
        elif self.llm_judge:
            metrics["correctness"] = self._llm_judge_quality(query, answer)
        else:
            # 简化评估
            metrics["correctness"] = self._simple_correctness(answer)
        
        # 覆盖度
        metrics["coverage"] = self._evaluate_coverage(answer, query)
        
        # 流利度
        metrics["fluency"] = self._evaluate_fluency(answer)
        
        return metrics
    
    def _llm_judge_correctness(
        self,
        query: str,
        answer: str,
        reference: str
    ) -> float:
        """使用LLM评判正确性"""
        prompt = f"""评估以下回答的正确性。

问题: {query}

回答: {answer}

参考答案: {reference}

评分标准 (1-5):
1. 完全不正确
2. 大部分不正确
3. 部分正确
4. 大部分正确
5. 完全正确

只输出一个数字分数:"""

        try:
            score = float(self.llm_judge(prompt).strip())
            return min(max(score / 5.0, 0), 1)  # 归一化到0-1
        except:
            return 0.5
    
    def _llm_judge_quality(self, query: str, answer: str) -> float:
        """在没有参考答案时使用LLM评估质量"""
        prompt = f"""评估以下回答的质量。

问题: {query}

回答: {answer}

评分标准 (1-5):
1. 质量很差
2. 质量较差
3. 质量一般
4. 质量较好
5. 质量很好

只输出一个数字分数:"""

        try:
            score = float(self.llm_judge(prompt).strip())
            return min(max(score / 5.0, 0), 1)
        except:
            return 0.5
    
    def _simple_correctness(self, answer: str) -> float:
        """简化正确性评估"""
        # 基于基本检查
        score = 0.5
        
        # 检查是否包含问号相关的内容
        if len(answer) > 50:
            score += 0.1
        
        # 检查是否有明确结论
        if any(kw in answer for kw in ['是', '为', '研究表明', '结果显示']):
            score += 0.1
        
        # 检查是否有明显错误标志
        if '无法' in answer or '不知道' in answer:
            score -= 0.2
        
        return min(max(score, 0), 1)
    
    def _evaluate_coverage(self, answer: str, query: str) -> float:
        """评估答案覆盖度"""
        if not answer or not query:
            return 0.0
        
        # 简单基于长度
        answer_len = len(answer)
        
        if answer_len < 50:
            return 0.2
        elif answer_len < 200:
            return 0.5
        elif answer_len < 500:
            return 0.7
        else:
            return 0.9
    
    def _evaluate_fluency(self, answer: str) -> float:
        """评估答案流利度"""
        if not answer:
            return 0.0
        
        score = 1.0
        
        # 检查重复
        sentences = re.split(r'[。；\n]', answer)
        unique_sentences = set(sentences)
        if len(sentences) > 3:
            duplication_ratio = 1 - len(unique_sentences) / len(sentences)
            score -= duplication_ratio * 0.3
        
        # 检查句子完整性
        incomplete = sum(1 for s in sentences if len(s.strip()) < 5)
        if incomplete > len(sentences) * 0.3:
            score -= 0.2
        
        return min(max(score, 0), 1)
    
    def _evaluate_citations(
        self,
        answer: str,
        retrieved_docs: List[Dict],
        ground_truth: List[str]
    ) -> Dict[str, float]:
        """评估引用准确率"""
        # 提取答案中的引用标记
        cited_numbers = set(re.findall(r'\[(\d+)\]', answer))
        
        # 计算有效引用
        valid_citations = 0
        for num_str in cited_numbers:
            try:
                num = int(num_str)
                if 1 <= num <= len(retrieved_docs):
                    valid_citations += 1
            except ValueError:
                pass
        
        total_cited = len(cited_numbers) if cited_numbers else 0
        total_docs = len(retrieved_docs)
        
        # 精确率
        precision = valid_citations / total_cited if total_cited > 0 else 0
        
        # 召回率
        recall = valid_citations / total_docs if total_docs > 0 else 0
        
        # F1
        if precision + recall > 0:
            f1 = 2 * precision * recall / (precision + recall)
        else:
            f1 = 0
        
        return {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "total_cited": total_cited,
            "valid_cited": valid_citations
        }
    
    def _compute_overall(
        self,
        retrieval: Dict[str, float],
        answer: Dict[str, float],
        citation: Dict[str, float]
    ) -> float:
        """
        计算综合分数
        
        权重:
        - 检索质量: 30%
        - 答案质量: 40%
        - 引用准确率: 30%
        """
        retrieval_score = (retrieval["precision"] * 0.5 + 
                          retrieval["recall"] * 0.5)
        
        answer_score = (answer["correctness"] * 0.5 +
                       answer["coverage"] * 0.3 +
                       answer["fluency"] * 0.2)
        
        citation_score = citation["f1"]
        
        overall = (retrieval_score * 0.3 +
                  answer_score * 0.4 +
                  citation_score * 0.3)
        
        return overall


def evaluate_rag(
    query: str,
    ground_truth: List[str],
    retrieved_docs: List[Dict],
    generated_answer: str,
    llm_judge: Optional[Callable] = None
) -> RAGEvaluationResult:
    """
    便捷评估函数
    """
    evaluator = RAGEvaluator(llm_judge=llm_judge)
    return evaluator.evaluate(
        query=query,
        ground_truth_docs=ground_truth,
        retrieved_docs=retrieved_docs,
        generated_answer=generated_answer
    )


if __name__ == "__main__":
    print("=== RAG评估器测试 ===\n")
    
    # 测试评估
    query = "BiFeO3的压电性能如何？"
    
    ground_truth = [
        "BiFeO3_Ferroelectric_Properties_2024",
        "High_d33_Piezoelectric_Materials_2023"
    ]
    
    retrieved = [
        {
            "paper_name": "BiFeO3_Ferroelectric_Properties_2024",
            "chunk_text": "BiFeO3具有优异的压电性能，d33可达6000 pC/N。"
        },
        {
            "paper_name": "Another_Paper_2024",
            "chunk_text": "该材料在传感器领域有重要应用。"
        }
    ]
    
    answer = """
BiFeO3是一种重要的铁电材料，具有较高的压电性能。

研究表明，BiFeO3的d33系数可达6000 pC/N [1]。

该材料在传感器领域有重要应用前景 [2]。
    """.strip()
    
    evaluator = RAGEvaluator()
    result = evaluator.evaluate(
        query=query,
        ground_truth_docs=ground_truth,
        retrieved_docs=retrieved,
        generated_answer=answer
    )
    
    print(result)
