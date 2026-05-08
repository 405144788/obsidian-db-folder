import React, { useEffect } from "react";
import { TableActionProps } from "cdm/MenuBarModel";
import { EMITTERS_GROUPS, EMITTERS_SHORTCUT } from "helpers/Constants";

export default function ShortcutsAction(actionProps: TableActionProps) {
  const { table } = actionProps;
  const { view } = table.options.meta;

  /**
   * Keyboard shortcuts — no pagination, use scroll-based navigation
   */
  useEffect(() => {
    const scrollBy = (delta: number) => {
      const container = view.containerEl.querySelector(".scroll-horizontal") as HTMLElement | null;
      if (container) {
        container.scrollBy({ top: delta, behavior: "smooth" });
      }
    };

    const goNextPage = (e: string) => {
      if (e === EMITTERS_SHORTCUT.GO_NEXT_PAGE) {
        scrollBy(window.innerHeight * 0.8);
      }
    };
    view.emitter.on(EMITTERS_GROUPS.SHORTCUT, goNextPage);

    const goPreviousPage = (e: string) => {
      if (e === EMITTERS_SHORTCUT.GO_PREVIOUS_PAGE) {
        scrollBy(-window.innerHeight * 0.8);
      }
    };
    view.emitter.on(EMITTERS_GROUPS.SHORTCUT, goPreviousPage);
    return () => {
      view.emitter.off(EMITTERS_GROUPS.SHORTCUT, goNextPage);
      view.emitter.off(EMITTERS_GROUPS.SHORTCUT, goPreviousPage);
    };
  }, []);
  return <></>;
}
