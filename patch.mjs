import fs from 'fs';
import path from 'path';

// 1. Patch Utils.js
const utilsPath = path.resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
if (fs.existsSync(utilsPath)) {
  let content = fs.readFileSync(utilsPath, 'utf8');
  const regex = /cannotBeRanked:\s*window\s*\.require\('WAWebStatusGatingUtils'\)\s*\.canCheckStatusRankingPosterGating\(\),/;
  if (regex.test(content)) {
    const replacement = `cannotBeRanked: (() => {
                        try {
                            const u = window.require ? window.require('WAWebStatusGatingUtils') : null;
                            return typeof u?.canCheckStatusRankingPosterGating === 'function' ? u.canCheckStatusRankingPosterGating() : false;
                        } catch (e) {
                            return false;
                        }
                    })(),`;
    content = content.replace(regex, replacement);
    fs.writeFileSync(utilsPath, content, 'utf8');
    console.log('✅ Patched whatsapp-web.js Utils.js');
  }
}

// 2. Patch AuthStore.js
const authStorePath = path.resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'AuthStore', 'AuthStore.js');
if (fs.existsSync(authStorePath)) {
  let content = fs.readFileSync(authStorePath, 'utf8');
  if (content.includes("window.AuthStore.AppState = window.require('WAWebSocketModel').Socket;")) {
    content = content.replace(
      "exports.ExposeAuthStore = () => {",
      `exports.ExposeAuthStore = () => {\n    const getMod = (name) => { try { return window.require ? window.require(name) : null; } catch (e) { return null; } };`
    );
    content = content.replace("window.AuthStore.AppState = window.require('WAWebSocketModel').Socket;", "window.AuthStore.AppState = getMod('WAWebSocketModel')?.Socket;");
    content = content.replace("window.AuthStore.Cmd = window.require('WAWebCmd').Cmd;", "window.AuthStore.Cmd = getMod('WAWebCmd')?.Cmd;");
    content = content.replace("window.AuthStore.Conn = window.require('WAWebConnModel').Conn;", "window.AuthStore.Conn = getMod('WAWebConnModel')?.Conn;");
    content = content.replace("window.AuthStore.OfflineMessageHandler = window.require(\n        'WAWebOfflineHandler',\n    ).OfflineMessageHandler;", "window.AuthStore.OfflineMessageHandler = getMod('WAWebOfflineHandler')?.OfflineMessageHandler;");
    content = content.replace("window.AuthStore.PairingCodeLinkUtils = window.require(\n        'WAWebAltDeviceLinkingApi',\n    );", "window.AuthStore.PairingCodeLinkUtils = getMod('WAWebAltDeviceLinkingApi');");
    content = content.replace("window.AuthStore.Base64Tools = window.require('WABase64');", "window.AuthStore.Base64Tools = getMod('WABase64');");
    fs.writeFileSync(authStorePath, content, 'utf8');
    console.log('✅ Patched whatsapp-web.js AuthStore.js');
  }
}

