# VocabClip

> Clip English words from the web, save them to Obsidian, and review them with spaced repetition.

VocabClip 是一个面向个人英语学习的 Microsoft Edge 扩展。它可以将网页中选中的英语单词或短语交给 DeepSeek 整理，预览确认后写入本地 Obsidian Markdown，并按照固定的艾宾浩斯间隔安排复习。

## 功能

- 网页划词后通过右键菜单创建学习卡片
- DeepSeek 生成音标、词性、中文释义、词形、辅助记忆和例句
- 写入前提供预览和编辑，AI 失败时也可手工录入
- 使用本地 Markdown 作为唯一内容来源
- 自动维护“待学习 / 复习中 / 已掌握”三个分区
- 按 1、2、4、7、15、30 天安排固定间隔复习
- 支持配置学习星期和每日提醒时间
- 重复单词追加新语境，不重复创建卡片
- 写入前自动备份，并通过临时文件原子替换

## 工作方式

```text
网页划词
   ↓
DeepSeek 生成卡片
   ↓
预览并编辑
   ↓
Edge Native Messaging
   ↓
本地 Obsidian Markdown
   ↓
到期提醒与卡片复习
```

浏览器扩展不会直接获得任意文件系统权限。VocabClip 使用一个轻量 Node.js Native Messaging Host，仅在收到扩展请求时读取或更新用户配置的 Markdown 文件。

## 环境要求

- macOS
- Microsoft Edge 120 或更高版本
- Node.js 20 或更高版本
- 一个包含指定分区的本地 Markdown 单词本
- DeepSeek API Key

## 安装

克隆仓库并进入项目目录：

```bash
git clone https://github.com/JasonLian/VocabClip.git
cd VocabClip
```

运行轻量测试、生成扩展目录并安装本地桥接程序：

```bash
npm test
npm run build
npm run install:host
```

随后在 Edge 中完成侧载：

1. 打开 `edge://extensions`
2. 开启“开发人员模式”
3. 点击“加载解压缩的扩展”
4. 选择项目中的 `dist/extension`
5. 确认扩展 ID 为 `ifemhcegmfgmlebffkhlecbbibkglppb`

需要移除本地桥接程序时运行：

```bash
npm run uninstall:host
```

## 配置

打开 VocabClip 的扩展选项，配置以下内容：

- Obsidian 单词本的绝对路径
- DeepSeek API Key
- DeepSeek 模型，默认 `deepseek-v4-flash`
- 学习星期
- 每日提醒时间

单词本路径示例：

```text
/Users/yourname/Documents/Obsidian/Study/English/英语单词本.md
```

点击“测试文件连接”和“测试 API”确认配置可用，再保存设置。

## 单词本格式

文件必须包含以下二级标题：

```markdown
## 待学习

## 复习中

## 已掌握
```

VocabClip 生成的词条示例：

```markdown
- **artifact** /ˈɑːrtɪfækt/ n. 技术流程产生的文件、模型或报告等产物
  - 词形：artifacts
  - 辅助记忆：联想 art + fact，表示经过流程做出来的东西
  - 原始语境：The pipeline stores build artifacts.
  - 例句：The pipeline stores build artifacts after every release.
  - 来源：[Example](https://example.com)
  - 加入：2026-08-04
  - 学习 ID：...
  - 复习阶段：0/6
  - 下次复习：2026-08-04
  - 复习记录：
```

已有但缺少复习字段的卡片会被视为今日到期；字段会在首次复习后补齐，不会在安装阶段批量改写。

## 复习规则

- `认识`：推进一个阶段
- `模糊`：保持当前阶段，在下一个学习日再次复习
- `忘记`：重置复习阶段，在下一个学习日再次复习
- 完成第 30 天复习后，卡片移动到“已掌握”
- 到期日落在未启用的星期时，顺延到下一个学习日

Edge 关闭或电脑休眠时，扩展不会唤醒系统；下次启动 Edge 后会补充检查到期内容。

## 隐私与安全

- API Key 只保存在当前 Edge 配置的 `chrome.storage.local`
- API Key 不会写入项目、日志或 Obsidian 文件
- 只有选中文本、附近语境和网页标题会发送给 DeepSeek
- Native Messaging Host 只允许固定的 VocabClip 扩展 ID 调用
- 自动测试只操作系统临时目录，不会修改真实单词本
- 最近 20 个写入前备份保存在用户应用支持目录

## 开发

项目没有第三方运行依赖，主要目录如下：

```text
extension/     Edge Manifest V3 扩展
native-host/   本地 Markdown 读写桥接程序
scripts/       构建和安装脚本
tests/         Node.js 内置测试
```

常用命令：

```bash
npm test
npm run build
```
