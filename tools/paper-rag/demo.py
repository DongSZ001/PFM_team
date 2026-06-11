# import sys
# sys.modules['torch_npu'] = None

import copy
import json
import os
import argparse  # 新增：用于命令行参数解析
from pathlib import Path

from loguru import logger

from mineru.cli.common import convert_pdf_bytes_to_bytes_by_pypdfium2, prepare_env, read_fn
from mineru.data.data_reader_writer import FileBasedDataWriter
from mineru.utils.draw_bbox import draw_layout_bbox, draw_span_bbox
from mineru.utils.enum_class import MakeMode
from mineru.backend.vlm.vlm_analyze import doc_analyze as vlm_doc_analyze
from mineru.backend.pipeline.pipeline_analyze import doc_analyze as pipeline_doc_analyze
from mineru.backend.pipeline.pipeline_middle_json_mkcontent import union_make as pipeline_union_make
from mineru.backend.pipeline.model_json_to_middle_json import result_to_middle_json as pipeline_result_to_middle_json
from mineru.backend.vlm.vlm_middle_json_mkcontent import union_make as vlm_union_make
from mineru.utils.guess_suffix_or_lang import guess_suffix_by_path


def do_parse(
    output_dir,  # 用于存储解析结果的输出目录
    pdf_file_names: list[str],  # 待解析的PDF文件名列表
    pdf_bytes_list: list[bytes],  # 待解析的PDF字节列表
    p_lang_list: list[str],  # 每份PDF的语言列表，默认值为'ch'（中文）
    backend="pipeline",  # 用于解析PDF的后端，默认值为'pipeline'
    parse_method="auto",  # 解析PDF的方法，默认值为'auto'
    formula_enable=True,  # 启用公式解析
    table_enable=True,  # 启用表格解析
    server_url=None,  # vlm-http-client 后端的服务器 URL
    f_draw_layout_bbox=True,  # 是否绘制布局边界框
    f_draw_span_bbox=True,  # 是否绘制跨度边界框
    f_dump_md=True,  # 是否要删除Markdown文件
    f_dump_middle_json=True,  # 是否要丢弃中间JSON文件
    f_dump_model_output=True,  # 是否丢弃模型输出文件
    f_dump_orig_pdf=True,  # 是否删除原始PDF文件
    f_dump_content_list=True,  # 是否要丢弃内容列表文件
    f_make_md_mode=MakeMode.MM_MD,  # 制作Markdown内容的模式，默认值为MM_MD
    start_page_id=0,  # 解析起始页码ID，默认值为0
    end_page_id=None,  # 解析结束页标识符，默认值为None（解析文档所有页面直至末尾）
):

    if backend == "pipeline":
        for idx, pdf_bytes in enumerate(pdf_bytes_list):
            new_pdf_bytes = convert_pdf_bytes_to_bytes_by_pypdfium2(pdf_bytes, start_page_id, end_page_id)
            pdf_bytes_list[idx] = new_pdf_bytes

        infer_results, all_image_lists, all_pdf_docs, lang_list, ocr_enabled_list = pipeline_doc_analyze(pdf_bytes_list, p_lang_list, parse_method=parse_method, formula_enable=formula_enable,table_enable=table_enable)

        for idx, model_list in enumerate(infer_results):
            model_json = copy.deepcopy(model_list)
            pdf_file_name = pdf_file_names[idx]
            local_image_dir, local_md_dir = prepare_env(output_dir, pdf_file_name, parse_method)
            image_writer, md_writer = FileBasedDataWriter(local_image_dir), FileBasedDataWriter(local_md_dir)

            images_list = all_image_lists[idx]
            pdf_doc = all_pdf_docs[idx]
            _lang = lang_list[idx]
            _ocr_enable = ocr_enabled_list[idx]
            middle_json = pipeline_result_to_middle_json(model_list, images_list, pdf_doc, image_writer, _lang, _ocr_enable, formula_enable)

            pdf_info = middle_json["pdf_info"]

            pdf_bytes = pdf_bytes_list[idx]
            _process_output(
                pdf_info, pdf_bytes, pdf_file_name, local_md_dir, local_image_dir,
                md_writer, f_draw_layout_bbox, f_draw_span_bbox, f_dump_orig_pdf,
                f_dump_md, f_dump_content_list, f_dump_middle_json, f_dump_model_output,
                f_make_md_mode, middle_json, model_json, is_pipeline=True
            )
    else:
        if backend.startswith("vlm-"):
            backend = backend[4:]

        f_draw_span_bbox = False
        parse_method = "vlm"
        for idx, pdf_bytes in enumerate(pdf_bytes_list):
            pdf_file_name = pdf_file_names[idx]
            pdf_bytes = convert_pdf_bytes_to_bytes_by_pypdfium2(pdf_bytes, start_page_id, end_page_id)
            local_image_dir, local_md_dir = prepare_env(output_dir, pdf_file_name, parse_method)
            image_writer, md_writer = FileBasedDataWriter(local_image_dir), FileBasedDataWriter(local_md_dir)
            middle_json, infer_result = vlm_doc_analyze(pdf_bytes, image_writer=image_writer, backend=backend, server_url=server_url)

            pdf_info = middle_json["pdf_info"]

            _process_output(
                pdf_info, pdf_bytes, pdf_file_name, local_md_dir, local_image_dir,
                md_writer, f_draw_layout_bbox, f_draw_span_bbox, f_dump_orig_pdf,
                f_dump_md, f_dump_content_list, f_dump_middle_json, f_dump_model_output,
                f_make_md_mode, middle_json, infer_result, is_pipeline=False
            )


