# Ferro Storage Layout

更新时间：2026-06-04

铁电模块使用用户隔离文件存储。默认根目录为 `pf_assistant_data/users`，可通过 `PFM_USER_DATA_ROOT` 覆盖。用户目录名是 `u_<sha256(userId).slice(0, 24)>`，不直接暴露邮箱、用户名或原始用户 ID。

```text
pf_assistant_data/users/
  u_<hash>/
    user-manifest.json
    chat-history/
      <chatSessionId>/
        session.json
        messages.jsonl
        messages.snapshot.json
    ferroelectric-simulation/
      <chatSessionId>/
        <jobId>/
          manifest.json
          request.json
          input.in
          result-index.json
          result.json
          executable/
          source/
          materials/
          outputs/
          visualizations/
          logs/
```

`chat_messages` SQLite 表仍是聊天历史主存储；`chat-history` 下的 JSONL 和 snapshot 是镜像，便于审计和恢复。铁电 job 的 `result.json` 保存可恢复的结构化 `ferro_result`，历史消息只有 `jobId` 时可通过 `GET /api/ferro/jobs/:jobId/results` 重新拉取。

路径防护位于 `pf_assistant/src/storage/user-workspace.js`：

- `chatSessionId`、`jobId` 使用安全 segment 校验，拒绝路径穿越。
- asset 文件名使用白名单。
- `resolveFerroAssetPath()` 使用 realpath 校验目标仍在 job 目录内。
- `assertJobBelongsToUser()` 只在当前用户工作区查找 job，跨用户读取返回 404。
