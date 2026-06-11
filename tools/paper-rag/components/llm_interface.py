#!/usr/bin/env python3
"""
LLM接口模块 - 统一调用MiniMax和vLLM

支持:
1. MiniMax (远程API)
2. vLLM (本地模型)

作者: science-agent
日期: 2026-04-09
"""

import os
import json
import time
import httpx
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass
from enum import Enum


class LLMProvider(Enum):
    """LLM提供商枚举"""
    MINIMAX = "minimax"
    VLLM = "vllm"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


@dataclass
class LLMResponse:
    """LLM响应"""
    content: str
    model: str
    usage: Dict[str, int]
    latency_ms: float
    provider: LLMProvider


class MiniMaxLLM:
    """MiniMax API客户端"""
    
    # 支持的模型列表
    SUPPORTED_MODELS = [
        "MiniMax-M2.7",
        "minimax-m2.7",
        "abab6.5s-chat",
        "abab5.5-chat", 
        "abab6-chat",
        "MiniMax-Text-01",
        "MiniMax-Text-01-200k",
        "MiniMax-Text-01-flash"
    ]
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.minimax.chat/v1",
        model: str = "minimax-m2.7",
        timeout: int = 120
    ):
        """
        初始化MiniMax客户端
        
        Args:
            api_key: API密钥，默认从环境变量获取
            base_url: API基础URL
            model: 模型名称（默认minimax-m2.7）
            timeout: 超时时间（秒）
        """
        self.api_key = api_key or os.environ.get("MINIMAX_API_KEY", "")
        self.base_url = base_url
        self.model = model
        self.timeout = timeout
        
        if not self.api_key:
            print("[MiniMaxLLM] 警告: 未设置MINIMAX_API_KEY环境变量")
    
    def generate(
        self,
        prompt: str,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        top_p: float = 0.95,
        **kwargs
    ) -> LLMResponse:
        """
        生成文本
        
        Args:
            prompt: 输入提示
            max_tokens: 最大生成token数
            temperature: 温度参数
            top_p: top_p采样参数
            
        Returns:
            LLMResponse: 响应对象
        """
        start_time = time.time()
        
        if not self.api_key:
            return LLMResponse(
                content="[错误] MiniMax API未配置，请设置MINIMAX_API_KEY环境变量",
                model=self.model,
                usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                latency_ms=(time.time() - start_time) * 1000,
                provider=LLMProvider.MINIMAX
            )
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            **kwargs
        }
        
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/text/chatcompletion_v2",
                    headers=headers,
                    json=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # 检查API错误
                    base_resp = data.get("base_resp", {})
                    if base_resp and base_resp.get("status_code") != 0:
                        error_msg = base_resp.get("status_msg", "Unknown error")
                        return LLMResponse(
                            content=f"[错误] API返回错误: {error_msg} (code: {base_resp.get('status_code')})",
                            model=self.model,
                            usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                            latency_ms=(time.time() - start_time) * 1000,
                            provider=LLMProvider.MINIMAX
                        )
                    
                    # 提取内容 - MiniMax-M2.7格式
                    content = ""
                    choices = data.get("choices")
                    if choices and len(choices) > 0:
                        first_choice = choices[0]
                        if isinstance(first_choice, dict):
                            message = first_choice.get("message", {})
                            # 优先取content
                            content = message.get("content", "")
                            # M2.7推理模型：content为空时使用reasoning_content
                            if not content:
                                reasoning = message.get("reasoning_content", "")
                                if reasoning:
                                    # 提取reasoning中的实际回答
                                    content = self._extract_from_reasoning(reasoning)
                            # 备选：直接text字段
                            if not content:
                                content = first_choice.get("text", "")
                            # 备选：直接content字段
                            if not content:
                                content = first_choice.get("content", "")
                    
                    if not content:
                        content = "[错误] 无法解析API响应内容"
                    
                    usage = data.get("usage", {})
                    
                    return LLMResponse(
                        content=content,
                        model=self.model,
                        usage=usage,
                        latency_ms=(time.time() - start_time) * 1000,
                        provider=LLMProvider.MINIMAX
                    )
                else:
                    return LLMResponse(
                        content=f"[错误] API请求失败: {response.status_code} - {response.text[:200]}",
                        model=self.model,
                        usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                        latency_ms=(time.time() - start_time) * 1000,
                        provider=LLMProvider.MINIMAX
                    )
                    
        except httpx.TimeoutException:
            return LLMResponse(
                content="[错误] API请求超时",
                model=self.model,
                usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                latency_ms=(time.time() - start_time) * 1000,
                provider=LLMProvider.MINIMAX
            )
        except Exception as e:
            return LLMResponse(
                content=f"[错误] {str(e)}",
                model=self.model,
                usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                latency_ms=(time.time() - start_time) * 1000,
                provider=LLMProvider.MINIMAX
            )
    
    def _extract_from_reasoning(self, reasoning: str) -> str:
        """
        从reasoning_content中提取实际回答
        
        MiniMax-M2.7推理模型的回答可能包含在reasoning_content中
        需要解析并提取实际回复内容
        """
        if not reasoning:
            return ""
        
        # reasoning内容示例:
        # "用户说"hi"。这是一个问候。我应该友好地回应，说"Hi there! How can I help you today?""
        # 我们需要提取引号中的实际回复
        
        import re
        
        # 尝试提取被引号包围的内容
        patterns = [
            r'"([^"]+)"',  # 双引号内容
            r"'([^']+)'",  # 单引号内容
            r'说"?([^"，。]+)"?',  # 说"xxx"格式
            r'回答"?([^""\n]+)"?',  # 回答"xxx"格式
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, reasoning)
            if matches:
                # 返回最后一个匹配（通常是最新的回答）
                candidate = matches[-1].strip()
                if len(candidate) > 5:  # 排除太短的
                    return candidate
        
        # 如果没有匹配到引号格式，尝试截取关键句子
        sentences = reasoning.replace('。', '\n').replace('. ', '\n').split('\n')
        for sentence in reversed(sentences):
            sentence = sentence.strip()
            if len(sentence) > 10 and not sentence.startswith('The user') and not sentence.startswith('用户'):
                return sentence
        
        return reasoning[:200] if len(reasoning) > 200 else reasoning
    
    def __call__(self, prompt: str, **kwargs) -> str:
        """便捷调用"""
        return self.generate(prompt, **kwargs).content