def _process_output(
        pdf_info,
        pdf_bytes,
        pdf_file_name,
        local_md_dir,
        local_image_dir,
        md_writer,
        f_draw_layout_bbox,
        f_draw_span_bbox,
        f_dump_orig_pdf,
        f_dump_md,
        f_dump_content_list,
        f_dump_middle_json,
        f_dump_model_output,
        f_make_md_mode,
        middle_json,
        model_output=None,
        is_pipeline=True
):
    """处理输出文件"""
    if f_draw_layout_bbox:
        draw_layout_bbox(pdf_info, pdf_bytes, local_md_dir, f"{pdf_file_name}_layout.pdf")

    if f_draw_span_bbox:
        draw_span_bbox(pdf_info, pdf_bytes, local_md_dir, f"{pdf_file_name}_span.pdf")

    if f_dump_orig_pdf:
        md_writer.write(
            f"{pdf_file_name}_origin.pdf",
            pdf_bytes,
        )

    image_dir = str(os.path.basename(local_image_dir))

    if f_dump_md:
        make_func = pipeline_union_make if is_pipeline else vlm_union_make
        md_content_str = make_func(pdf_info, f_make_md_mode, image_dir)
        md_writer.write_string(
            f"{pdf_file_name}.md",
            md_content_str,
        )

    if f_dump_content_list:
        make_func = pipeline_union_make if is_pipeline else vlm_union_make
        content_list = make_func(pdf_info, MakeMode.CONTENT_LIST, image_dir)
        md_writer.write_string(
            f"{pdf_file_name}_content_list.json",
            json.dumps(content_list, ensure_ascii=False, indent=4),
        )

    if f_dump_middle_json:
        md_writer.write_string(
            f"{pdf_file_name}_middle.json",
            json.dumps(middle_json, ensure_ascii=False, indent=4),
        )

    if f_dump_model_output:
        md_writer.write_string(
            f"{pdf_file_name}_model.json",
            json.dumps(model_output, ensure_ascii=False, indent=4),
        )

    logger.info(f"local output dir is {local_md_dir}")


def parse_doc(
        path_list: list[Path],
        output_dir,
        lang="en",
        backend="pipeline",
        method="auto",
        server_url=None,
        start_page_id=0,
        end_page_id=None
):
    """
        参数说明：
        path_list：待解析文档路径列表，可为PDF或图像文件。
        output_dir：存储解析结果的输出目录。
        lang: 语言选项，默认为'ch'，可选值包括['ch', 'ch_server', 'ch_lite', 'en', 'korean', 'japan', 'chinese_cht', 'ta', 'te', 'ka']。
            输入PDF中的语言（若已知）以提升OCR准确率。 可选。
            仅适用于后端设置为"pipeline"的情况
        backend: PDF解析后端：
            pipeline: 通用模式
            vlm-transformers: 通用模式
            vlm-vllm-engine: 加速模式(引擎)
            vlm-http-client：更快（客户端）。
            未指定方法时默认使用pipeline。
        method：PDF解析方法：
            auto：根据文件类型自动确定方法。
            txt：使用文本提取方法。
            ocr：针对基于图像的PDF使用OCR方法。
            未指定方法时默认使用'auto'。
            仅适用于后端设置为"pipeline"的情况。
        server_url：当后端为`http-client`时，需指定服务器地址，例如：`http://127.0.0.1:30000`
        start_page_id：解析起始页码，默认值为0
        end_page_id：解析结束页码，默认值为None（解析文档所有页面直至末尾）
    """
    try:
        file_name_list = []
        pdf_bytes_list = []
        lang_list = []
        
        # 增加空列表检查
        if not path_list:
            logger.warning("No files to process in the selected range.")
            return

        for path in path_list:
            file_name = str(Path(path).stem)
            pdf_bytes = read_fn(path)
            file_name_list.append(file_name)
            pdf_bytes_list.append(pdf_bytes)
            lang_list.append(lang)
            
        logger.info(f"Starting to process {len(path_list)} files.")
        
        do_parse(
            output_dir=output_dir,
            pdf_file_names=file_name_list,
            pdf_bytes_list=pdf_bytes_list,
            p_lang_list=lang_list,
            backend=backend,
            parse_method=method,
            server_url=server_url,
            start_page_id=start_page_id,
            end_page_id=end_page_id
        )
    except Exception as e:
        logger.exception(e)


