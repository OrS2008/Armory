# Mobile and tablet QA

Date: 2026-08-07

## Implemented

- Dedicated mobile card layout for soldiers instead of a compressed table.
- Fixed bottom navigation with five primary destinations.
- Slide-in full navigation for secondary destinations.
- `viewport-fit=cover` and safe-area spacing for top header, content, dialogs and bottom navigation.
- 16px mobile inputs to prevent iOS focus zoom.
- 44px filter, toolbar and primary button targets.
- Stacked expanded soldier sections and single-column equipment rows.
- Compact landscape bottom navigation.

## Browser measurements

Measured against the running Vite application using the browser viewport API.

| Profile              |  Viewport | Horizontal overflow | Bottom nav           | Input size | Filter target |
| -------------------- | --------: | ------------------- | -------------------- | ---------: | ------------: |
| iPhone Pro Max class |   430×932 | No                  | Grid                 |       16px |          44px |
| iPhone class         |   390×844 | No                  | Grid                 |       16px |          44px |
| Small iPhone         |   375×812 | No                  | Grid                 |       16px |          44px |
| Android              |   412×915 | No                  | Grid                 |       16px |          44px |
| Compact Android      |   360×800 | No                  | Grid                 |       16px |          44px |
| iPad Pro             | 1024×1366 | No                  | Hidden; tablet shell |       14px |          34px |
| iPad                 |  834×1194 | No                  | Hidden; tablet shell |       14px |          34px |
| Tablet               |  768×1024 | No                  | Hidden; tablet shell |       14px |          34px |

Tablet controls remain desktop-density pointer/touch hybrids; final device testing should confirm whether all tablet filters should also be raised to 44px.

## Not fully tested

- Physical iOS Safari and Android Chrome devices.
- Screen rotation on physical devices.
- Virtual keyboard behavior and safe-area changes while a dialog is open.
- Standalone PWA mode.
- Playwright projects: test definitions exist, but browser binary installation was interrupted and the suite could not launch.
