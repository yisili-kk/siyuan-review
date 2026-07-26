import { Dialog, showMessage } from "siyuan";
import type { NotebookInfo } from "../types/siyuan";
import type { ReviewSettings } from "../types/settings";

export function openSettingsDialog(input: {
  settings: ReviewSettings;
  notebooks: NotebookInfo[];
  onSave(settings: ReviewSettings): Promise<void>;
}): void {
  const dialog = new Dialog({
    title: "文档回顾设置",
    width: "960px",
    content: buildSettingsHtml(input.settings, input.notebooks),
  });
  dialog.element.classList.add("siyuan-review-settings-dialog");

  const root = dialog.element.querySelector<HTMLElement>(".siyuan-review-settings");
  if (!root) {
    return;
  }

  root.querySelector<HTMLButtonElement>('[data-action="save"]')?.addEventListener("click", () => {
    void (async () => {
      const nextSettings = readSettingsForm(root, input.settings);
      await input.onSave(nextSettings);
      showMessage("文档回顾设置已保存。", 2000);
      dialog.destroy();
    })();
  });

  root.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => {
    dialog.destroy();
  });
}

function buildSettingsHtml(settings: ReviewSettings, notebooks: NotebookInfo[]): string {
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
<div class="siyuan-review-settings">
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

  <footer class="siyuan-review-setting-actions">
    <button class="b3-button b3-button--outline" data-action="cancel">取消</button>
    <button class="b3-button" data-action="save">保存</button>
  </footer>
</div>`;
}

function readSettingsForm(root: HTMLElement, current: ReviewSettings): ReviewSettings {
  const enabledNotebooks = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="enabledNotebooks"]:checked')).map(
    (input) => input.value,
  );

  return {
    ...current,
    enabledNotebooks,
    dailyLimit: readNumber(root, "dailyLimit", current.dailyLimit),
    reviewTag: readString(root, "reviewTag", current.reviewTag),
    intervals: {
      valuable: readNumber(root, "valuable", current.intervals.valuable),
      normal: readNumber(root, "normal", current.intervals.normal),
      needsSupplement: readNumber(root, "needsSupplement", current.intervals.needsSupplement),
      needsRefactor: readNumber(root, "needsRefactor", current.intervals.needsRefactor),
      skipped: readNumber(root, "skipped", current.intervals.skipped),
    },
    ai: {
      ...current.ai,
      enabled: Boolean(root.querySelector<HTMLInputElement>('input[name="aiEnabled"]')?.checked),
      baseUrl: readOptionalString(root, "aiBaseUrl"),
      apiKey: readOptionalString(root, "aiApiKey"),
      model: readOptionalString(root, "aiModel"),
      maxChars: readNumber(root, "aiMaxChars", current.ai.maxChars),
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

function readNumber(root: HTMLElement, name: string, fallback: number): number {
  const raw = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