if __name__ == '__main__':
    # --- 1. 命令行参数解析 ---
    parser = argparse.ArgumentParser(description="MinerU Efficient Batch Parser (Slice Loading)")
    parser.add_argument('--start', type=int, default=0, help='Start index m (inclusive), default: 0')
    parser.add_argument('--end', type=int, default=None, help='End index n (exclusive), default: None (all)')
    parser.add_argument('--input_dir', type=str, default=None, help='Input directory path')
    parser.add_argument('--output_dir', type=str, default=None, help='Output directory path')
    parser.add_argument('--backend', type=str, default='pipeline', help='Backend: pipeline, vlm-vllm-engine, vlm-http-client')
    args = parser.parse_args()
    # -------------------------

    # 基础路径配置
    __dir__ = os.path.dirname(os.path.abspath(__file__))
    pdf_files_dir = args.input_dir if args.input_dir else os.path.join(__dir__, "data")
    output_dir = args.output_dir if args.output_dir else os.path.join(__dir__, "data")
    
    pdf_suffixes = ["pdf"]
    image_suffixes = ["png", "jpeg", "jp2", "webp", "gif", "bmp", "jpg"]
    valid_suffixes = pdf_suffixes + image_suffixes

    print(f"正在扫描目录：{pdf_files_dir}")
    print(f"目标范围：[{args.start}:{args.end}]")

    # --- 2. 获取并排序全量文件列表 (仅读取文件名，不读取文件内容) ---
    all_doc_paths = []
    for doc_path in Path(pdf_files_dir).glob('*'):
        if guess_suffix_by_path(doc_path) in valid_suffixes:
            all_doc_paths.append(doc_path)
    
    # 【关键步骤】必须排序！否则每次运行 glob 的顺序可能不同
    all_doc_paths.sort(key=lambda x: str(x.name))
    
    total_count = len(all_doc_paths)
    print(f"目录中共发现 {total_count} 个有效文件。")

    if total_count == 0:
        print("错误：未找到任何 PDF 或图像文件。")
        exit(1)

    # --- 3. 执行切片 [m:n] ---
    selected_doc_paths = all_doc_paths[args.start : args.end]
    
    selected_count = len(selected_doc_paths)
    print(f"✅ 已筛选出 {selected_count} 个文件待处理。")
    
    if selected_count == 0:
        print("警告：指定范围内没有文件。请检查 start/end 参数。")
        print(f"可用索引范围：0 到 {total_count-1}")
        exit(0)

    # 打印预览
    print("--- 即将加载的文件列表 ---")
    for idx, p in enumerate(selected_doc_paths):
        real_idx = args.start + idx
        print(f"[{real_idx}] {p.name}")
    print("------------------------")

    # --- 4. 仅加载被选中的文件 (内存优化核心) ---
    file_name_list = []
    pdf_bytes_list = []
    lang_list = []
    
    print("开始读取文件内容到内存...")
    for path in selected_doc_paths:
        file_name = str(Path(path).stem)
        try:
            pdf_bytes = read_fn(path)  # 仅在这里发生磁盘 IO
            file_name_list.append(file_name)
            pdf_bytes_list.append(pdf_bytes)
            lang_list.append("en")
        except Exception as e:
            logger.error(f"读取文件失败 {path.name}: {e}")
            continue

    if not pdf_bytes_list:
        print("错误：未能成功读取任何文件。")
        exit(1)
        
    print(f"成功加载 {len(pdf_bytes_list)} 个文件到内存。")

    # --- 5. 模型加载与执行 ---
    print('加载模型环境...')
    os.environ['TRANSFORMERS_CACHE'] = '/root/.cache/modelscope/hub/models/OpenDataLab/MinerU2___5-2509-1___2B'
    os.environ['MINERU_MODEL_SOURCE'] = 'local'

    print('开始解析任务...')
    
    # --- 【修正】直接调用 do_parse，而不是 parse_doc ---
    try:
        do_parse(
            output_dir=output_dir,
            pdf_file_names=file_name_list,
            pdf_bytes_list=pdf_bytes_list,
            p_lang_list=lang_list,
            backend=args.backend,
            parse_method="auto",
            server_url=None,
            start_page_id=0,
            end_page_id=None
        )
        print("✅ 解析任务完成！")
    except Exception as e:
        logger.exception(f"解析过程中发生严重错误：{e}")
        exit(1)