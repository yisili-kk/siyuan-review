import { Dialog, showMessage } from "siyuan";
import type { NotebookInfo } from "../types/siyuan";
import type { ReviewGroupSettings, ReviewSettings } from "../types/settings";

export function openSettingsDialog(input: {
  settings: ReviewSettings;
  notebooks: NotebookInfo[];
  onSave(settings: ReviewSettings): Promise<{ refreshed: boolean }>;
}): void {
  const dialog = new Dialog({
    title: "文档回顾设置",
    width: "960px",
    content: buildSettingsDialogHtml(input.settings, input.notebooks),
  });
  dialog.element.classList.add("siyuan-review-settings-dialog");

  const root = dialog.element.querySelector<HTMLElement>(".siyuan-review-settings");
  if (!root) {
    return;
  }

  const saveButton = root.querySelector<HTMLButtonElement>('[data-action="save"]');
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-action="cancel"]');
  const initialSaveText = saveButton?.textContent ?? "保存";
  let isSaving = false;

  saveButton?.addEventListener("click", () => {
    void (async () => {
      if (isSaving) {
        return;
      }

      isSaving = true;
      saveButton.disabled = true;
      cancelButton?.setAttribute("disabled", "true");
      saveButton.textContent = "保存中...";

      try {
        const nextSettings = readSettingsForm(root, input.settings);
        const result = await input.onSave(nextSettings);
        showMessage(result.refreshed ? "文档回顾设置已保存。" : "设置已保存，回顾列表刷新失败。", 3000, result.refreshed ? "info" : "error");
        dialog.destroy();
      } catch (error) {
        console.error("[siyuan-review] failed to save settings", error);
        showMessage("保存设置失败，请稍后重试。", 3000, "error");
        isSaving = false;
        saveButton.disabled = false;
        cancelButton?.removeAttribute("disabled");
        saveButton.textContent = initialSaveText;
      }
    })();
  });

  cancelButton?.addEventListener("click", () => {
    dialog.destroy();
  });

  bindReviewGroupActions(root);
}

function buildSettingsDialogHtml(settings: ReviewSettings, notebooks: NotebookInfo[]): string {
  return `
<div class="siyuan-review-settings">
  <div class="siyuan-review-settings__body">
    ${renderSettingsSections(settings, notebooks)}
  </div>

  <footer class="siyuan-review-setting-actions">
    <button class="b3-button b3-button--outline" data-action="cancel">取消</button>
    <button class="b3-button" data-action="save">保存</button>
  </footer>
</div>`;
}

