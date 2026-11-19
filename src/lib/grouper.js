/**
 * @file Thin adapter over chrome.tabs / chrome.tabGroups.
 */
import { buildCatchAll } from './catchall.js';
import { NO_GROUP } from './ledger.js';

/**
 * @param {number} windowId
 * @returns {Promise<{tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]}>}
 */
export async function getWindowSnapshot(windowId) {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }),
  ]);
  return { tabs, groups };
}

/**
 * Applies assignments. Reuses existing groups by title (case-insensitive);
 * tabs closed since classification are skipped instead of failing the batch.
 * @param {number} windowId
 * @param {import('./validate.js').GroupAssignment[]} assignments
 * @param {chrome.tabGroups.TabGroup[]} existingGroups
 * @returns {Promise<Set<number>>} Ids of tabs actually grouped.
 */
export async function applyGroups(windowId, assignments, existingGroups) {
  const byTitle = new Map(existingGroups.filter((g) => g.title).map((g) => [g.title.toLocaleLowerCase(), g.id]));
  const alive = new Set((await chrome.tabs.query({ windowId })).map((t) => t.id));
  const grouped = new Set();

  for (const a of assignments) {
    const tabIds = a.tabIds.filter((id) => alive.has(id));
    if (!tabIds.length) continue;
    try {
      const existingId = byTitle.get(a.name.toLocaleLowerCase());
      if (existingId !== undefined) {
        await chrome.tabs.group({ groupId: existingId, tabIds });
      } else {
        const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
        await chrome.tabGroups.update(groupId, {
          title: a.name, color: /** @type {any} */ (a.color), ...(/** @type {any} */ (a).collapsed ? { collapsed: true } : {}),
        });
        byTitle.set(a.name.toLocaleLowerCase(), groupId);
      }
      tabIds.forEach((id) => grouped.add(id));
    } catch (err) {
      // Typical cause: user dragging a tab ("Tabs cannot be edited right now").
      console.warn('[AI Tab Grouper] applyGroups', a.name, err);
    }
  }
  return grouped;
}

/**
 * Puts every still-ungrouped eligible tab into the catch-all group.
 * @param {number} windowId
 * @param {Set<number>} eligibleIds Tabs this run was allowed to group.
 * @param {string} language
 * @returns {Promise<Set<number>>} Ids moved into the catch-all group.
 */
export async function groupLeftovers(windowId, eligibleIds, language) {
  const { tabs, groups } = await getWindowSnapshot(windowId);
  const loose = tabs
    .filter((t) => t.groupId === NO_GROUP && eligibleIds.has(/** @type {number} */ (t.id)))
    .map((t) => /** @type {number} */ (t.id));
  const assignment = buildCatchAll(loose, groups.map((g) => g.title ?? '').filter(Boolean), language);
  return assignment ? applyGroups(windowId, [assignment], groups) : new Set();
}

/**
 * Removes every tab in the window from its group.
 * @param {number} windowId
 * @returns {Promise<number>} Number of tabs ungrouped.
 */
export async function ungroupAll(windowId) {
  const ids = (await chrome.tabs.query({ windowId }))
    .filter((t) => t.groupId !== NO_GROUP)
    .map((t) => /** @type {number} */ (t.id));
  if (ids.length) await chrome.tabs.ungroup(ids);
  return ids.length;
}
