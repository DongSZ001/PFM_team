#!/usr/bin/env python3
"""
论文处理脚本：接收PDF，进行MinerU解析，存储结果到papers目录

流程：
1. 检查论文是否已存在（去重）
2. 复制PDF到 data/ 目录
3. 运行 demo.py 解析
4. 移动 .md 和 images/ 到 papers/{论文名}/
5. 增量更新向量索引
6. 清理临时文件

功能：
- 去重机制：已存在的论文跳过解析
- 增量索引：只更新单篇，不重建全量索引
"""

import os
import shutil
import subprocess
import glob
import sys
import hashlib
import urllib.request
import urllib.parse
import json
import re


def verify_journal_from_crossref(paper_dir):
    """
    使用Crossref API验证期刊信息
    
    Returns:
        dict: {'journal': str, 'year': str, 'verified': bool} 或 None（验证失败）
    """
    # 从.md文件中提取标题
    md_file = glob.glob(os.path.join(paper_dir, '*.md'))
    if not md_file:
        return None
    
    try:
        with open(md_file[0], 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 提取标题（第一个#开头的行）
        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        if not title_match:
            return None
        
        title = title_match.group(1).strip()
        # 清理标题中的特殊字符
        title = re.sub(r'[{}\$\\]', '', title)
        
        # 调用Crossref API
        query = urllib.parse.quote(title[:200])  # 限制标题长度
        url = f"https://api.crossref.org/works?query={query}&rows=1"
        
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; Paper-RAG/1.0)'
        })
        
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        items = data.get('message', {}).get('items', [])
        if not items:
            return None
        
        paper_info = items[0]
        
        # 提取期刊名
        journal = paper_info.get('container-title', [''])[0] if paper_info.get('container-title') else ''
        
        # 提取年份
        year = None
        if paper_info.get('published-print'):
            year = str(paper_info['published-print']['date-parts'][0][0])
        elif paper_info.get('published-online'):
            year = str(paper_info['published-online']['date-parts'][0][0])
        elif paper_info.get('created'):
            year = str(paper_info['created']['date-parts'][0][0])
        
        return {
            'journal': journal,
            'year': year,
            'verified': True
        }
        
    except Exception as e:
        print(f"[WARN] Crossref API调用失败: {e}")
        return None


def is_paper_exists(paper_name, papers_dir):
    """检查论文是否已存在于papers目录中"""
    paper_dir = os.path.join(papers_dir, paper_name)
    if os.path.exists(paper_dir):
        # 检查是否有.md文件
        md_files = glob.glob(os.path.join(paper_dir, '*.md'))
        if md_files:
            return True
    return False


def get_file_hash(file_path):
    """计算文件MD5哈希"""
    md5 = hashlib.md5()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            md5.update(chunk)
    return md5.hexdigest()