function renderSettingsSections(settings: ReviewSettings, notebooks: NotebookInfo[]): string {
  const notebookItems = notebooks
    .filter((notebook) => !notebook.closed)
    .map((notebook) => {
      const checked = settings.enabledNotebooks.includes(notebook.id) ? "checked" : "";
      return `
<label class="siyuan-review-notebook-option">
  <input class="b3-checkbox" type="checkbox" name="enabledNotebooks" value="${escapeHtml(notebook.id)}" ${checked}>
  <span>${escapeHtml(notebook.name)}</span>
</label>`;
    })
    .join("");

  return `
    <section class="siyuan-review-setting-section">
      <div class="siyuan-review-setting-section__head">
        <h3>启用笔记本</h3>
        <p>只从选中的笔记本中扫描带有回顾标签的文档。</p>
      </div>
      <div class="siyuan-review-notebook-list">${notebookItems || '<p class="siyuan-review-setting-empty">没有可用笔记本。</p>'}</div>
    </section>

    <section class="siyuan-review-setting-section">
      <div class="siyuan-review-setting-section__head">
        <h3>回顾分组</h3>
        <p>不同标签进入不同回顾组，每组独立占用每日名额，未用完的名额会自动补齐。</p>
      </div>
      <div class="siyuan-review-group-editor">
        <div class="siyuan-review-group-editor__body" data-role="review-groups">
          ${settings.reviewGroups.map(renderReviewGroupRow).join("")}
        </div>
        <button class="b3-button b3-button--outline" type="button" data-action="add-review-group">新增分组</button>
      </div>
    </section>

    <section class="siyuan-review-setting-section">
      <div class="siyuan-review-setting-section__head">
        <h3>AI 增强</h3>
        <p>开启后，打开文档时会尝试生成更贴合内容的回顾问题。</p>
      </div>
      <label class="siyuan-review-ai-toggle">
        <span>
          <strong>启用 AI 问题生成</strong>
          <em>未启用时仍会显示默认模板问题。</em>
        </span>
        <input class="b3-switch" type="checkbox" name="aiEnabled" ${settings.ai.enabled ? "checked" : ""}>
      </label>
      <div class="siyuan-review-setting-fields">
        ${textInput("aiBaseUrl", "Base URL", "OpenAI 兼容接口地址。", settings.ai.baseUrl)}
        ${textInput("aiApiKey", "API Key", "密钥会保存在本地插件配置中。", settings.ai.apiKey, "password")}
        ${textInput("aiModel", "模型名", "例如 gpt-4.1-mini、deepseek-chat 或本地模型名。", settings.ai.model)}
        ${textInput("aiMaxChars", "最大字符数", "发送给 AI 的文档内容上限。", String(settings.ai.maxChars), "number", "1000", "100000")}
      </div>
    </section>

    <section class="siyuan-review-setting-section">
      <div class="siyuan-review-setting-section__head">
        <h3>数据维护</h3>
        <p>自动清理过旧的每日计划和历史记录，避免本地数据长期无限增长。</p>
      </div>
      <label class="siyuan-review-ai-toggle">
        <span>
          <strong>启用自动维护</strong>
          <em>清理前会保留最近一次备份。</em>
        </span>
        <input class="b3-switch" type="checkbox" name="dataRetentionEnabled" ${settings.dataRetention.enabled ? "checked" : ""}>
      </label>
      <div class="siyuan-review-setting-fields">
        ${textInput("keepDailyPlansDays", "每日计划保留天数", "超过这个天数的旧计划会被清理。", String(settings.dataRetention.keepDailyPlansDays), "number", "30", "3650")}
        ${textInput("keepHistoryLimit", "历史记录保留条数", "超过上限后保留最新记录。", String(settings.dataRetention.keepHistoryLimit), "number", "100", "100000")}
        ${textInput("pruneMissingDocsDays", "失效文档保留天数", "长期不再被计划、历史或候选池引用的文档状态会被清理。", String(settings.dataRetention.pruneMissingDocsDays), "number", "30", "3650")}
      </div>
    </section>
`;
}

function readSettingsForm(root: HTMLElement, current: ReviewSettings): ReviewSettings {
  const enabledNotebooks = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="enabledNotebooks"]:checked')).map(
    (input) => input.value,
  );

  return {
    ...current,
    enabledNotebooks,
    reviewGroups: readReviewGroups(root),
    intervals: {
      ...current.intervals,
    },
    scheduling: {
      ...current.scheduling,
    },
    ai: {
      ...current.ai,
      enabled: Boolean(root.querySelector<HTMLInputElement>('input[name="aiEnabled"]')?.checked),
      baseUrl: readOptionalString(root, "aiBaseUrl"),
      apiKey: readOptionalString(root, "aiApiKey"),
      model: readOptionalString(root, "aiModel"),
      maxChars: readNumber(root, "aiMaxChars", current.ai.maxChars, 1000, 100000),
    },
    dataRetention: {
      ...current.dataRetention,
      enabled: Boolean(root.querySelector<HTMLInputElement>('input[name="dataRetentionEnabled"]')?.checked),
      keepDailyPlansDays: readNumber(root, "keepDailyPlansDays", current.dataRetention.keepDailyPlansDays, 30, 3650),
      keepHistoryLimit: readNumber(root, "keepHistoryLimit", current.dataRetention.keepHistoryLimit, 100, 100000),
      pruneMissingDocsDays: readNumber(root, "pruneMissingDocsDays", current.dataRetention.pruneMissingDocsDays, 30, 3650),
    },
  };
}

