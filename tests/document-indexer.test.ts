import { beforeEach, describe, expect, it, vi } from "vitest";
import { scanReviewCandidates } from "../src/core/document-indexer";
import { getBlockMarkdown, queryReviewBlocksByTag } from "../src/siyuan/document";
import { DEFAULT_SETTINGS } from "../src/constants";

vi.mock("../src/siyuan/document", () => ({
  getBlockMarkdown: vi.fn(),
  queryReviewBlocksByTag: vi.fn(),
}));

describe("document-indexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates document and block review items from tagged blocks", async () => {
    vi.mocked(getBlockMarkdown).mockResolvedValue("");
    vi.mocked(queryReviewBlocksByTag).mockResolvedValue([
      {
        id: "doc-a",
        docId: "doc-a",
        notebookId: "notebook",
        blockType: "d",
        content: "Doc A #review#",
        docTitle: "Doc A",
        path: "/Doc A",
      },
      {
        id: "block-a",
        docId: "daily-doc",
        notebookId: "notebook",
        blockType: "p",
        content: "碎片想法 #review#",
        docTitle: "2026-08-02",
        path: "/Journal/2026-08-02",
      },
    ]);

    const candidates = await scanReviewCandidates({
      ...DEFAULT_SETTINGS,
      enabledNotebooks: ["notebook"],
      reviewGroups: [reviewGroup("default", "普通笔记", "review", 5)],
    });

    expect(candidates).toMatchObject([
      {
        itemId: "doc-a",
        itemType: "document",
        docId: "doc-a",
        title: "Doc A",
        sourceTitle: "Doc A",
        groupId: "default",
        groupName: "普通笔记",
        groupTag: "review",
      },
      {
        itemId: "block-a",
        itemType: "block",
        docId: "daily-doc",
        title: "碎片想法",
        sourceTitle: "2026-08-02",
        groupId: "default",
        groupName: "普通笔记",
        groupTag: "review",
      },
    ]);
  });

  it("uses block markdown as preview fallback when tagged block content is empty", async () => {
    vi.mocked(queryReviewBlocksByTag).mockResolvedValue([
      {
        id: "block-empty",
        docId: "daily-doc",
        notebookId: "notebook",
        blockType: "p",
        content: "#review#",
        docTitle: "打开心智 - 李睿秋",
        path: "/打开心智 - 李睿秋",
      },
    ]);
    vi.mocked(getBlockMarkdown).mockResolvedValue('{: id="block-empty" updated="20260802"}\n真正需要回顾的片段内容 #review#');

    const candidates = await scanReviewCandidates({
      ...DEFAULT_SETTINGS,
      enabledNotebooks: ["notebook"],
      reviewGroups: [reviewGroup("default", "普通笔记", "review", 5)],
    });

    expect(candidates[0]).toMatchObject({
      itemId: "block-empty",
      itemType: "block",
      title: "真正需要回顾的片段内容",
      sourceTitle: "打开心智 - 李睿秋",
    });
  });

  it("keeps Chinese content when the review tag touches the text", async () => {
    vi.mocked(getBlockMarkdown).mockResolvedValue("");
    vi.mocked(queryReviewBlocksByTag).mockResolvedValue([
      {
        id: "block-tag-touching-text",
        docId: "doc-book",
        notebookId: "notebook",
        blockType: "p",
        content: "#review#在远古时代，我们的祖先会遭遇到自然灾害。",
        docTitle: "打开心智 - 李睿秋",
        path: "/打开心智 - 李睿秋",
      },
    ]);

    const candidates = await scanReviewCandidates({
      ...DEFAULT_SETTINGS,
      enabledNotebooks: ["notebook"],
      reviewGroups: [reviewGroup("default", "普通笔记", "review", 5)],
    });

    expect(candidates[0]?.title).toBe("在远古时代，我们的祖先会遭遇到自然灾害。");
  });

  it("uses the first line as the title for tagged list items", async () => {
    vi.mocked(queryReviewBlocksByTag).mockResolvedValue([
      {
        id: "list-item",
        docId: "doc-book",
        notebookId: "notebook",
        blockType: "i",
        content: "#review#可用性标准：尼尔森十大可用性原则 From Jakob Nielsen 可见原则：保证界面的内容可见。",
        markdown:
          '- {: id="list-item" updated="20260802"}#review#可用性标准：尼尔森十大可用性原则 From Jakob Nielsen\n\n  - 可见原则：保证界面的内容可见。',
        docTitle: "《从点子到产品》",
        path: "/《从点子到产品》",
      },
    ]);
    vi.mocked(getBlockMarkdown).mockResolvedValue("");

    const candidates = await scanReviewCandidates({
      ...DEFAULT_SETTINGS,
      enabledNotebooks: ["notebook"],
      reviewGroups: [reviewGroup("default", "普通笔记", "review", 5)],
    });

    expect(candidates[0]?.title).toBe("可用性标准：尼尔森十大可用性原则 From Jakob Nielsen");
    expect(getBlockMarkdown).not.toHaveBeenCalled();
  });

  it("uses the most specific matching group when one block has multiple review tags", async () => {
    vi.mocked(queryReviewBlocksByTag).mockResolvedValue([
      {
        id: "multi-tag",
        docId: "doc-book",
        notebookId: "notebook",
        blockType: "p",
        content: "#review# #review/language# take off",
        docTitle: "English",
        path: "/English",
      },
    ]);
    vi.mocked(getBlockMarkdown).mockResolvedValue("");

    const candidates = await scanReviewCandidates({
      ...DEFAULT_SETTINGS,
      enabledNotebooks: ["notebook"],
      reviewGroups: [
        reviewGroup("default", "普通笔记", "review", 2),
        reviewGroup("language", "语言点", "review/language", 3),
      ],
    });

    expect(queryReviewBlocksByTag).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      itemId: "multi-tag",
      groupId: "language",
      groupName: "语言点",
      groupTag: "review/language",
    });
  });
});

function reviewGroup(id: string, name: string, tag: string, dailyLimit: number) {
  return {
    id,
    name,
    tag,
    dailyLimit,
    templateQuestions: [`${name}问题`],
    enabled: true,
  };
}
