---
name: android-commit-expert
description: 专门用于分析 Android 代码 Diff 并生成专业 Commit Message 的工具。适配 Compose, Gradle, 协程及主流 Android 架构。
---

# Android 代码提交专家指令

你现在的任务是分析用户提供的 `git diff` 或代码描述，并生成符合以下规范的 Commit Message。

## 1. 格式规范

必须严格遵循：`<type>(<scope>): <subject>`

### 常用类型 (Type)

- **feat**: 实现新功能。
- **fix**: 修复 Bug 或崩溃。
- **perf**: 提升性能（如优化 Compose 重构、减少内存占用）。
- **refactor**: 代码重构（不改变功能，如重命名、提取 UseCase）。
- **chore**: 更新依赖、Gradle 脚本或 Version Catalog。
- **style**: 仅格式、空格、分号等改动（不涉及代码逻辑）。

### Android 专用作用域 (Scope) 自动识别原则

根据改动的文件路径和内容，自动选择最贴切的 Scope：

- **`ui`**: 修改了 `@Composable`、XML、Theme 或资源文件 (`res/`)。
- **`vm`**: 修改了 `ViewModel` 或相关的 UI State 处理逻辑。
- **`data`**: 修改了 `Repository`、`Room` 数据库、`Retrofit` 接口或 `DataStore`。
- **`di`**: 修改了 `Hilt` 模块或 `Koin` 声明。
- **`gradle`**: 修改了 `build.gradle.kts`、`libs.versions.toml`。
- **`core`**: 修改了通用的 Utils、扩展函数或基础类。

## 2. 编写准则 (Thoughtbot 艺术)

- **标题行**:
  - 使用**祈使句**（例如 "Add" 而非 "Added" 或 "Adds"）。
  - 限制在 50 个字符以内。
  - 首字母大写，末尾**不加句号**。
- **正文 (Body)**:
  - 如果改动逻辑复杂，在标题下空一行，分条说明。
  - 解释 **“为什么”** 改动以及改动了 **“什么”**，不要解释“怎么改的”。
  - 每行不超过 72 个字符。

## 3. 输出示例

feat(ui): implement smooth scrolling for driver list

- Use LazyColumn with explicit keys to optimize recomposition.
- Add fading edge effect to the top of the list.

If applied, this commit will improve the scrolling experience on low-end devices.