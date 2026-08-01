import { Dialog, showMessage } from "siyuan";
import { compareClozeAnswer, parseClozeMarkdown, type ClozeBlank, type ClozeCompareResult, type ClozeSegment } from "../core/cloze";

export function openClozeDialog(input: {
  docTitle: string;
  markdown: string;
  onFinish?(): Promise<void>;
}): void {
  const cloze = parseClozeMarkdown(input.markdown);
  if (cloze.blanks.length === 0) {
    showMessage("没有找到高亮内容，先在文档中高亮重点后再检验。", 3000);
    return;
  }

  const dialog = new Dialog({
    title: "挖空检验",
    content: buildClozeHtml(input.docTitle, cloze.segments, cloze.blanks),
    width: "860px",
  });
  dialog.element.classList.add("siyuan-review-cloze-dialog");

  const root = dialog.element.querySelector<HTMLElement>(".siyuan-review-cloze");
  if (!root) {
    return;
  }

  const state = {
    showAnswers: false,
    answers: new Map<string, string>(),
    results: new Map<string, ClozeCompareResult>(),
    revealedBlankIds: new Set<string>(),
  };

  root.querySelectorAll<HTMLButtonElement>("[data-cloze-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const blankId = button.dataset.clozeId;
      const blank = cloze.blanks.find((item) => item.id === blankId);
      if (blank) {
        openBlankPopover(root, button, blank, state);
      }
    });
  });

  root.querySelector<HTMLButtonElement>('[data-action="toggle-answers"]')?.addEventListener("click", (event) => {
    state.showAnswers = !state.showAnswers;
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = state.showAnswers ? "隐藏答案" : "显示答案";
    root.querySelectorAll<HTMLButtonElement>("[data-cloze-id]").forEach((blankButton) => {
      const blank = cloze.blanks.find((item) => item.id === blankButton.dataset.clozeId);
      if (!blank) {
        return;
      }

      updateBlankButton(blankButton, blank, state);
    });
  });

  root.querySelector<HTMLButtonElement>('[data-action="finish-cloze"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled) {
      return;
    }

    button.disabled = true;
    button.textContent = "保存中...";
    void (async () => {
      try {
        await input.onFinish?.();
        dialog.destroy();
        showMessage("已完成本次检验。", 2000);
      } catch (error) {
        console.error("[siyuan-review] failed to save cloze check", error);
        button.disabled = false;
        button.textContent = "完成检验";
        showMessage("保存检验次数失败。", 3000, "error");
      }
    })();
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".siyuan-review-cloze-popover") && !target?.closest("[data-cloze-id]")) {
      closePopover(root);
    }
  });
}

function buildClozeHtml(title: string, segments: ClozeSegment[], blanks: ClozeBlank[]): string {
  return `
<div class="siyuan-review-cloze">
  <header class="siyuan-review-cloze__head">
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p>全文模式，点击空白处填写后比较。</p>
    </div>
    <span>${blanks.length} 个挖空</span>
  </header>
  <div class="siyuan-review-cloze__body">
    <article class="siyuan-review-cloze-article">
      ${renderArticle(segments)}
    </article>
  </div>
  <footer class="siyuan-review-cloze__footer">
    <span>答对后会在原文中显示答案；没答对时保留空白，继续修改后再比较。</span>
    <div>
      <button class="b3-button b3-button--outline" type="button" data-action="toggle-answers">显示答案</button>
      <button class="b3-button" type="button" data-action="finish-cloze">完成检验</button>
    </div>
  </footer>
</div>`;
}

function openBlankPopover(
  root: HTMLElement,
  button: HTMLButtonElement,
  blank: ClozeBlank,
  state: {
    showAnswers: boolean;
    answers: Map<string, string>;
    results: Map<string, ClozeCompareResult>;
    revealedBlankIds: Set<string>;
  },
): void {
  closePopover(root);

  const popover = document.createElement("div");
  popover.className = "siyuan-review-cloze-popover";
  popover.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  root.appendChild(popover);

  const renderPopover = (selectText = false) => {
    popover.innerHTML = buildPopoverHtml(blank, state.answers.get(blank.id) ?? "", state.results.get(blank.id));
    placePopover(root, button, popover);
    const nextInput = popover.querySelector<HTMLInputElement>("input");
    nextInput?.focus();
    if (selectText) {
      nextInput?.select();
    } else {
      nextInput?.setSelectionRange(nextInput.value.length, nextInput.value.length);
    }
    popover.querySelector<HTMLButtonElement>('[data-action="compare-cloze"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextAnswer = nextInput?.value ?? "";
      const nextResult = compareClozeAnswer(nextAnswer, blank.answer);
      state.answers.set(blank.id, nextAnswer);
      state.results.set(blank.id, nextResult);
      if (nextResult === "correct") {
        state.revealedBlankIds.add(blank.id);
      }
      updateBlankButton(button, blank, state);
      renderPopover();
    });
  };

  renderPopover(true);
}

