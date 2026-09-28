# Contributing

MIAO Motion is moving from its first runnable face-tracking release toward a packaged Windows application. Before opening a large pull request, create an issue describing the user problem, target milestone and smallest verifiable change.

## Development

```bash
npm install
npm run dev
npm run build
```

## Scope

The active roadmap and release gates live in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) and [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md). Accounts, cloud sync, marketplaces and plugin systems remain out of v1.0 scope.

Every behavior change needs one smallest useful check: a dependency-free unit check for pure logic, a build check for integration, or a recorded hardware acceptance result when cameras/GPUs are involved.

## Licenses and assets

- Code contributions are accepted under MPL-2.0.
- Use `Signed-off-by` to certify the Developer Certificate of Origin.
- Do not submit avatars, textures, fonts, model weights or binaries without a clear source and redistribution license.
- Do not upload user models or commercial models as bug samples.
