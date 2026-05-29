/**
 * branchUtils.ts
 *
 * Helper utilities for the immutable versioned-message system.
 *
 * Terminology
 * ───────────
 * branchId  : A UUID string shared by all "sibling" assistant messages that
 *             were generated in response to the same parent user message.
 *             When a user retries, a new assistant message is created with the
 *             same branchId.  When a user edits, both a new user message AND a
 *             new assistant message are created (the user message also carries a
 *             branchId to group edit siblings).
 *
 * version   : 1-based counter within a branchId group.
 *             version 1 = original generation
 *             version 2 = first retry (or first edit)
 *             …
 *
 * isActive  : Boolean flag on each message.  Exactly one sibling in a
 *             branchId group should have isActive=true at any time.
 *
 * parentId  : On an assistant message, points to the user message that
 *             triggered it.  Kept consistent across retries (same parentId).
 *
 * retryOf   : On a retry assistant message, points to the *previous* assistant
 *             message in the same branchId group.
 *
 * editedFrom: On a new user message created by an edit, points to the
 *             original user message that was edited.
 */

import { randomUUID } from "crypto";
import type { RawMessage } from "../types/branch.types";

/** Generate a new unique branchId. */
export const newBranchId = (): string => randomUUID();

/**
 * Resolve the active branch path through a raw message array.
 *
 * Starting from the most-recently active assistant message, walks back
 * through parentId links to reconstruct the linear thread that the user
 * should see.  Messages that are part of an inactive sibling group are
 * hidden.
 *
 * Returns messages in chronological order (same as input).
 */
function hasNoParent(parentId: any): boolean {
  if (!parentId) return true;
  const pStr = String(parentId).trim();
  return pStr === "" || pStr === "null" || pStr === "undefined";
}

export function resolveActiveBranch(messages: RawMessage[]): RawMessage[] {
  if (!messages.length) return [];

  // Normalize/infer parentId links for linear & legacy messages
  const normalized: RawMessage[] = [];
  let prevId: string | null = null;

  for (const m of messages) {
    const currentId = String(m.id || m._id || (m as any)._id || (m as any).requestId || "");
    const parentIdVal = m.parentId;

    const hasExplicitParent =
      parentIdVal &&
      String(parentIdVal).trim() !== "" &&
      String(parentIdVal) !== "null" &&
      String(parentIdVal) !== "undefined";

    let inferredParentId: string | null = null;
    if (hasExplicitParent) {
      inferredParentId = String(parentIdVal);
    } else if (!m.branchId) {
      // Only infer from preceding if this message is not explicitly a branched sibling
      inferredParentId = prevId;
    }

    normalized.push({
      ...m,
      parentId: inferredParentId,
    });
    prevId = currentId;
  }

  // Build mapping of ID -> message
  const byId = new Map<string, RawMessage>();
  for (const m of normalized) {
    const mId = String(m.id || m._id || (m as any)._id || (m as any).requestId || "");
    if (mId) {
      byId.set(mId, m);
    }
  }

  // Group child messages by parentId
  const byParent = new Map<string, RawMessage[]>();
  for (const m of normalized) {
    if (!hasNoParent(m.parentId)) {
      const pId = String(m.parentId);
      const kids = byParent.get(pId) ?? [];
      kids.push(m);
      byParent.set(pId, kids);
    }
  }

  // Sibling selector helper: given a list of siblings, select the active one
  const selectActive = (siblings: RawMessage[]): RawMessage | null => {
    if (!siblings.length) return null;
    
    // 1. Prefer explicitly marked active
    const active = siblings.find((s) => s.isActive === true);
    if (active) return active;
    
    // 2. Prefer NOT marked inactive, and take highest version
    const activeCandidates = siblings.filter((s) => s.isActive !== false);
    if (activeCandidates.length > 0) {
      return activeCandidates.reduce((best, s) =>
        (s.version ?? 1) > (best.version ?? 1) ? s : best,
        activeCandidates[0]
      );
    }
    
    // 3. Fall back to absolute highest version
    return siblings.reduce((best, s) =>
      (s.version ?? 1) > (best.version ?? 1) ? s : best,
      siblings[0]
    );
  };

  // Find root messages (messages whose parentId is not in byId or hasNoParent)
  const roots = normalized.filter((m) => {
    const pId = m.parentId ? String(m.parentId) : "";
    return hasNoParent(m.parentId) || !byId.has(pId);
  });

  // Group root messages by branchId
  const rootGroups = new Map<string, RawMessage[]>();
  const ungroupedRoots: RawMessage[] = [];

  for (const m of roots) {
    if (m.branchId) {
      const g = rootGroups.get(m.branchId) ?? [];
      g.push(m);
      rootGroups.set(m.branchId, g);
    } else {
      ungroupedRoots.push(m);
    }
  }

  const activeIds = new Set<string>();

  // Add ungrouped roots
  for (const r of ungroupedRoots) {
    const rId = String(r.id || r._id || (r as any)._id || (r as any).requestId || "");
    if (rId) {
      activeIds.add(rId);
    }
  }

  // Select active message from each grouped root group
  for (const group of rootGroups.values()) {
    const active = selectActive(group);
    if (active) {
      const activeId = String(active.id || active._id || (active as any)._id || (active as any).requestId || "");
      if (activeId) {
        activeIds.add(activeId);
      }
    }
  }

  // Walk down the tree starting from active roots
  const queue = Array.from(activeIds);
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const parentId = queue[queueIndex++];
    const children = byParent.get(parentId);
    if (!children || !children.length) continue;

    const childGroups = new Map<string, RawMessage[]>();
    const ungroupedChildren: RawMessage[] = [];

    for (const c of children) {
      if (c.branchId) {
        const g = childGroups.get(c.branchId) ?? [];
        g.push(c);
        childGroups.set(c.branchId, g);
      } else {
        ungroupedChildren.push(c);
      }
    }

    // Add ungrouped children
    for (const uc of ungroupedChildren) {
      const ucId = String(uc.id || uc._id || (uc as any)._id || (uc as any).requestId || "");
      if (ucId && !activeIds.has(ucId)) {
        activeIds.add(ucId);
        queue.push(ucId);
      }
    }

    // Resolve grouped children
    for (const group of childGroups.values()) {
      const active = selectActive(group);
      if (active) {
        const activeId = String(active.id || active._id || (active as any)._id || (active as any).requestId || "");
        if (activeId && !activeIds.has(activeId)) {
          activeIds.add(activeId);
          queue.push(activeId);
        }
      }
    }
  }

  // Return messages in original chronological order, filtered to active path
  return messages.filter((m) => {
    const mId = String(m.id || m._id || (m as any)._id || (m as any).requestId || "");
    return activeIds.has(mId);
  });
}

