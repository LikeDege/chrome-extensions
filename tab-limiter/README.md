# Tab Limiter

A Chrome extension that automatically closes inactive tabs to keep your browser clean and performant.

## Features

- **Tab Limit** — Set a maximum number of open tabs (5–100)
- **Eviction Strategies**
  - **LRU** (Least Recently Used) — closes tabs you haven't visited in the longest time
  - **LFU** (Least Frequently Used) — closes tabs with the fewest visits
  - **Combined** — weighted score combining recency (70%) and frequency (30%)
- **Smart Protection** — pinned tabs, audible tabs, active tabs, and specific domains can be protected from eviction
- **Grace Period** — newly opened tabs are protected for a configurable time window
- **Manual Control** — one-click eviction, per-tab close, and priority boost
- **Badge Indicator** — shows tab count on the extension icon when approaching/exceeding the limit

## Install

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `tab-limiter` folder
4. The extension icon appears in the toolbar

## Usage

Click the extension icon to open the popup:

- **Tabs panel** — see all open tabs sorted by eviction priority (highest risk at top). Hover to reveal close (✕) and boost (↑) buttons.
- **Settings panel** — configure max tabs, strategy, grace period, check interval, and protected domains.
- **Toggle switch** — enable/disable automatic eviction globally.
- **"Evict Now" button** — immediately run eviction to close excess tabs.

## How It Works

1. The background service worker tracks every tab's creation time, last access time, and visit count.
2. A periodic alarm (configurable interval) checks the total tab count against your limit.
3. When tabs exceed the limit, the extension scores each non-protected tab and closes the lowest-priority ones until within the limit.
4. Tab activity data persists across browser restarts via `chrome.storage.local`.