class VLLMClient:
    """vLLM本地模型客户端"""
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 8000,
        model: Optional[str] = None,
        timeout: int = 300
    ):
        """
        初始化vLLM客户端
        
        Args:
            host: vLLM服务地址
            port: vLLM端口
            model: 模型名称（如果vLLM加载了多个模型）
            timeout: 超时时间（秒）
        """
        self.base_url = f"http://{host}:{port}"
        self.model = model
        self.timeout = timeout
        self._check_health()
    
    def _check_health(self):
        """检查vLLM服务健康状态"""
        try:
            with httpx.Client(timeout=5) as client:
                response = client.get(f"{self.base_url}/health")
                if response.status_code == 200:
                    print(f"[VLLMClient] vLLM服务健康: {self.base_url}")
                else:
                    print(f"[VLLMClient] vLLM服务异常: {response.status_code}")
        except Exception as e:
            print(f"[VLLMClient] vLLM服务不可达: {e}")
            print(f"[VLLMClient] 请确保vLLM服务正在运行: python -m vllm.entrypoints.openai.api_server ...")
    
    def generate(
        self,
        prompt: str,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        top_p: float = 0.95,
        stop: Optional[List[str]] = None,
        **kwargs
    ) -> LLMResponse:
        """
        生成文本
        
        Args:
            prompt: 输入提示
            max_tokens: 最大生成token数
            temperature: 温度参数
            top_p: top_p采样参数
            stop: 停止词列表
            
        Returns:
            LLMResponse: 响应对象
        """
        start_time = time.time()
        
        payload = {
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stop": stop or [],
            **kwargs
        }
        
        if self.model:
            payload["model"] = self.model
        
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/completions",
                    headers={"Content-Type": "application/json"},
                    json=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    content = data.get("choices", [{}])[0].get("text", "")
                    
                    # 尝试从chat completions格式读取
                    if not content:
                        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    
                    usage = data.get("usage", {})
                    
                    return LLMResponse(
                        content=content,
                        model=data.get("model", self.model or "unknown"),
                        usage={
                            "prompt_tokens": usage.get("prompt_tokens", 0),
                            "completion_tokens": usage.get("completion_tokens", 0),
                            "total": usage.get("total_tokens", 0)
                        },
                        latency_ms=(time.time() - start_time) * 1000,
                        provider=LLMProvider.VLLM
                    )
                else:
                    return LLMResponse(
                        content=f"[错误] vLLM请求失败: {response.status_code} - {response.text}",
                        model=self.model or "unknown",
                        usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                        latency_ms=(time.time() - start_time) * 1000,
                        provider=LLMProvider.VLLM
                    )
                    
        except httpx.TimeoutException:
            return LLMResponse(
                content="[错误] vLLM请求超时",
                model=self.model or "unknown",
                usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                latency_ms=(time.time() - start_time) * 1000,
                provider=LLMProvider.VLLM
            )
        except Exception as e:
            return LLMResponse(
                content=f"[错误] {str(e)}",
                model=self.model or "unknown",
                usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
                latency_ms=(time.time() - start_time) * 1000,
                provider=LLMProvider.VLLM
            )
    
    def __call__(self, prompt: str, **kwargs) -> str:
        """便捷调用"""
        return self.generate(prompt, **kwargs).content


