import type { ReviewDocState } from "../types/review";

export function buildQuestionPrompt(doc: ReviewDocState, content: string): string {
  return [
    "你是一个知识管理回顾助手。",
    "请基于下面的思源文档，生成 5 个中文回顾问题。",
    "问题应覆盖：深度追问、连接其他知识、维护建议、后续行动。",
    "不要输出总结，不要替用户回答，只输出问题列表。",
    "",
    `标题：${doc.title}`,
    `路径：${doc.path}`,
    "",
    "文档内容：",
    content,
  ].join("\n");
}