def process_paper(pdf_path, paper_name=None, force=False):
    """
    处理单篇论文
    
    Args:
        pdf_path: PDF文件路径
        paper_name: 可选，论文目录名，默认使用PDF文件名
        force: 强制重新处理，即使已存在
    """
    rag_dir = '/data/home/3220245455/llm/vllm/agent/workspace/rag'
    data_dir = os.path.join(rag_dir, 'data')
    papers_dir = os.path.join(rag_dir, 'papers')
    demo_script = '/data/home/3220245455/llm/vllm/agent/workspace/rag/demo.py'
    
    # 创建data目录（如果不存在）
    os.makedirs(data_dir, exist_ok=True)
    
    # 确定论文目录名
    if paper_name is None:
        paper_name = os.path.splitext(os.path.basename(pdf_path))[0]
    
    # 清理论文名中的非法字符
    paper_name = paper_name.replace('/', '_').replace('\\', '_')
    
    # ============ 去重检查 ============
    if not force and is_paper_exists(paper_name, papers_dir):
        print(f"[INFO] 论文已存在，跳过解析: {paper_name}")
        print(f"[INFO] 使用 --force 可强制重新处理")
        
        # 仍尝试增量索引（以防之前的索引丢失）
        try:
            from components.vector_store import HybridVectorStore
            store = HybridVectorStore(os.path.join(rag_dir, 'chroma_db'))
            result = store.add_paper(os.path.join(papers_dir, paper_name))
            if result.get('status') == 'success':
                print(f"[INFO] 增量索引已更新: {result['chunks_added']} chunks")
        except Exception as e:
            print(f"[WARN] 增量索引更新失败: {e}")
        
        return True
    
    # 复制PDF到data目录
    pdf_basename = os.path.basename(pdf_path)
    data_pdf_path = os.path.join(data_dir, pdf_basename)
    
    # 清理data目录中可能存在的其他PDF，只保留目标PDF
    print(f"[INFO] 清理data目录中可能存在的其他PDF...")
    for f in glob.glob(os.path.join(data_dir, '*.pdf')):
        if os.path.basename(f) != pdf_basename:
            print(f"[INFO] 删除多余PDF: {f}")
            os.remove(f)
    
    # 如果源文件已在data目录，跳过复制
    if os.path.abspath(pdf_path) == os.path.abspath(data_pdf_path):
        print(f"[INFO] PDF已在data目录，跳过复制")
    else:
        print(f"[INFO] 复制PDF到 data/ 目录: {data_pdf_path}")
        shutil.copy(pdf_path, data_pdf_path)
    
    # 目标论文目录
    paper_dir = os.path.join(papers_dir, paper_name)
    
    # 清理已存在的论文目录（如果存在）
    if os.path.exists(paper_dir):
        print(f"[INFO] 清理已存在的论文目录: {paper_dir}")
        shutil.rmtree(paper_dir)
    os.makedirs(paper_dir, exist_ok=True)
    
    # 临时输出目录 - demo.py会创建 {temp_output}/{pdf_stem}/auto/
    temp_output = os.path.join(paper_dir, '_temp_output')
    
    try:
        print(f"[INFO] 开始MinerU解析...")
        print(f"[INFO] 输入目录: {data_dir}")
        print(f"[INFO] 输出目录: {temp_output}")
        
        # 使用subprocess运行demo.py（不通过import，保持环境变量设置）
        result = subprocess.run(
            [sys.executable, demo_script,
             '--input_dir', data_dir,
             '--output_dir', temp_output,
             '--start', '0',
             '--end', '1'],
            capture_output=True,
            text=True,
            cwd=rag_dir  # 关键：切换到rag目录运行
        )
        
        print(f"[INFO] demo.py 返回码: {result.returncode}")
        if result.returncode != 0:
            print(f"[ERROR] demo.py stderr: {result.stderr[-2000:]}")
            raise Exception(f"demo.py执行失败，返回码: {result.returncode}")
        
        print(f"[INFO] 解析完成，开始整理结果...")
        
        # 查找输出目录 - demo.py创建 {temp_output}/{pdf_stem}/auto/
        # pdf_stem 是不带扩展名的PDF文件名
        pdf_stem = os.path.splitext(pdf_basename)[0]
        output_subdir = os.path.join(temp_output, pdf_stem, 'auto')
        
        if not os.path.exists(output_subdir):
            raise Exception(f"未找到解析输出目录: {output_subdir}")
        
        print(f"[INFO] 输出子目录: {output_subdir}")
        
        # 移动.md文件到paper_dir
        for md_file in glob.glob(os.path.join(output_subdir, '*.md')):
            dest_md = os.path.join(paper_dir, f"{paper_name}.md")
            shutil.move(md_file, dest_md)
            print(f"[INFO] 移动Markdown: {dest_md}")
        
        # 移动images目录
        images_src = os.path.join(output_subdir, 'images')
        images_dest = os.path.join(paper_dir, 'images')
        if os.path.exists(images_src):
            if os.path.exists(images_dest):
                shutil.rmtree(images_dest)
            shutil.move(images_src, images_dest)
            print(f"[INFO] 移动图片目录: {images_dest}")
        
        # 移动其他JSON/PDF文件
        for ext in ['*_content_list.json', '*_layout.pdf', '*_middle.json', '*_model.json', '*_origin.pdf', '*_span.pdf']:
            for f in glob.glob(os.path.join(output_subdir, ext)):
                basename = os.path.basename(f)
                dest = os.path.join(paper_dir, basename)
                shutil.move(f, dest)
                print(f"[INFO] 移动文件: {basename}")
        
        # 清理临时目录
        shutil.rmtree(temp_output)
        
        # 清理kernel_meta空目录
        kernel_meta_dir = os.path.join(rag_dir, 'kernel_meta')
        if os.path.exists(kernel_meta_dir):
            for item in os.listdir(kernel_meta_dir):
                item_path = os.path.join(kernel_meta_dir, item)
                if os.path.isdir(item_path) and not os.listdir(item_path):
                    shutil.rmtree(item_path)
                    print(f"[INFO] 删除kernel_meta空目录: {item_path}")
        
        # 删除data中的原PDF（解析成功）
        print(f"[INFO] 删除data目录中的原文件: {data_pdf_path}")
        os.remove(data_pdf_path)
        
        # ============ 增量更新向量索引 ============
        print(f"[INFO] 开始增量更新向量索引...")
        try:
            from components.vector_store import HybridVectorStore
            store = HybridVectorStore(os.path.join(rag_dir, 'chroma_db'))
            result = store.add_paper(paper_dir)
            if result.get('status') == 'success':
                print(f"[INFO] 增量索引成功: 新增 {result['chunks_added']} chunks")
                print(f"[INFO] ChromaDB总计: {store.collection.count()} chunks")
            else:
                print(f"[WARN] 增量索引跳过: {result.get('reason', 'unknown')}")
        except Exception as e:
            print(f"[ERROR] 增量索引失败: {e}")
            print(f"[WARN] 建议手动运行: store.index_papers() 重建索引")
        
        # ============ 期刊信息验证 ============
        print(f"[INFO] 开始期刊信息验证...")
        journal_info = verify_journal_from_crossref(paper_dir)
        if journal_info:
            print(f"[INFO] 期刊验证成功: {journal_info['journal']} ({journal_info['year']}) ✅")
        else:
            print(f"[WARN] 期刊验证失败，使用PDF内信息 🔄")
        
        print(f"✅ 论文处理成功: {paper_name}")
        return True
        
    except Exception as e:
        print(f"[ERROR] 解析失败: {e}")
        print(f"[INFO] 保留data目录中的PDF: {data_pdf_path}")
        # 清理临时目录（如果存在）
        if os.path.exists(temp_output):
            shutil.rmtree(temp_output)
        return False


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='论文处理脚本')
    parser.add_argument('pdf_path', help='PDF文件路径')
    parser.add_argument('paper_name', nargs='?', default=None, help='论文目录名（可选）')
    parser.add_argument('--force', action='store_true', help='强制重新处理已存在的论文')
    
    args = parser.parse_args()
    
    success = process_paper(args.pdf_path, args.paper_name, force=args.force)
    sys.exit(0 if success else 1)