class UnifiedLLM:
    """
    统一LLM接口
    
    自动在多个LLM提供商之间路由，支持:
    1. MiniMax (优先用于测试)
    2. vLLM (本地)
    3. OpenAI
    4. Anthropic
    """
    
    def __init__(
        self,
        primary: LLMProvider = LLMProvider.MINIMAX,
        fallback: Optional[LLMProvider] = None,
        **kwargs
    ):
        """
        初始化统一LLM接口
        
        Args:
            primary: 主LLM提供商
            fallback: 备用LLM提供商（主LLM失败时使用）
            **kwargs: 传递给各LLM客户端的参数
        """
        self.primary = primary
        self.fallback = fallback
        self.kwargs = kwargs
        
        # 初始化客户端
        self.clients: Dict[LLMProvider, Any] = {}
        self._init_clients()
        
        print(f"[UnifiedLLM] 初始化完成")
        print(f"  主LLM: {primary.value}")
        if fallback:
            print(f"  备用LLM: {fallback.value}")
    
    def _init_clients(self):
        """初始化各LLM客户端"""
        # MiniMax
        if self.primary == LLMProvider.MINIMAX or self.fallback == LLMProvider.MINIMAX:
            try:
                self.clients[LLMProvider.MINIMAX] = MiniMaxLLM(**self.kwargs)
            except Exception as e:
                print(f"[UnifiedLLM] MiniMax初始化失败: {e}")
        
        # vLLM
        if self.primary == LLMProvider.VLLM or self.fallback == LLMProvider.VLLM:
            try:
                self.clients[LLMProvider.VLLM] = VLLMClient(**self.kwargs)
            except Exception as e:
                print(f"[UnifiedLLM] vLLM初始化失败: {e}")
    
    def generate(
        self,
        prompt: str,
        provider: Optional[LLMProvider] = None,
        **kwargs
    ) -> LLMResponse:
        """
        生成文本
        
        Args:
            prompt: 输入提示
            provider: 指定LLM提供商（默认使用primary）
            **kwargs: 传递给LLM的参数
            
        Returns:
            LLMResponse: 响应对象
        """
        provider = provider or self.primary
        
        # 尝试主LLM
        if provider in self.clients:
            response = self.clients[provider].generate(prompt, **kwargs)
            
            # 检查是否需要使用备用
            if response.content.startswith("[错误]") and self.fallback:
                print(f"[UnifiedLLM] 主LLM({provider.value})失败，尝试备用LLM({self.fallback.value})")
                response = self.clients[self.fallback].generate(prompt, **kwargs)
            
            return response
        
        # 指定的provider未初始化
        return LLMResponse(
            content=f"[错误] LLM提供商 {provider.value} 未初始化",
            model="unknown",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total": 0},
            latency_ms=0,
            provider=provider
        )
    
    def __call__(self, prompt: str, **kwargs) -> str:
        """便捷调用"""
        return self.generate(prompt, **kwargs).content


# 全局实例
_unified_llm: Optional[UnifiedLLM] = None


def get_unified_llm(
    primary: LLMProvider = LLMProvider.MINIMAX,
    fallback: Optional[LLMProvider] = LLMProvider.VLLM,
    **kwargs
) -> UnifiedLLM:
    """
    获取全局UnifiedLLM实例（单例模式）
    
    Example:
        llm = get_unified_llm()
        result = llm("你好，请介绍一下自己")
    """
    global _unified_llm
    
    if _unified_llm is None:
        _unified_llm = UnifiedLLM(primary=primary, fallback=fallback, **kwargs)
    
    return _unified_llm


def reset_unified_llm():
    """重置全局LLM实例（用于重新配置）"""
    global _unified_llm
    _unified_llm = None


# 兼容性别名
MiniMax = MiniMaxLLM
VLLM = VLLMClient


if __name__ == "__main__":
    print("=== LLM接口测试 ===\n")
    
    # 测试MiniMax
    print("1. 测试MiniMax:")
    minimax = MiniMaxLLM()
    response = minimax.generate("用一句话介绍自己", max_tokens=100)
    print(f"   模型: {response.model}")
    print(f"   延迟: {response.latency_ms:.0f}ms")
    print(f"   内容: {response.content[:200]}")
    print()
    
    # 测试vLLM
    print("2. 测试vLLM:")
    vllm = VLLMClient(host="localhost", port=8000)
    response = vllm.generate("用一句话介绍自己", max_tokens=100)
    print(f"   模型: {response.model}")
    print(f"   延迟: {response.latency_ms:.0f}ms")
    print(f"   内容: {response.content[:200]}")
    print()
    
    # 测试UnifiedLLM
    print("3. 测试UnifiedLLM:")
    llm = get_unified_llm(primary=LLMProvider.MINIMAX, fallback=LLMProvider.VLLM)
    response = llm("用一句话介绍自己", max_tokens=100)
    print(f"   提供商: {response.provider.value}")
    print(f"   内容: {response.content[:200]}")
