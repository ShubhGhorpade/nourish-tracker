# Third-party notices

The static build vendors React and ReactDOM 16.x production UMD runtime files under `public/vendor/` so the project can be built and tested in a network-isolated environment.

React is distributed under the MIT License. Copyright (c) Facebook, Inc. and its affiliates.

Barcode compatibility on browsers without the native `BarcodeDetector` API uses `@zxing/browser` 0.2.1, distributed under the MIT License. The production build copies its pinned UMD runtime from `node_modules` into the static Pages artifact; it is not loaded from a third-party CDN.

The React runtime should be refreshed when the project moves to a normal dependency-install/bundler workflow; see the README current limitations.
