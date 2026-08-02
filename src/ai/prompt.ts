import type { ReviewItem } from "../types/review";

export function buildQuestionPrompt(item: ReviewItem, content: string): string {
  const typeText = item.itemType === "document" ? "文档" : "片段";
  return [
    "你是一个知识管理回顾助手。",
    `请基于下面的思源${typeText}，生成 5 个中文回顾问题。`,
    "",
    "要求：",
    "- 每个问题不超过 50 个字。",
    "- 每个问题只聚焦一个思考点。",
    `- 问题要帮助用户决定是否补充、修正、关联、重构或应用这个${typeText}。`,
    `- 优先围绕${typeText}已有内容提问，不要编造内容中没有的信息。`,
    item.itemType === "block" ? "- 当前对象只是一个片段，不要把问题扩展成整篇文档级回顾。" : "",
    "- 不要输出总结，不要替用户回答，只输出问题列表。",
    "",
    "问题类型建议覆盖：",
    "1. 当前最有价值的信息",
    "2. 需要补充或澄清的地方",
    "3. 可以关联的其他知识",
    "4. 是否需要调整结构或标题",
    "5. 下一步可以采取的具体动作",
    "",
    `对象类型：${typeText}`,
    `标题：${item.title}`,
    `所属文档：${item.sourceTitle}`,
    `路径：${item.path}`,
    "",
    `${typeText}内容：`,
    content,
  ].filter(Boolean).join("\n");
}