// 3. Patch Client.js
const clientPath = path.resolve('node_modules', 'whatsapp-web.js', 'src', 'Client.js');
if (fs.existsSync(clientPath)) {
  let content = fs.readFileSync(clientPath, 'utf8');

  // Safe global replaces for Socket, Cmd, Conn
  content = content.replace(/window\.require\(['"]WAWebSocketModel['"]\)\.Socket/g, "window.require?.('WAWebSocketModel')?.Socket");
  content = content.replace(/window\.require\(['"]WAWebCmd['"]\)\.Cmd/g, "window.require?.('WAWebCmd')?.Cmd");
  content = content.replace(/window\.require\(['"]WAWebConnModel['"]\)\.Conn/g, "window.require?.('WAWebConnModel')?.Conn");
  content = content.replace(/window\.require\(['"]WAWebCmd['"]\)\.Cmd\.refreshQR\(\)/g, "window.require?.('WAWebCmd')?.Cmd?.refreshQR?.()");

  // Login page bypass for waitForFunction
  if (!content.includes("this.pupPage.url().includes('/login')")) {
    content = content.replace(
      "const needAuthHandle = await this.pupPage.waitForFunction(",
      `let needAuthentication = null;\n            if (this.pupPage.url().includes('/login')) {\n                needAuthentication = { need: true, state: 'UNPAIRED' };\n            } else {\n                const needAuthHandle = await this.pupPage.waitForFunction(`
    );
    content = content.replace(
      "const needAuthentication = await needAuthHandle.jsonValue();",
      "needAuthentication = await needAuthHandle.jsonValue();\n            }"
    );
  }

  // Fix Invariant Violation #56356 during QR generation in Client.inject()
  const qrEvaluateRegex = /await this\.pupPage\.evaluate\(async \(\) => \{[\s\S]*?waSignalStore\.getRegistrationInfo\(\)[\s\S]*?\}\);\s*\}\s*\}\s*await exposeFunctionIfAbsent\(\s*this\.pupPage,\s*'onAuthAppStateChangedEvent'/;
  if (qrEvaluateRegex.test(content)) {
    const safeQrEvaluate = `await this.pupPage.evaluate(async () => {
                        const checkDomQr = () => {
                            try {
                                const el = document.querySelector('[data-ref]');
                                if (el) {
                                    const ref = el.getAttribute('data-ref');
                                    if (ref && typeof window.onQRChangedEvent === 'function') {
                                        window.onQRChangedEvent(ref);
                                        return true;
                                    }
                                }
                            } catch (_) {}
                            return false;
                        };

                        if (checkDomQr()) {
                            try {
                                const observer = new MutationObserver(() => checkDomQr());
                                observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-ref'] });
                            } catch (_) {}
                            return;
                        }

                        // Try internal signal store if possible, safely catching any invariant/assertion error
                        try {
                            const getMod = (name) => { try { return window.require ? window.require(name) : null; } catch(e) { return null; } };
                            const signalStore = getMod('WAWebSignalStoreApi')?.waSignalStore;
                            const userPrefs = getMod('WAWebUserPrefsInfoStore')?.waNoiseInfo;
                            const base64 = getMod('WABase64');
                            const userPrefsMD = getMod('WAWebUserPrefsMultiDevice');
                            const regUtils = getMod('WAWebCompanionRegClientUtils');

                            if (signalStore && userPrefs && base64 && userPrefsMD && regUtils) {
                                const registrationInfo = await signalStore.getRegistrationInfo();
                                const noiseKeyPair = await userPrefs.get();
                                const staticKeyB64 = base64.encodeB64(noiseKeyPair.staticKeyPair.pubKey);
                                const identityKeyB64 = base64.encodeB64(registrationInfo.identityKeyPair.pubKey);
                                const advSecretKey = await userPrefsMD.getADVSecretKey();
                                const platform = regUtils.DEVICE_PLATFORM;
                                const getQR = (ref) =>
                                    ref +
                                    ',' +
                                    staticKeyB64 +
                                    ',' +
                                    identityKeyB64 +
                                    ',' +
                                    advSecretKey +
                                    ',' +
                                    platform;

                                const onRefChange = (_, ref) => {
                                    if (ref == null) return;
                                    if (typeof window.onQRChangedEvent === 'function') {
                                        window.onQRChangedEvent(getQR(ref));
                                    }
                                };

                                const conn = getMod('WAWebConnModel')?.Conn;
                                if (conn) {
                                    if (conn.ref && typeof window.onQRChangedEvent === 'function') {
                                        window.onQRChangedEvent(getQR(conn.ref));
                                    }
                                    conn.on('change:ref', onRefChange);
                                }
                            }
                        } catch (err) {
                            console.warn('SignalStore QR bypassed:', err?.message || err);
                        }

                        // Fall back to polling DOM for [data-ref] QR code
                        const poll = setInterval(() => {
                            if (checkDomQr()) clearInterval(poll);
                        }, 500);
                        try {
                            const observer = new MutationObserver(() => {
                                if (checkDomQr()) observer.disconnect();
                            });
                            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-ref'] });
                        } catch (_) {}
                    });
                }
            }

            await exposeFunctionIfAbsent(
                this.pupPage,
                'onAuthAppStateChangedEvent'`;

    content = content.replace(qrEvaluateRegex, safeQrEvaluate);
  }

  // Robust listeners registration with polling & DOM chat detection
  const listenersBlockRegex = /await exposeFunctionIfAbsent\(\s*this\.pupPage,\s*'onLogoutEvent'[\s\S]*?\);\s*await this\.pupPage\.evaluate\(\(\) => \{[\s\S]*?window\._wwjsListeners = listeners;[\s\S]*?\}\);\s*\}\s*catch\s*\(err\)\s*\{/;
  if (listenersBlockRegex.test(content)) {
    const safeListenersBlock = `await exposeFunctionIfAbsent(
                this.pupPage,
                'onLogoutEvent',
                async () => {
                    this.lastLoggedOut = true;
                    await this.pupPage
                        .waitForNavigation({ waitUntil: 'load', timeout: 5000 })
                        .catch((_) => _);
                },
            );

            await this.pupPage.evaluate(() => {
                const getMod = (name) => {
                    try { return window.require ? window.require(name) : null; } catch(e) { return null; }
                };

                const attachListeners = () => {
                    const Socket = getMod('WAWebSocketModel')?.Socket;
                    const Cmd = getMod('WAWebCmd')?.Cmd;
                    if (!Socket || !Cmd) {
                        // DOM Fallback: Check if user already scanned and reached chat list
                        if (document.querySelector('#pane-side') || document.querySelector('[data-icon="chat"]')) {
                            if (typeof window.onAppStateHasSyncedEvent === 'function') {
                                window.onAppStateHasSyncedEvent();
                                return true;
                            }
                        }
                        return false;
                    }

                    const listeners = [
                        [
                            Socket,
                            'change:state',
                            (_AppState, state) => {
                                if (typeof window.onAuthAppStateChangedEvent === 'function') {
                                    window.onAuthAppStateChangedEvent(state);
                                }
                            },
                        ],
                        [
                            Socket,
                            'change:hasSynced',
                            () => {
                                if (typeof window.onAppStateHasSyncedEvent === 'function') {
                                    window.onAppStateHasSyncedEvent();
                                }
                            },
                        ],
                        [
                            Cmd,
                            'offline_progress_update_from_bridge',
                            () => {
                                try {
                                    const progress = window.require('WAWebOfflineHandler').OfflineMessageHandler.getOfflineDeliveryProgress();
                                    if (typeof window.onOfflineProgressUpdateEvent === 'function') {
                                        window.onOfflineProgressUpdateEvent(progress);
                                    }
                                } catch (_) {}
                            },
                        ],
                        [
                            Cmd,
                            'logout',
                            async () => {
                                if (typeof window.onLogoutEvent === 'function') {
                                    await window.onLogoutEvent();
                                }
                            },
                        ],
                        [
                            Cmd,
                            'logout_from_bridge',
                            async () => {
                                if (typeof window.onLogoutEvent === 'function') {
                                    await window.onLogoutEvent();
                                }
                            },
                        ],
                    ];

                    if (window._wwjsListeners) {
                        for (const [obj, event, handler] of window._wwjsListeners) {
                            if (obj && typeof obj.off === 'function') obj.off(event, handler);
                        }
                    }

                    for (const [obj, event, handler] of listeners) {
                        if (obj && typeof obj.on === 'function') obj.on(event, handler);
                    }
                    window._wwjsListeners = listeners;

                    const storeInjected = typeof window.WWebJS !== 'undefined';
                    if (Socket?.hasSynced === true && !storeInjected) {
                        if (typeof window.onAppStateHasSyncedEvent === 'function') {
                            window.onAppStateHasSyncedEvent();
                        }
                    }
                    return true;
                };

                if (!attachListeners()) {
                    const attachInterval = setInterval(() => {
                        if (attachListeners()) clearInterval(attachInterval);
                    }, 500);
                }
            });
        } catch (err) {`;

    content = content.replace(listenersBlockRegex, safeListenersBlock);
    console.log('✅ Patched whatsapp-web.js Client.js (Listeners polling & DOM sync attached)');
  }

  fs.writeFileSync(clientPath, content, 'utf8');
  console.log('✅ Patched whatsapp-web.js Client.js (All guards applied)');
}
