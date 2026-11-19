/**
 * @file Per-tab memory of what auto-grouping already decided, so it does not
 * fight the user (re-grouping a tab they pulled out) or re-pay for tabs whose
 * page did not change.
 */
import { hostOf } from './redact.js';

/** `chrome.tabGroups.TAB_GROUP_ID_NONE`, inlined so this module stays Chrome-free. */
export const NO_GROUP = -1;

/**
 * @typedef {'grouped'|'left'|'user'} Outcome
 *   grouped: placed by us · left: model left it alone · user: user ungrouped it after we grouped it
 * @typedef {{host: string, outcome: Outcome}} LedgerEntry
 * @typedef {Record<string, LedgerEntry>} Ledger
 */

/** @param {string|undefined} url */
export function isGroupableUrl(url) {
  return /^https?:\/\//i.test(url ?? '');
}

/**
 * Whether a tab may be sent in an AUTO run.
 * `user` entries are respected until the tab navigates to another host.
 * @param {{groupId:number, pinned:boolean, url?:string}} tab
 * @param {LedgerEntry|undefined} entry
 */
export function isAutoCandidate(tab, entry) {
  if (tab.pinned || tab.groupId !== NO_GROUP || !isGroupableUrl(tab.url)) return false;
  if (!entry) return true;
  return entry.outcome === 'left' || entry.host !== hostOf(tab.url ?? '');
}

/**
 * Whether a candidate is NEW information (worth paying for a model call).
 * Tabs previously left alone are context only, not a trigger.
 * @param {{url?:string}} tab
 * @param {LedgerEntry|undefined} entry
 */
export function isFreshCandidate(tab, entry) {
  return !entry || entry.host !== hostOf(tab.url ?? '');
}
