# Paper-RAG 使用说明

## 独立使用

### 1. 处理新论文

```bash
cd tools/paper-rag
python process_paper.py /path/to/new_paper.pdf
```

输出：
- `papers/{论文名}/{论文名}.md` — Markdown 文本
- `papers/{论文名}/images/` — 提取的图片
- 更新 `chroma_db/chroma.sqlite3` 向量索引

### 2. 命令行问答

```python
# query_rag.py
import sys
sys.path.insert(0, 'tools/paper-rag')
from components.agent_pipeline import query_with_rag

answer = query_with_rag(
    query="PMN-PT 的 d33 上限是多少？",
    enable_rerank=True,
    enable_feedback=True,
    top_k=10,
    enable_citation=True
)
print(answer)
```

### 3. Python API 集成

```python
import sys
sys.path.insert(0, 'tools/paper-rag')
from components.agent_pipeline import RAGPipeline, RAGPipelineResult

pipeline = RAGPipeline(
    enable_rerank=True,
    enable_feedback=True,
    enable_citation=True
)

result: RAGPipelineResult = pipeline.run("弛豫铁电的极化纳米区(PNR) 是什么？")
print(result.answer)         # 回答内容
print(result.citations)      # 引用列表
print(result.retrieved_docs) # 检索文档
```

## 在 PFM 助手集成

参见 [`docs/paper_rag_integration.md`](../../docs/paper_rag_integration.md) 完整方案。

简短步骤：

### 步骤 1: 在 PFM 后端添加 RAG endpoint

修改 `pf_assistant/src/server/runtime-routes.js`（或新建 `paper-rag-routes.js`）：

```javascript
// tools/paper-rag/api/paper_rag_routes.js
const { spawn } = require('child_process');

async function handlePaperRagQuery(req, res) {
  const { query, top_k = 10 } = req.body;
  
  // 调用 Python RAG pipeline
  const py = spawn('python', [
    '-c',
    `
import sys, json
sys.path.insert(0, 'tools/paper-rag')
from components.agent_pipeline import query_with_rag
result = query_with_rag("${query}", top_k=${top_k})
print(json.dumps({"answer": result.answer, "citations": result.citations}))
    `
  ]);
  
  let output = '';
  py.stdout.on('data', d => output += d);
  py.on('close', () => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(output);
  });
}

module.exports = { handlePaperRagQuery };
```

### 步骤 2: 在前端添加 RAG 按钮

修改 `custom-webui/js/app.js`，在聊天输入框旁加 "📚 查论文" 按钮。

### 步骤 3: 在 scripts/ 加 RAG 集成脚本

```bash
# tools/paper-rag/test_paper_rag.sh
cd $(dirname $0)
python -c "
import sys
sys.path.insert(0, '.')
from components.agent_pipeline import query_with_rag
r = query_with_rag('测试问题', top_k=3)
print('OK:', r[:200])
"
```

## 性能参考

| 操作 | 耗时 | 备注 |
|------|------|------|
| 首次构建向量索引 | 2-4 h | 17,503 篇论文 |
| 增量索引（单篇） | 30-60 s | 含 PDF 解析 |
| 检索（多源融合） | 1-2 s | 17K 文档库 |
| Cross-Encoder 重排序 | 0.5-1 s | top_k=10 |
| LLM 回答生成 | 3-5 s | 取决于 LLM |

## 限制

- 论文 RAG 当前覆盖 ferro/压电/介电领域，**不覆盖**：
  - 磁性材料（铁磁/反铁磁/自旋电子学）
  - 多铁/磁电耦合
  - 拓扑绝缘体/超导

- 如需扩展领域，运行 `process_paper.py` 处理新论文即可

## 故障排查

### 检索不到结果
1. 确认 `chroma_db/chroma.sqlite3` 存在且大小 > 900 MB
2. 检查 `chromadb` 版本：`pip show chromadb` (推荐 0.4.x)
3. 查看 `chroma_db/8e898d85-.../` 目录是否完整

### LLM 调用失败
1. 设置环境变量 `OPENAI_API_KEY` 或配置本地 LLM endpoint
2. 详见 `components/llm_interface.py`

### 论文解析失败
1. 检查 MinerU 安装：`pip show magic-pdf`
2. 更新 GPU 驱动（如果用 GPU 加速）
3. 查看 `process_paper.py` 错误日志