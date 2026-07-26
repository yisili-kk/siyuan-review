import type { ReviewDocState } from "../types/review";

export function buildQuestionPrompt(doc: ReviewDocState, content: string): string {
  return [
    "你是一个知识管理回顾助手。",
    "请基于下面的思源文档，生成 5 个中文回顾问题。",
    "",
    "要求：",
    "- 每个问题不超过 50 个字。",
    "- 每个问题只聚焦一个思考点。",
    "- 问题要帮助用户决定是否补充、修正、关联、重构或应用这篇文档。",
    "- 优先围绕文档已有内容提问，不要编造文档中没有的信息。",
    "- 不要输出总结，不要替用户回答，只输出问题列表。",
    "",
    "问题类型建议覆盖：",
    "1. 当前最有价值的信息",
    "2. 需要补充或澄清的地方",
    "3. 可以关联的其他知识",
    "4. 是否需要调整结构或标题",
    "5. 下一步可以采取的具体动作",
    "",
    `标题：${doc.title}`,
    `路径：${doc.path}`,
    "",
    "文档内容：",
    content,
  ].join("\n");
}
