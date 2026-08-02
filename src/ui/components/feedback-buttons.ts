export function renderFeedbackButtons(options: { disabled?: boolean; processingOpen?: boolean } = {}): string {
  const disabledAttr = options.disabled ? "disabled" : "";
  const processingClass = options.processingOpen ? " siyuan-review-feedback__button--active" : "";
  const primaryText = options.disabled ? "记录中..." : "完成回顾";
  const needsActionText = options.disabled ? "记录中..." : "需要处理";
  const skippedText = options.disabled ? "记录中..." : "暂时跳过";

  return `
<div class="siyuan-review-feedback__group">
  <button class="b3-button siyuan-review-feedback__button" data-feedback="normal" ${disabledAttr}>${primaryText}</button>
  <button class="b3-button b3-button--outline siyuan-review-feedback__button${processingClass}" data-action="needs-processing-feedback" ${disabledAttr}>${needsActionText}</button>
  <button class="b3-button b3-button--outline siyuan-review-feedback__button siyuan-review-feedback__button--muted" data-feedback="skipped" ${disabledAttr}>${skippedText}</button>
</div>`;
}
