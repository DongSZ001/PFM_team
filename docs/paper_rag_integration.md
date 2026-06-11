# Paper-RAG 集成指南

Date: 2026-06-11
Project: PFM2 WebUI / PFM Team Assistant

## 概述

`tools/paper-rag/` 是铁电/压电/相场主题的论文 RAG（检索增强生成）知识库工具，**17,503 篇** ferro/压电/介电/相场相关论文。

本指南说明如何将 Paper-RAG 集成到 PFM 助手的聊天界面。

## 集成方案

### 1. 数据流

```
用户 → PFM WebUI 聊天 → pf_assistant/serve.js
                              ↓
                      /api/paper-rag/query endpoint
                              ↓
                  spawn python (tools/paper-rag/...)
                              ↓
                  ChromaDB + BM25 + OpenAlex 多源检索
                              ↓
                  Cross-Encoder 重排序
                              ↓
                  LLM 生成回答 + 引用
                              ↓
                  流式返回到 WebUI
```

### 2. 后端实现

#### 2.1 创建 `tools/paper-rag/api/paper_rag_routes.js`

```javascript
'use strict';

const { spawn } = require('child_process');
const path = require('path');

const RAG_DIR = path.resolve(__dirname, '../');

async function handlePaperRagQuery(req, res) {
  const { query, top_k = 10 } = req.body;
  
  if (!query) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'query required'}));
    return;
  }
  
  // 调用 Python RAG
  const pyCode = `
import sys, json
sys.path.insert(0, '${RAG_DIR}')
from components.agent_pipeline import query_with_rag
result = query_with_rag(${JSON.stringify(query)}, top_k=${top_k})
print(json.dumps({
  "answer": result.answer,
  "citations": result.citations,
  "retrieved_docs_count": len(result.retrieved_docs) if hasattr(result, 'retrieved_docs') else 0
}))
  `;
  
  const py = spawn('python', ['-c', pyCode], {
    cwd: RAG_DIR,
    env: { ...process.env, PYTHONPATH: RAG_DIR }
  });
  
  let output = '';
  let error = '';
  py.stdout.on('data', d => output += d.toString());
  py.stderr.on('data', d => error += d.toString());
  
  py.on('close', code => {
    if (code !== 0) {
      console.error('[paper-rag] error:', error);
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'RAG query failed', detail: error}));
      return;
    }
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(output);
  });
}

module.exports = { handlePaperRagQuery };
```

#### 2.2 挂载到 `pf_assistant/serve.js`

```javascript
const paperRagRoutes = require('../tools/paper-rag/api/paper_rag_routes');

// 在路由分发中加
if (path.startsWith('/api/paper-rag/query') && method === 'POST') {
  return paperRagRoutes.handlePaperRagQuery(req, res);
}
```

### 3. 前端实现

修改 `custom-webui/js/app.js`，在聊天输入框添加 "📚 查论文" 模式切换：

```javascript
let ragMode = false;

// 在输入框附近加按钮
document.getElementById('ragToggle').addEventListener('click', () => {
  ragMode = !ragMode;
  document.getElementById('ragToggle').classList.toggle('active', ragMode);
  // UI 提示
  appendMessage('system', ragMode ? '📚 RAG 模式已开启' : '💬 普通模式');
});

// 修改 sendMessage
async function sendMessage(content) {
  if (ragMode) {
    // 调 RAG endpoint
    const response = await fetch('/api/paper-rag/query', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: content, top_k: 10})
    });
    const data = await response.json();
    appendMessage('assistant', data.answer);
    if (data.citations) {
      appendCitations(data.citations);
    }
  } else {
    // 原有 OpenClaw Gateway 逻辑
    sendViaGateway(content);
  }
}
```

### 4. 性能考虑

| 阶段 | 耗时 | 优化 |
|------|------|------|
| Python 子进程启动 | 0.5-1 s | 改用持久化 Python 服务（pyzmq/REST）|
| 检索 | 1-2 s | ChromaDB 内存缓存 |
| LLM 回答 | 3-5 s | 流式响应（已支持）|
| **总计** | ~5-8 s | 异步流式 |

建议改成 **持久化 Python 微服务**：

```bash
# 启动 RAG 服务（端口 8001）
python -m paper_rag.api.server --port 8001
```

PFM Node.js 通过 HTTP/gRPC 调用，避免每次都 spawn Python。

### 5. 数据安全

- 完整 RAG 数据（17 GB）放在阿里云 ECS 47.93.53.231
- PFM WebUI 不直接访问数据，通过 RAG 工具调用
- 数据同步脚本 `tools/paper-rag/sync_rag_data.sh` 支持从 OSS / SCP 拉取

## 测试

```bash
# 1. 验证 BM25 索引
python -c "
import sys
sys.path.insert(0, 'tools/paper-rag')
import pickle
with open('tools/paper-rag/chroma_db/bm25_incremental.pkl', 'rb') as f:
    bm25 = pickle.load(f)
print('BM25 OK,', len(bm25.documents), 'docs')
"

# 2. 验证 RAG pipeline
python -c "
import sys
sys.path.insert(0, 'tools/paper-rag')
from components.agent_pipeline import query_with_rag
r = query_with_rag('PMN-PT d33', top_k=3)
print('OK:', r[:200])
"
```

## 维护

- 添加新论文：`python process_paper.py /path/to/paper.pdf`
- 重建向量索引：见 `tools/paper-rag/SYNC_DATA.md`
- LLM 配置：`components/llm_interface.py` 设置 API key

## 扩展

未来可扩展的领域：
- 多铁/磁电耦合论文
- 拓扑绝缘体/超导
- 自旋电子学

直接运行 `process_paper.py` 处理新 PDF 即可加入 RAG 库。