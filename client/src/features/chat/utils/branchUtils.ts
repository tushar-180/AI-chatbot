/**
 * Client-side branch utilities.
 *
 * All messages are immutable — retries and edits are stored as siblings, not
 * overwrites.  Only messages with isActive=true (or the highest version per
 * branchId group) are shown in the main thread.
 */

import type { Message } from "../types/chat.types";

/**
 * Given a flat list of messages (all generations), return only the messages
 * on the active branch path.
 *
 * Rules:
 * - Messages with isActive=false are ALWAYS hidden (regardless of branchId).
 * - For each branchId group, pick the one with isActive=true; if none is
 *   marked active, fall back to the highest version.
 * - Messages without a branchId AND without isActive=false pass through.
 */
function hasNoParent(parentId: any): boolean {
  if (!parentId) return true;
  const pStr = String(parentId).trim();
  return pStr === "" || pStr === "null" || pStr === "undefined";
}

export function resolveActiveBranch(messages: Message[]): Message[] {
  if (!messages.length) return [];

  // Normalize/infer parentId links for linear & legacy messages
  const normalized: Message[] = [];
  let prevId: string | null = null;

  for (const m of messages) {
    const currentId = String(m.id || (m as any)._id || (m as any).requestId || "");
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
  const byId = new Map<string, Message>();
  for (const m of normalized) {
    const mId = String(m.id || (m as any)._id || (m as any).requestId || "");
    if (mId) {
      byId.set(mId, m);
    }
  }

  // Group child messages by parentId
  const byParent = new Map<string, Message[]>();
  for (const m of normalized) {
    if (!hasNoParent(m.parentId)) {
      const pId = String(m.parentId);
      const kids = byParent.get(pId) ?? [];
      kids.push(m);
      byParent.set(pId, kids);
    }
  }

  // Sibling selector helper: given a list of siblings, select the active one
  const selectActive = (siblings: Message[]): Message | null => {
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
  const rootGroups = new Map<string, Message[]>();
  const ungroupedRoots: Message[] = [];

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
    const rId = String(r.id || (r as any)._id || (r as any).requestId || "");
    if (rId) {
      activeIds.add(rId);
    }
  }

  // Select active message from each grouped root group
  for (const group of rootGroups.values()) {
    const active = selectActive(group);
    if (active) {
      const activeId = String(active.id || (active as any)._id || (active as any).requestId || "");
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

    const childGroups = new Map<string, Message[]>();
    const ungroupedChildren: Message[] = [];

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
      const ucId = String(uc.id || (uc as any)._id || (uc as any).requestId || "");
      if (ucId && !activeIds.has(ucId)) {
        activeIds.add(ucId);
        queue.push(ucId);
      }
    }

    // Resolve grouped children
    for (const group of childGroups.values()) {
      const active = selectActive(group);
      if (active) {
        const activeId = String(active.id || (active as any)._id || (active as any).requestId || "");
        if (activeId && !activeIds.has(activeId)) {
          activeIds.add(activeId);
          queue.push(activeId);
        }
      }
    }
  }

  // Return messages in original chronological order, filtered to active path
  return messages.filter((m) => {
    const mId = String(m.id || (m as any)._id || (m as any).requestId || "");
    return activeIds.has(mId);
  });
}

/**
 * Return all sibling generations for a given message (assistant or user),
 * sorted by version ascending.  Used to build the GenerationSwitcher list.
 */
export function getSiblingGenerations(messages: Message[], msg: Message): Message[] {
  // Must have a branchId to have siblings
  if (!msg.branchId) return [msg];

  const siblings = messages.filter(
    (m) => m.role === msg.role && m.branchId === msg.branchId,
  );

  // If only one sibling found, check if the original (no branchId) exists
  // e.g. the very first time we retry, original gets branchId patched in
  return siblings.sort((a, b) => (a.version ?? 1) - (b.version ?? 1));
}