function bindReviewGroupActions(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('[data-action="add-review-group"]')?.addEventListener("click", () => {
    const list = root.querySelector<HTMLElement>('[data-role="review-groups"]');
    if (!list) {
      return;
    }

    const count = list.querySelectorAll<HTMLElement>("[data-review-group-row]").length + 1;
    list.insertAdjacentHTML(
      "beforeend",
      renderReviewGroupRow({
        id: `group-${Date.now().toString(36)}-${count}`,
        name: `分组 ${count}`,
        tag: "",
        dailyLimit: 1,
        templateQuestions: [
          "这个内容最值得回顾的部分是什么？",
          "它有没有需要补充或澄清的地方？",
          "下一步可以怎么使用或处理它？",
        ],
        enabled: true,
      }),
    );
  });

  root.querySelector<HTMLElement>('[data-role="review-groups"]')?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const removeGroupButton = target?.closest<HTMLButtonElement>('[data-action="remove-review-group"]');
    if (removeGroupButton) {
      removeGroupButton.closest("[data-review-group-row]")?.remove();
      return;
    }

    const addQuestionButton = target?.closest<HTMLButtonElement>('[data-action="add-template-question"]');
    if (addQuestionButton) {
      const row = addQuestionButton.closest<HTMLElement>("[data-review-group-row]");
      const list = row?.querySelector<HTMLElement>('[data-role="template-questions"]');
      if (!row || !list) {
        return;
      }

      list.insertAdjacentHTML("beforeend", renderTemplateQuestionInput("", list.children.length));
      refreshQuestionIndexes(row);
      refreshQuestionSummary(row);
      return;
    }

    const removeQuestionButton = target?.closest<HTMLButtonElement>('[data-action="remove-template-question"]');
    if (removeQuestionButton) {
      const row = removeQuestionButton.closest<HTMLElement>("[data-review-group-row]");
      removeQuestionButton.closest("[data-template-question-row]")?.remove();
      if (row) {
        refreshQuestionIndexes(row);
        refreshQuestionSummary(row);
      }
      return;
    }

    const editQuestionsButton = target?.closest<HTMLButtonElement>('[data-action="toggle-template-questions"]');
    if (editQuestionsButton) {
      const row = editQuestionsButton.closest<HTMLElement>("[data-review-group-row]");
      const questions = row?.querySelector<HTMLElement>('[data-role="template-question-editor"]');
      if (!questions) {
        return;
      }

      questions.hidden = !questions.hidden;
      editQuestionsButton.textContent = questions.hidden ? "编辑问题" : "收起";
    }
  });

  root.querySelector<HTMLElement>('[data-role="review-groups"]')?.addEventListener("input", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.matches('[data-group-field="templateQuestion"]')) {
      return;
    }

    const row = target.closest<HTMLElement>("[data-review-group-row]");
    if (row) {
      refreshQuestionSummary(row);
    }
  });
}

function renderReviewGroupRow(group: ReviewGroupSettings): string {
  return `
<div class="siyuan-review-group-row" data-review-group-row data-group-id="${escapeHtml(group.id)}">
  <div class="siyuan-review-group-card__top">
    <label class="siyuan-review-group-card__enabled">
      <input class="b3-checkbox" type="checkbox" data-group-field="enabled" ${group.enabled ? "checked" : ""}>
      <span>启用</span>
    </label>
    <input class="b3-text-field siyuan-review-group-card__name" type="text" data-group-field="name" value="${escapeHtml(group.name)}" placeholder="例如：语言点">
    <button class="b3-button b3-button--outline" type="button" data-action="remove-review-group">删除分组</button>
  </div>
  <div class="siyuan-review-group-card__fields">
    <label class="siyuan-review-group-card__field">
      <span>识别标签</span>
      <input class="b3-text-field" type="text" data-group-field="tag" value="${escapeHtml(group.tag)}" placeholder="例如：review/language">
    </label>
    <label class="siyuan-review-group-card__field siyuan-review-group-card__field--limit">
      <span>每日数量</span>
      <input class="b3-text-field" type="number" min="0" max="50" data-group-field="dailyLimit" value="${group.dailyLimit}">
    </label>
  </div>
  <div class="siyuan-review-group-card__question-summary">
    <span data-role="template-question-summary">默认问题 ${group.templateQuestions.length} 个</span>
    <button class="b3-button b3-button--outline" type="button" data-action="toggle-template-questions">编辑问题</button>
  </div>
  <div class="siyuan-review-group-row__questions" data-role="template-question-editor" hidden>
    <div class="siyuan-review-group-row__questions-head">
      <span>默认问题</span>
      <button class="b3-button b3-button--outline" type="button" data-action="add-template-question">添加问题</button>
    </div>
    <div class="siyuan-review-template-question-list" data-role="template-questions">
      ${group.templateQuestions.map(renderTemplateQuestionInput).join("")}
    </div>
  </div>
</div>`;
}

