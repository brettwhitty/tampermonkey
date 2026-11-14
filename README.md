# tampermonkey
Pubic repo for some useful tampermonkey scripts.

# Under `./scripts/`...

> `sagemcom-fast3896-unspam.local.js`

## Cogeco HomeBox (Sagemcom FAST3896) — Unlock Admin UI

### Removes Cogeco's anti-user web UI _defacement_ across all config pages:

- OpenSync/app-managed flags
- the full *ReadOnly family
- guiIsLocked
- the QR app-intercept
- edit-mode flags
- hardcoded disables

...and injects a Save button where the native one was stripped (LAN IPv6).

---

* Leaves legit device-state locks and mode logic intact.
* Hides only physically-absent hardware

<img height="280" alt="image" src="https://github.com/user-attachments/assets/ad5e5cb2-78da-49a6-96ec-864802c3c6ba" />
