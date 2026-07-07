# profile 完整实现（V0.1.40）

> 📅 启动：2026-07-07
> 📋 方案 1（完整修复：schema+service+upload+前端）

## 计划
- A. schema User +gender/birthday/region/height/weight + 迁移
- B. shared User type +5 字段
- C. 后端 user.schema UserOutputSchema +5 / service updateProfile 处理 profile / toUserOutput 返新字段
- D. api.ts uploadFile 拼 baseUrl（avatarUrl 完整 URL）
- E. 前端 profile-popup default-avatar /images/ + profile/index applyUser 回填
- F. 验证 + 部署

## 7 个问题修复
1. User 表缺 5 字段 → schema 加
2. service 忽略 profile → 处理
3. avatarUrl 相对路径 → 前端拼 baseUrl
4. popup default-avatar 相对 → /images/
5. profile 不回填 → applyUser 回填
6. upload hardcoded subdir → 可接受
7. UserOutputSchema 不含 → 加 5 字段
