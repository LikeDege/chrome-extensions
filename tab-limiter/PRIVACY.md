# Tab Limiter Privacy Policy

**Last updated:** June 15, 2026

## Overview

Tab Limiter is a browser extension that helps you manage open tabs by automatically closing inactive tabs when you exceed your configured limit. This privacy policy explains what data the extension handles and how it is used.

## Data We Collect

Tab Limiter accesses the following data **only to provide its core functionality**:

- **Tab URLs and titles** — displayed in the extension popup and used for domain-based protection rules you configure
- **Tab activity data** — creation time, last access time, and visit count for each tab, used to determine which tabs are least active

## Data We Do NOT Collect

Tab Limiter does **not** collect, store, or transmit:

- Personally identifiable information (name, email, address, etc.)
- Page content (text, images, form data, passwords)
- Keystrokes, mouse movements, or scroll activity
- Location data
- Financial, health, or authentication information
- Communications (emails, messages, chats)

## How Data Is Stored

All data is stored **locally on your device** using the browser's `chrome.storage.local` API. No data is sent to any external server. No third-party analytics or tracking services are used.

## Data Sharing

We do **not** sell, rent, or share your data with third parties. All tab activity data remains on your device and is deleted when you uninstall the extension or clear extension storage.

## Permissions

| Permission | Purpose |
|------------|---------|
| `tabs` | Query open tabs, listen for tab events, and close inactive tabs |
| `storage` | Save your settings and tab activity data locally |
| `alarms` | Schedule periodic tab cleanup checks |

## Remote Code

Tab Limiter does **not** use remote code. All JavaScript, HTML, and CSS are bundled within the extension package.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in this document with an updated date.

## Contact

For questions about this privacy policy, please open an issue at:
https://github.com/LikeDege/chrome-extensions