function buildPopoverHtml(blank: ClozeBlank, value: string, result?: ClozeCompareResult): string {
  return `
<label>
  <span>填写挖空内容</span>
  <input class="b3-text-field" value="${escapeHtml(value)}">
</label>
<div class="siyuan-review-cloze-popover__actions">
  <button class="b3-button" type="button" data-action="compare-cloze">比较</button>
  ${result ? `<strong class="siyuan-review-cloze-result siyuan-review-cloze-result--${result}">${resultLabel(result)}</strong>` : ""}
</div>
${result ? `<p>${resultHint(result, blank.answer)}</p>` : ""}`;
}

function updateBlankButton(
  button: HTMLButtonElement,
  blank: ClozeBlank,
  state: {
    showAnswers: boolean;
    revealedBlankIds: Set<string>;
  },
): void {
  const revealed = state.showAnswers || state.revealedBlankIds.has(blank.id);
  button.classList.toggle("siyuan-review-cloze-blank--revealed", revealed);
  button.classList.toggle("siyuan-review-cloze-blank--correct", state.revealedBlankIds.has(blank.id));
  button.textContent = revealed ? blank.answer : "____";
}

function placePopover(root: HTMLElement, button: HTMLElement, popover: HTMLElement): void {
  const rootRect = root.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const preferredTop = buttonRect.bottom - rootRect.top + 8;
  const availableBottom = root.clientHeight - 12;
  const fallbackTop = buttonRect.top - rootRect.top - popover.offsetHeight - 8;
  const left = Math.min(
    Math.max(buttonRect.left - rootRect.left, 12),
    Math.max(root.clientWidth - popover.offsetWidth - 12, 12),
  );
  const top = preferredTop + popover.offsetHeight > availableBottom ? Math.max(fallbackTop, 12) : preferredTop;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function closePopover(root: HTMLElement): void {
  root.querySelector(".siyuan-review-cloze-popover")?.remove();
}

function renderArticle(segments: ClozeSegment[]): string {
  const lines = splitSegmentsIntoLines(segments);
  const html: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  lines.forEach((line) => {
    const plain = line.map((segment) => (segment.type === "text" ? segment.text : segment.answer)).join("");
    if (!plain.trim()) {
      flushList();
      return;
    }

    const heading = plain.match(/^\s*(#{1,4})\s+/);
    if (heading) {
      flushList();
      html.push(`<h${heading[1].length}>${renderInlineSegments(removeLeadingMarkdown(line, heading[0].length))}</h${heading[1].length}>`);
      return;
    }

    const unorderedList = plain.match(/^\s*[-*]\s+/);
    const orderedList = plain.match(/^\s*\d+\.\s+/);
    if (unorderedList || orderedList) {
      const prefixLength = (unorderedList ?? orderedList)?.[0].length ?? 0;
      listItems.push(`<li>${renderInlineSegments(removeLeadingMarkdown(line, prefixLength))}</li>`);
      return;
    }

    flushList();
    html.push(`<p>${renderInlineSegments(line)}</p>`);
  });
  flushList();

  return html.join("");
}

function splitSegmentsIntoLines(segments: ClozeSegment[]): ClozeSegment[][] {
  const lines: ClozeSegment[][] = [[]];

  segments.forEach((segment) => {
    if (segment.type === "blank") {
      lines.at(-1)?.push(segment);
      return;
    }

    const parts = segment.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (part) {
        lines.at(-1)?.push({ type: "text", text: part });
      }
    });
  });

  return lines;
}

function removeLeadingMarkdown(line: ClozeSegment[], length: number): ClozeSegment[] {
  let remaining = length;
  return line
    .map((segment) => {
      if (remaining === 0 || segment.type === "blank") {
        return segment;
      }

      if (segment.text.length <= remaining) {
        remaining -= segment.text.length;
        return { type: "text" as const, text: "" };
      }

      const text = segment.text.slice(remaining);
      remaining = 0;
      return { type: "text" as const, text };
    })
    .filter((segment) => segment.type === "blank" || segment.text.length > 0);
}

function renderInlineSegments(segments: ClozeSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.type === "blank") {
        return `<button class="siyuan-review-cloze-blank" type="button" data-cloze-id="${escapeHtml(segment.id)}">____</button>`;
      }

      return escapeHtml(segment.text);
    })
    .join("");
}

function resultLabel(result: ClozeCompareResult): string {
  const labels: Record<ClozeCompareResult, string> = {
    correct: "正确",
    close: "接近",
    different: "不一致",
  };
  return labels[result];
}

function resultHint(result: ClozeCompareResult, answer: string): string {
  if (result === "correct") {
    return `挖空处已显示答案：${escapeHtml(answer)}`;
  }

  if (result === "close") {
    return "答案接近，可以继续调整后再比较。";
  }

  return "还不一致，修改后再试一次。";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
