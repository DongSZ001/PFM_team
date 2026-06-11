#!/usr/bin/env python3
"""
Phase 3: 项目级长期记忆
每个研究项目维护独立的记忆文件

功能:
- 创建/加载项目记忆
- 记录计算任务（类型/Agent/日期/状态/备注）
- 关联论文到项目
- 记录研究发现
- 生成项目进展摘要
"""

import os
import json
import shutil
from datetime import datetime
from typing import List, Dict, Any, Optional


class ProjectMemory:
    """
    项目记忆管理器
    每个项目独立目录: projects/{project_name}/
    """

    def __init__(self, projects_dir: str):
        """
        Args:
            projects_dir: 项目根目录
        """
        self.projects_dir = projects_dir
        os.makedirs(projects_dir, exist_ok=True)

    def get_project_dir(self, project_name: str) -> str:
        """获取项目目录路径（自动创建）"""
        # 清理项目名（去除特殊字符）
        safe_name = self._sanitize_name(project_name)
        path = os.path.join(self.projects_dir, safe_name)
        os.makedirs(path, exist_ok=True)
        return path

    def _sanitize_name(self, name: str) -> str:
        """将项目名转换为安全的目录名"""
        import re
        # 只保留字母数字中文和基本符号
        safe = re.sub(r'[<>:"/\\|?*]', '_', name)
        return safe[:50]  # 限制长度

    def _get_memory_file(self, project_name: str) -> str:
        """获取项目记忆文件路径"""
        proj_dir = self.get_project_dir(project_name)
        return os.path.join(proj_dir, "project_memory.json")

    def _load_memory(self, project_name: str) -> Dict[str, Any]:
        """加载项目记忆（如果不存在则返回默认结构）"""
        memory_file = self._get_memory_file(project_name)
        if os.path.exists(memory_file):
            try:
                with open(memory_file, encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[ProjectMemory] 加载失败: {e}")
        return self._default_memory(project_name)

    def _save_memory(self, project_name: str, memory: Dict[str, Any]):
        """保存项目记忆到文件"""
        memory_file = self._get_memory_file(project_name)
        memory["last_updated"] = datetime.now().isoformat()
        with open(memory_file, "w", encoding="utf-8") as f:
            json.dump(memory, f, ensure_ascii=False, indent=2)

    def _default_memory(self, project_name: str) -> Dict[str, Any]:
        """创建默认记忆结构"""
        return {
            "project_name": project_name,
            "description": "",
            "materials": [],
            "created_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "calculations": [],
            "papers": [],
            "findings": [],
            "next_steps": [],
            "tags": []
        }

    # ========== 公开 API ==========

    def create_project(
        self,
        project_name: str,
        description: str = "",
        materials: List[str] = None,
        tags: List[str] = None
    ) -> Dict[str, Any]:
        """
        创建新项目

        Args:
            project_name: 项目名称
            description: 项目描述
            materials: 研究材料列表
            tags: 标签

        Returns:
            项目信息
        """
        memory_file = self._get_memory_file(project_name)
        if os.path.exists(memory_file):
            print(f"[ProjectMemory] 项目已存在: {project_name}")
            return {"status": "exists", "project_dir": self.get_project_dir(project_name)}

        memory = self._default_memory(project_name)
        memory["description"] = description
        memory["materials"] = materials or []
        memory["tags"] = tags or []
        self._save_memory(project_name, memory)

        # 创建子目录
        proj_dir = self.get_project_dir(project_name)
        for subdir in ["data", "output", "figures", "scripts", "papers", "docs"]:
            os.makedirs(os.path.join(proj_dir, subdir), exist_ok=True)

        print(f"[ProjectMemory] 项目已创建: {project_name} -> {proj_dir}")
        return {
            "status": "created",
            "project_dir": proj_dir,
            "project_name": project_name
        }

    def add_calculation(
        self,
        project_name: str,
        calc_type: str,
        agent: str,
        notes: str = "",
        status: str = "completed",
        tags: List[str] = None,
        files: List[str] = None
    ) -> Dict[str, Any]:
        """
        记录完成的计算任务

        Args:
            project_name: 项目名称
            calc_type: 计算类型（如 "DFT能带", "相场模拟", "MD拉伸"）
            agent: 执行的子Agent（如 "ABACUS_Agent", "PF_Agent"）
            notes: 备注信息
            status: 状态 ("completed", "running", "failed", "pending")
            tags: 标签
            files: 相关文件列表
        """
        memory = self._load_memory(project_name)

        calc_entry = {
            "type": calc_type,
            "agent": agent,
            "date": datetime.now().isoformat(),
            "status": status,
            "notes": notes,
            "tags": tags or [],
            "files": files or []
        }

        memory["calculations"].append(calc_entry)
        self._save_memory(project_name, memory)

        return {
            "status": "added",
            "calc_type": calc_type,
            "total_calculations": len(memory["calculations"])
        }

    def add_finding(
        self,
        project_name: str,
        summary: str,
        source: str = "",
        importance: str = "medium"
    ) -> Dict[str, Any]:
        """
        记录研究发现

        Args:
            project_name: 项目名称
            summary: 发现摘要
            source: 来源（论文名/计算类型/实验等）
            importance: 重要程度 ("high", "medium", "low")
        """
        memory = self._load_memory(project_name)

        finding_entry = {
            "date": datetime.now().isoformat(),
            "summary": summary,
            "source": source,
            "importance": importance
        }

        memory["findings"].append(finding_entry)
        self._save_memory(project_name, memory)

        return {
            "status": "added",
            "total_findings": len(memory["findings"])
        }

    def link_paper(
        self,
        project_name: str,
        title: str,
        doi: str = "",
        relevance: str = "medium",
        notes: str = "",
        path: str = ""
    ) -> Dict[str, Any]:
        """
        关联论文到项目

        Args:
            project_name: 项目名称
            title: 论文标题
            doi: DOI
            relevance: 相关性 ("high", "medium", "low")
            notes: 备注
            path: 论文文件路径
        """
        memory = self._load_memory(project_name)

        # 检查是否已存在
        for paper in memory["papers"]:
            if (doi and paper.get("doi") == doi) or paper.get("title") == title:
                return {"status": "already_exists", "paper": title}

        paper_entry = {
            "title": title,
            "doi": doi,
            "relevance": relevance,
            "notes": notes,
            "path": path,
            "added_at": datetime.now().isoformat()
        }

        memory["papers"].append(paper_entry)
        self._save_memory(project_name, memory)

        return {
            "status": "linked",
            "total_papers": len(memory["papers"])
        }

    def add_next_step(
        self,
        project_name: str,
        step: str,
        priority: str = "medium",
        deadline: str = ""
    ) -> Dict[str, Any]:
        """添加下一步计划"""
        memory = self._load_memory(project_name)

        step_entry = {
            "step": step,
            "priority": priority,
            "deadline": deadline,
            "added_at": datetime.now().isoformat(),
            "completed": False
        }

        memory["next_steps"].append(step_entry)
        self._save_memory(project_name, memory)

        return {"status": "added", "total_steps": len(memory["next_steps"])}

    def complete_next_step(
        self,
        project_name: str,
        step_index: int
    ) -> Dict[str, Any]:
        """标记下一步计划为已完成"""
        memory = self._load_memory(project_name)
        if 0 <= step_index < len(memory["next_steps"]):
            memory["next_steps"][step_index]["completed"] = True
            memory["next_steps"][step_index]["completed_at"] = datetime.now().isoformat()
            self._save_memory(project_name, memory)
            return {"status": "completed"}
        return {"status": "error", "message": "step_index out of range"}

    def get_project_summary(self, project_name: str) -> str:
        """
        生成项目进展摘要（用于回答用户查询）

        Returns:
            格式化的项目摘要字符串
        """
        memory = self._load_memory(project_name)

        lines = [
            f"# 📊 项目: {project_name}",
            f"",
            f"**描述**: {memory.get('description', '未填写') or '无'}",
            f"**创建时间**: {memory.get('created_at', 'N/A')[:10]}",
            f"**最后更新**: {memory.get('last_updated', 'N/A')[:10]}",
            f"",
        ]

        # 材料体系
        materials = memory.get("materials", [])
        if materials:
            lines.append(f"## 🧪 材料体系 ({len(materials)})")
            lines.append(", ".join(materials))
            lines.append("")

        # 计算任务
        calcs = memory.get("calculations", [])
        if calcs:
            lines.append(f"## 🔬 已完成计算 ({len(calcs)})")
            # 只显示最近5条
            for c in calcs[-5:]:
                status_icon = "✅" if c["status"] == "completed" else "⏳" if c["status"] == "running" else "❌"
                lines.append(
                    f"- {status_icon} [{c['date'][:10]}] "
                    f"**{c['agent']}**: {c['type']} "
                    f"({c['status']})"
                )
                if c.get("notes"):
                    lines.append(f"  📝 {c['notes']}")
            lines.append("")

        # 论文关联
        papers = memory.get("papers", [])
        if papers:
            high_relevance = [p for p in papers if p.get("relevance") == "high"]
            lines.append(f"## 📚 关联论文 ({len(papers)}, 高相关 {len(high_relevance)})")
            for p in high_relevance[:5]:
                lines.append(f"- ⭐ *{p.get('title', 'Unknown')}*")
                if p.get("doi"):
                    lines.append(f"  DOI: {p['doi']}")
            if len(papers) > 5:
                lines.append(f"  ... 还有 {len(papers) - 5} 篇")
            lines.append("")

        # 关键发现
        findings = memory.get("findings", [])
        if findings:
            lines.append(f"## 💡 关键发现 ({len(findings)})")
            for f in findings[-3:]:
                importance = "🔥" if f.get("importance") == "high" else "💡"
                lines.append(f"- {importance} [{f['date'][:10]}] {f.get('summary', '')}")
                if f.get("source"):
                    lines.append(f"  📖 来源: {f['source']}")
            lines.append("")

        # 下一步计划
        next_steps = [s for s in memory.get("next_steps", []) if not s.get("completed")]
        if next_steps:
            lines.append(f"## 📋 下一步计划 ({len(next_steps)})")
            for i, s in enumerate(next_steps[:5]):
                priority = "🔴" if s.get("priority") == "high" else "🟡" if s.get("priority") == "medium" else "🟢"
                lines.append(f"- {priority} {s.get('step', '')}")
                if s.get("deadline"):
                    lines.append(f"  ⏰ 截止: {s['deadline']}")
            lines.append("")

        # 标签
        tags = memory.get("tags", [])
        if tags:
            lines.append(f"**标签**: {' '.join(f'#{t}' for t in tags)}")

        return "\n".join(lines)

    def list_projects(self, include_completed: bool = True) -> List[Dict[str, Any]]:
        """
        列出所有项目

        Returns:
            项目信息列表
        """
        projects = []
        if os.path.exists(self.projects_dir):
            for name in os.listdir(self.projects_dir):
                proj_dir = os.path.join(self.projects_dir, name)
                if os.path.isdir(proj_dir):
                    memory_file = os.path.join(proj_dir, "project_memory.json")
                    if os.path.exists(memory_file):
                        try:
                            with open(memory_file, encoding="utf-8") as f:
                                memory = json.load(f)
                                projects.append({
                                    "name": name,
                                    "description": memory.get("description", ""),
                                    "last_updated": memory.get("last_updated", ""),
                                    "calculation_count": len(memory.get("calculations", [])),
                                    "paper_count": len(memory.get("papers", [])),
                                    "finding_count": len(memory.get("findings", []))
                                })
                        except Exception:
                            pass

        # 按更新时间排序
        projects.sort(key=lambda x: x.get("last_updated", ""), reverse=True)
        return projects

    def delete_project(self, project_name: str, backup: bool = True) -> Dict[str, Any]:
        """
        删除项目

        Args:
            project_name: 项目名称
            backup: 是否先备份到 archive

        Returns:
            操作结果
        """
        proj_dir = self.get_project_dir(project_name)
        memory_file = self._get_memory_file(project_name)

        if not os.path.exists(memory_file):
            return {"status": "not_found", "project_name": project_name}

        if backup:
            archive_dir = os.path.join(self.projects_dir, "archive")
            os.makedirs(archive_dir, exist_ok=True)
            backup_name = f"{project_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            backup_path = os.path.join(archive_dir, backup_name)
            shutil.move(proj_dir, backup_path)
            return {"status": "archived", "backup_path": backup_path}
        else:
            shutil.rmtree(proj_dir)
            return {"status": "deleted", "project_name": project_name}


if __name__ == "__main__":
    # 测试
    pm = ProjectMemory("/data/home/3220245455/llm/vllm/agent/workspace/projects")

    # 创建项目
    print(pm.create_project(
        "BiFeO3_vortex研究",
        description="BiFeO3 涡旋畴结构的第一性原理和相场研究",
        materials=["BiFeO3", "BFO薄膜"],
        tags=["铁电", "拓扑结构", "DFT"]
    ))

    # 添加计算
    print(pm.add_calculation(
        "BiFeO3_vortex研究",
        calc_type="DFT能带计算",
        agent="ABACUS_Agent",
        notes="PBE泛函，SOC考虑",
        status="completed"
    ))

    print(pm.add_calculation(
        "BiFeO3_vortex研究",
        calc_type="相场模拟",
        agent="PF_Agent",
        notes="模拟尺寸 256x256x32",
        status="running"
    ))

    # 关联论文
    print(pm.link_paper(
        "BiFeO3_vortex研究",
        title="Observation of polar vortices in oxide superlattices",
        doi="10.1038/nature17659",
        relevance="high",
        notes="重要的拓扑畴结构文献"
    ))

    # 添加发现
    print(pm.add_finding(
        "BiFeO3_vortex研究",
        summary="BiFeO3 在应变调控下可形成涡旋畴结构",
        source="Yadav et al. Nature 2016",
        importance="high"
    ))

    # 添加下一步
    print(pm.add_next_step(
        "BiFeO3_vortex研究",
        step="完成 MD 力学响应模拟",
        priority="high",
        deadline="2026-04-15"
    ))

    # 打印摘要
    print("\n" + "="*60)
    print(pm.get_project_summary("BiFeO3_vortex研究"))

    # 列出所有项目
    print("\n所有项目:")
    for p in pm.list_projects():
        print(f"  - {p['name']} (更新: {p['last_updated'][:10]})")
