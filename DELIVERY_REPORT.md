# School NFC Release Verification

- Generated: `2026-09-18T02:42:43Z`
- Branch: `main`
- Starting commit: `294d55b`

| Check | Requirement | Result | Duration |
|---|---:|---:|---:|
| Frozen dependency installation | yes | FAIL (1) | 5s |
| Formatting | yes | FAIL (1) | 0s |
| Lint | yes | FAIL (1) | 6s |
| TypeScript type check | yes | FAIL (1) | 0s |
| Unit and integration tests | yes | FAIL (1) | 5s |
| Production web/functions build | yes | FAIL (1) | 0s |
| Static security gate | yes | FAIL (1) | 5s |
| Git whitespace and conflict-marker check | yes | PASS | 0s |
| Production dependency vulnerability audit | yes | FAIL (1) | 0s |
| Firestore and Storage emulator rules tests | yes | FAIL (1) | 5s |
| Android unit tests and debug APK | conditional | SKIPPED | 0s |

## Evidence

### Frozen dependency installation

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Formatting

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Lint

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### TypeScript type check

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Unit and integration tests

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Production web/functions build

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Static security gate

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Git whitespace and conflict-marker check

```text

```

### Production dependency vulnerability audit

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Firestore and Storage emulator rules tests

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz
/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051
    throw new Error(
          ^

Error: Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.17.1.tgz; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting
    at fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22051:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
    ... 4 lines matching cause stack trace ...
    at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:13510:13
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async fetch (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22045:16)
      at async fetchUrlStream (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22081:20)
      at async download (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22204:18)
      at async installVersion (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22296:55)
      at async Engine.ensurePackageManager (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22847:32)
      at async Engine.executePackageManagerRequest (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:22958:25)
      at async Object.runMain (/opt/nvm/versions/node/v22.16.0/lib/node_modules/corepack/dist/lib/corepack.cjs:23648:7) {
    [cause]: Error: getaddrinfo EAI_AGAIN registry.npmjs.org
        at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26) {
      errno: -3001,
      code: 'EAI_AGAIN',
      syscall: 'getaddrinfo',
      hostname: 'registry.npmjs.org'
    }
  }
}

Node.js v22.16.0

```

### Android unit tests and debug APK

```text
Android SDK or Gradle wrapper is unavailable locally. The GitHub Android CI job is mandatory before release.

```

## Deployment prerequisites not stored in source

- Firebase development/staging/production project IDs
- Admin web Firebase/App Check environment values
- Android `google-services.json` for each environment
- Android release keystore and passwords
- GitHub Workload Identity Provider and deploy service account
- Initial platform-admin UID