function renderTemplateQuestionInput(question: string, index: number): string {
  return `
<div class="siyuan-review-template-question-row" data-template-question-row>
  <span data-role="template-question-index">${index + 1}</span>
  <input class="b3-text-field" type="text" data-group-field="templateQuestion" value="${escapeHtml(question)}" placeholder="问题输入">
  <button class="b3-button b3-button--outline" type="button" data-action="remove-template-question">删除</button>
</div>`;
}

function readReviewGroups(root: HTMLElement): ReviewGroupSettings[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-review-group-row]"))
    .map((row, index) => {
      const name = row.querySelector<HTMLInputElement>('[data-group-field="name"]')?.value.trim() ?? "";
      const tag = row.querySelector<HTMLInputElement>('[data-group-field="tag"]')?.value.trim() ?? "";
      return {
        id: row.dataset.groupId || `group-${index + 1}`,
        name: name || `分组 ${index + 1}`,
        tag,
        dailyLimit: readGroupNumber(row, "dailyLimit", 1, 0, 50),
        templateQuestions: readGroupQuestions(row),
        enabled: Boolean(row.querySelector<HTMLInputElement>('[data-group-field="enabled"]')?.checked),
      };
    })
    .filter((group) => group.tag);
}

function readGroupQuestions(row: HTMLElement): string[] {
  return Array.from(row.querySelectorAll<HTMLInputElement>('[data-group-field="templateQuestion"]'))
    .map((input) => input.value.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function refreshQuestionIndexes(row: HTMLElement): void {
  row.querySelectorAll<HTMLElement>("[data-template-question-row]").forEach((questionRow, index) => {
    const indexNode = questionRow.querySelector<HTMLElement>('[data-role="template-question-index"]');
    if (indexNode) {
      indexNode.textContent = String(index + 1);
    }
  });
}

function refreshQuestionSummary(row: HTMLElement): void {
  const count = readGroupQuestions(row).length;
  const summary = row.querySelector<HTMLElement>('[data-role="template-question-summary"]');
  if (summary) {
    summary.textContent = `默认问题 ${count} 个`;
  }
}

function textInput(
  name: string,
  label: string,
  description: string,
  value: string,
  type = "text",
  min?: string,
  max?: string,
): string {
  const minAttr = min ? ` min="${min}"` : "";
  const maxAttr = max ? ` max="${max}"` : "";
  return `
<label class="siyuan-review-setting-field">
  <span>
    <strong>${label}</strong>
    <em>${description}</em>
  </span>
  <input class="b3-text-field" name="${name}" type="${type}" value="${escapeHtml(value)}"${minAttr}${maxAttr}>
</label>`;
}

function readString(root: HTMLElement, name: string, fallback: string): string {
  return root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.trim() || fallback;
}

function readOptionalString(root: HTMLElement, name: string): string {
  return root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.trim() ?? "";
}

function readNumber(root: HTMLElement, name: string, fallback: number, min: number, max: number): number {
  const raw = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function readGroupNumber(root: HTMLElement, field: string, fallback: number, min: number, max: number): number {
  const raw = root.querySelector<HTMLInputElement>(`[data-group-field="${field}"]`)?.value;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
