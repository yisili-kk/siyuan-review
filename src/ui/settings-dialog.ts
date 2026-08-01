import { Dialog, showMessage } from "siyuan";
import type { NotebookInfo } from "../types/siyuan";
import type { ReviewSettings } from "../types/settings";

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
        <h3>基础规则</h3>
        <p>控制每天生成多少回顾文档，以及用哪个标签识别候选文档。</p>
      </div>
      <div class="siyuan-review-setting-fields siyuan-review-setting-fields--two">
        ${textInput("dailyLimit", "每日回顾数量", "每天最多推送的文档数量。", String(settings.dailyLimit), "number", "1", "50")}
        ${textInput("reviewTag", "识别标签", "文档中包含这个标签时进入候选池。", settings.reviewTag)}
      </div>
    </section>

    <section class="siyuan-review-setting-section">
      <div class="siyuan-review-setting-section__head">
        <h3>反馈间隔</h3>
        <p>提交反馈后，插件会按下面的天数安排下一次回顾。</p>
      </div>
      <div class="siyuan-review-interval-grid">
        ${numberInput("valuable", "已补充想法", settings.intervals.valuable)}
        ${numberInput("normal", "已完成阅读", settings.intervals.normal)}
        ${numberInput("needsSupplement", "需要补充", settings.intervals.needsSupplement)}
        ${numberInput("needsRefactor", "需要重构", settings.intervals.needsRefactor)}
        ${numberInput("skipped", "暂时跳过", settings.intervals.skipped)}
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
    dailyLimit: readNumber(root, "dailyLimit", current.dailyLimit, 1, 50),
    reviewTag: readString(root, "reviewTag", current.reviewTag),
    intervals: {
      valuable: readNumber(root, "valuable", current.intervals.valuable, 1, 365),
      normal: readNumber(root, "normal", current.intervals.normal, 1, 365),
      needsSupplement: readNumber(root, "needsSupplement", current.intervals.needsSupplement, 1, 365),
      needsRefactor: readNumber(root, "needsRefactor", current.intervals.needsRefactor, 1, 365),
      skipped: readNumber(root, "skipped", current.intervals.skipped, 1, 365),
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

function numberInput(name: string, label: string, value: number): string {
  return `
<label class="siyuan-review-interval-field">
  <span>${label}</span>
  <span class="siyuan-review-input-with-unit">
    <input class="b3-text-field" name="${name}" type="number" min="1" max="365" value="${value}">
    <em>天</em>
  </span>
</label>`;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