/**
 * Build the full branch tree for a given user message (parentId).
 * Returns all assistant siblings sorted by version.
 */
export function getGenerationsForParent(
  messages: RawMessage[],
  parentId: string,
): RawMessage[] {
  return messages
    .filter(
      (m) =>
        m.role === "assistant" && String(m.parentId) === String(parentId),
    )
    .sort((a, b) => (a.version ?? 1) - (b.version ?? 1));
}

/**
 * Given all messages in a chat, calculate the next version number for a
 * new sibling that will be added to the same branchId group.
 */
export function nextVersionForBranch(
  messages: RawMessage[],
  branchId: string,
): number {
  const siblings = messages.filter((m) => m.branchId === branchId);
  if (!siblings.length) return 1;
  return Math.max(...siblings.map((m) => m.version ?? 1)) + 1;
}

/**
 *  aReturn the next version for NEW branchId based on how many assistant
 * messages already share the same parentId.
 */
export function nextVersionForParent(
  messages: RawMessage[],
  parentId: string,
): { version: number; branchId: string } {
  const siblings = messages.filter(
    (m) =>
      m.role === "assistant" && String(m.parentId) === String(parentId),
  );

  if (!siblings.length) {
    // First generation — assign a new branchId
    return { version: 1, branchId: newBranchId() };
  }

  // All siblings should share the same branchId; grab it from the first one.
  const existingBranchId = siblings[0].branchId ?? newBranchId();
  const maxVersion = Math.max(...siblings.map((m) => m.version ?? 1));
  return { version: maxVersion + 1, branchId: existingBranchId };
}

/**
 * Return the context messages (for the AI prompt) that precede the given
 * assistant message.  Only the active branch path is included so the AI
 * sees the correct conversation history.
 */
export function getContextBeforeMessage(
  messages: RawMessage[],
  assistantMessageId: string,
): RawMessage[] {
  const active = resolveActiveBranch(messages);
  const idx = active.findIndex(
    (m) => String(m._id) === String(assistantMessageId),
  );
  // If the message isn't in the active path yet (it's new), return all active
  return idx === -1 ? active : active.slice(0, idx);
}
