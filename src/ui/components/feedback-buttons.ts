export function renderFeedbackButtons(options: { disabled?: boolean } = {}): string {
  return [
    ["valuable", "已补充想法"],
    ["normal", "已完成阅读"],
    ["needsSupplement", "需要补充"],
    ["needsRefactor", "需要重构"],
    ["skipped", "暂时跳过"],
  ]
    .map(
      ([value, label]) =>
        `<button class="b3-button b3-button--outline siyuan-review-feedback__button" data-feedback="${value}" ${options.disabled ? "disabled" : ""}>${options.disabled ? "记录中..." : label}</button>`,
    )
    .join("");
}
