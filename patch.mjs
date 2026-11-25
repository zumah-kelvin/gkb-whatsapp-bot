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

  // Socket & Cmd safe require fallback
  if (content.includes("const Socket = window.require('WAWebSocketModel').Socket;")) {
    content = content.replace(
      "const Socket = window.require('WAWebSocketModel').Socket;\n                const Cmd = window.require('WAWebCmd').Cmd;",
      `const getMod = (name) => { try { return window.require ? window.require(name) : null; } catch(e) { return null; } };\n                const Socket = getMod('WAWebSocketModel')?.Socket;\n                const Cmd = getMod('WAWebCmd')?.Cmd;\n                if (!Socket || !Cmd) return;`
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
    console.log('✅ Patched whatsapp-web.js Client.js (SignalStore & Invariant #56356 protected)');
  }

  fs.writeFileSync(clientPath, content, 'utf8');
  console.log('✅ Patched whatsapp-web.js Client.js');
}
