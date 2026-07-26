export type TopbarController = {
  setBadge(count: number): void;
  dispose(): void;
};

type TopbarOptions = {
  icon: string;
  title: string;
  callback: (event: MouseEvent) => void;
  position?: "left" | "right";
};

export function createTopbarController(plugin: {
  addTopBar?: (options: TopbarOptions) => HTMLElement;
}, onClick?: () => void): TopbarController {
  const button = plugin.addTopBar?.({
    icon: "iconRefresh",
    title: "文档回顾",
    position: "right",
    callback: () => {
      onClick?.();
    },
  });

  if (button) {
    button.dataset.reviewCount = "0";
    button.classList.add("siyuan-review-topbar");
  }

  return {
    setBadge(count: number) {
      if (button) {
        button.dataset.reviewCount = String(count);
        button.setAttribute("aria-label", `文档回顾，今日剩余 ${count} 篇`);
      }
    },
    dispose() {
      button?.remove();
    },
  };
}
