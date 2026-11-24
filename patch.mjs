import fs from 'fs';
import path from 'path';

const botDir = path.resolve('.');

// 1. Patch Utils.js
const utilsPath = path.resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
if (fs.existsSync(utilsPath)) {
  let content = fs.readFileSync(utilsPath, 'utf8');
  const regex = /cannotBeRanked:\s*window\s*\.require\('WAWebStatusGatingUtils'\)\s*\.canCheckStatusRankingPosterGating\(\),/;
  if (regex.test(content)) {
    const replacement = `cannotBeRanked: (() => {
                        try {
                            const u = window.require('WAWebStatusGatingUtils');
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

  // Login page bypass
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

  // Socket & Cmd safe require
  if (content.includes("const Socket = window.require('WAWebSocketModel').Socket;")) {
    content = content.replace(
      "const Socket = window.require('WAWebSocketModel').Socket;\n                const Cmd = window.require('WAWebCmd').Cmd;",
      `const getMod = (name) => { try { return window.require ? window.require(name) : null; } catch(e) { return null; } };\n                const Socket = getMod('WAWebSocketModel')?.Socket;\n                const Cmd = getMod('WAWebCmd')?.Cmd;\n                if (!Socket || !Cmd) return;`
    );
  }

  fs.writeFileSync(clientPath, content, 'utf8');
  console.log('✅ Patched whatsapp-web.js Client.js');
}
