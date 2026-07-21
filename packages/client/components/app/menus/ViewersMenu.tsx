import { For } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { styled } from "styled-system/jsx";

import { useUsers } from "@revolt/markdown/users";
import { useModals } from "@revolt/modal";
import { Avatar, Text } from "@revolt/ui";

import {
  ContextMenu,
  ContextMenuDivider,
  ContextMenuItem,
} from "./ContextMenu";

const MenuLabel = styled("div", {
  base: {
    padding: "var(--gap-xs) var(--gap-lg)",
  },
});

/**
 * List of users currently watching a screen share, shown like Discord's
 * viewer count popover - click a viewer to open their profile.
 */
export function ViewersMenu(props: { userIds: string[] }) {
  const { openModal } = useModals();
  const watchers = useUsers(() => props.userIds, true);

  return (
    <ContextMenu class="ViewersMenu">
      <MenuLabel>
        <Text class="label">
          <Trans>Watching now</Trans>
        </Text>
      </MenuLabel>
      <ContextMenuDivider />
      <For each={watchers()}>
        {(watcher) => (
          <ContextMenuItem
            button
            onClick={() =>
              watcher?.user &&
              openModal({ type: "user_profile", user: watcher.user })
            }
          >
            <Avatar
              src={watcher?.avatar}
              fallback={watcher?.username ?? "?"}
              size={20}
              interactive={false}
            />
            <span>{watcher?.username}</span>
          </ContextMenuItem>
        )}
      </For>
    </ContextMenu>
  );
}
