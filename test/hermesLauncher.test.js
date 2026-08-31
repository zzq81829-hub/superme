import test from "node:test";
import assert from "node:assert/strict";
import { buildHermesLaunchSpec, openHermesUI } from "../src/integrations/hermes/launcher.js";

test("Hermes launcher opens the official desktop client", (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows-only launcher");
    return;
  }

  const spec = buildHermesLaunchSpec({ agents: { hermes: { command: "hermes" } } });
  assert.match(spec.launcher, /apps[\\/]desktop[\\/]release[\\/]win-unpacked[\\/]Hermes\.exe$/i);
  assert.deepEqual(spec.args, []);
  assert.equal(spec.env.HERMES_DESKTOP_CWD, process.cwd());
  assert.equal(spec.interface, "desktop-client");
});

test("Hermes desktop launcher starts detached without a shell", (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows-only launcher");
    return;
  }

  let invocation;
  const fakeChild = { pid: 4321, unref() {} };
  const result = openHermesUI(
    { agents: { hermes: { command: "hermes" } } },
    {
      spawnImpl(command, args, options) {
        invocation = { command, args, options };
        return fakeChild;
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.pid, 4321);
  assert.equal(result.interface, "desktop-client");
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.detached, true);
  assert.equal(invocation.options.windowsHide, true);
});
