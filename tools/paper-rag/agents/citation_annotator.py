#!/usr/bin/env python3
"""
Citation Annotator - 引用自动标注

功能：
- 从回答中识别需要引用的事实
- 匹配对应的文献来源
- 添加标准格式的引用标注

作者: science-agent
日期: 2026-04-09
"""

import re
from typing import List, Dict, Any, Tuple


class CitationAnnotator:
    """
    引用标注器
    
    自动为回答添加文献引用
    """
    
    def __init__(self, citation_style: str = "numbered"):
        """
        初始化引用标注器
        
        Args:
            citation_style: 引用格式 ("numbered", "author_year", "superscript")
        """
        self.citation_style = citation_style
    
    def annotate(
        self,
        answer: str,
        retrieved_docs: List[Dict]
    ) -> str:
        """
        为回答添加引用标注
        
        Args:
            answer: 原始回答
            retrieved_docs: 检索到的文档列表
            
        Returns:
            添加引用后的回答
        """
        if not retrieved_docs:
            return answer
        
        # 构建文档引用映射
        doc_refs = self._build_doc_refs(retrieved_docs)
        
        # 简单的关键词匹配引用
        annotated_answer = answer
        
        for paper_name, ref_info in doc_refs.items():
            # 检查回答中是否提到了该论文的相关内容
            keywords = ref_info.get('keywords', [])
            for kw in keywords:
                if kw.lower() in answer.lower() and f"[{ref_info['num']}]" not in answer:
                    # 找到合适的插入位置（在句末或逗号前）
                    annotated_answer = self._insert_citation(
                        annotated_answer,
                        kw,
                        ref_info['num']
                    )
        
        return annotated_answer
    
    def _build_doc_refs(self, docs: List[Dict]) -> Dict[str, Dict]:
        """构建文档引用信息"""
        refs = {}
        
        for i, doc in enumerate(docs, 1):
            metadata = doc.get('metadata', {})
            paper_name = metadata.get('paper_title', doc.get('paper_name', f'Doc {i}'))
            
            # 提取关键词（如果有）
            keywords = []
            if 'keywords' in metadata:
                keywords = metadata['keywords']
            elif 'chunk_text' in doc:
                # 简单提取前几个词作为关键词
                text = doc['chunk_text'][:200]
                words = re.findall(r'\b[A-Za-z]{4,}\b', text)
                keywords = list(set(words[:5]))
            
            refs[paper_name] = {
                'num': i,
                'authors': metadata.get('authors', []),
                'year': metadata.get('year', ''),
                'journal': metadata.get('journal', ''),
                'keywords': keywords
            }
        
        return refs
    
    def _insert_citation(
        self,
        text: str,
        keyword: str,
        ref_num: int
    ) -> str:
        """在文本中插入引用"""
        # 找到包含关键词的句子
        pattern = rf'([^.]*{re.escape(keyword)}[^.]*\.)'
        match = re.search(pattern, text, re.IGNORECASE)
        
        if match:
            sentence = match.group(1)
            # 在句末（句号前）插入引用
            new_sentence = sentence[:-1] + f" [{ref_num}]."
            text = text.replace(sentence, new_sentence, 1)
        
        return text
    
    def format_reference_list(self, docs: List[Dict]) -> str:
        """
        格式化参考文献列表
        
        Args:
            docs: 检索到的文档列表
            
        Returns:
            格式化的参考文献
        """
        if not docs:
            return ""
        
        ref_lines = []
        for i, doc in enumerate(docs, 1):
            metadata = doc.get('metadata', {})
            title = metadata.get('paper_title', doc.get('paper_name', f'Reference {i}'))
            authors = metadata.get('authors', [])
            year = metadata.get('year', 'n.d.')
            journal = metadata.get('journal', '')
            
            if authors:
                author_str = ", ".join(authors[:3])
                if len(authors) > 3:
                    author_str += ", et al."
            else:
                author_str = "Unknown"
            
            ref_str = f"[{i}] {author_str} ({year}). {title}."
            if journal:
                ref_str += f" {journal}."
            
            ref_lines.append(ref_str)
        
        return "\n".join(ref_lines)
