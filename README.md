# maplibre-isochrone-control

[![License](https://img.shields.io/npm/l/@maptoolkit/maplibre-isochrone-control?style=plastic)](LICENSE)
[![Version](https://img.shields.io/npm/v/@maptoolkit/maplibre-isochrone-control?style=plastic)](https://www.npmjs.com/package/@maptoolkit/maplibre-isochrone-control)
[![Downloads](https://img.shields.io/npm/dm/@maptoolkit/maplibre-isochrone-control?style=plastic)](https://www.npmjs.com/package/@maptoolkit/maplibre-isochrone-control)

A [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) control plugin that lets users drag an isochrone marker onto the map to show a travel-time area.

**[Live demo](https://maptoolkit.github.io/maplibre-isochrone-control/)**

## Install

```bash
npm install @maptoolkit/maplibre-isochrone-control maplibre-gl
```

## Usage

```js
import * as maplibregl from "maplibre-gl";
import { IsochroneControl } from "@maptoolkit/maplibre-isochrone-control";
import "@maptoolkit/maplibre-isochrone-control/style.css";

const map = new maplibregl.Map({ container: "map", style, center, zoom });
map.addControl(
  new IsochroneControl({
    apiKey: "YOUR_API_KEY",
    routingProfile: "foot",
    timeLimit: 10,
  }),
);
```

Drag the control's handle onto the map to drop a marker. The control requests the isochrone polygon for that point, draws it, and fits the map to its bounds. Drag the marker to reposition it, or click its remove button, to clear the isochrone.

By default the control is placed in the bottom-right corner; pass a position to `addControl` to change that:

```js
map.addControl(new IsochroneControl(), "bottom-left");
```

### Without a bundler

The package is ESM-only (no UMD/CJS build). Loading it straight from a CDN via
a `<script>` tag works with an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)
to resolve the bare `maplibre-gl` specifier:

```html
<link href="https://unpkg.com/maplibre-gl@^6.0.0/dist/maplibre-gl.css" rel="stylesheet" />
<link href="https://unpkg.com/@maptoolkit/maplibre-isochrone-control@^1.0.0/dist/maplibre-isochrone-control.css" rel="stylesheet" />

<script type="importmap">
  {
    "imports": {
      "maplibre-gl": "https://unpkg.com/maplibre-gl@^6.0.0/dist/maplibre-gl.mjs"
    }
  }
</script>
<script type="module">
  import * as maplibregl from "maplibre-gl";
  import { IsochroneControl } from "https://unpkg.com/@maptoolkit/maplibre-isochrone-control@^1.0.0/dist/maplibre-isochrone-control.js";

  const map = new maplibregl.Map({ container: "map", style, center, zoom });
  map.addControl(new IsochroneControl());
</script>
```

## Options

| Option           | Type                                                  | Default                | Description                                                                                                                                  |
| ---------------- | ----------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`       | `"maptoolkit" \| "graphhopper" \| IsochroneRequestFn` | `"maptoolkit"`         | Which routing backend to use, or a custom function that resolves to the isochrone's outer ring.                                              |
| `apiUrl`         | `string`                                              | maptoolkit routing API | Base URL of the routing API. Required when `provider` is `"graphhopper"`.                                                                    |
| `apiKey`         | `string`                                              | —                      | API key for the routing backend.                                                                                                             |
| `timeLimit`      | `number`                                              | `10`                   | Travel time used for the isochrone calculation, in minutes.                                                                                  |
| `routingProfile` | `string`                                              | `"foot"`               | Routing profile, passed through to the routing API as-is; `"foot"`, `"bike"`, and `"car"` additionally get a matching icon and tooltip text. |
| `fitBounds`      | `boolean \| FitBoundsOptions`                         | `true`                 | Whether the map fits to the isochrone's bounds once it loads.                                                                                |

### Custom provider

Pass a function as `provider` to fully control request building and response parsing for a backend that isn't built in:

```js
new IsochroneControl({
  provider: async (lngLat, { routingProfile, timeLimit }, signal) => {
    const response = await fetch(`https://example.com/isochrone?lat=${lngLat.lat}&lng=${lngLat.lng}&profile=${routingProfile}&time=${timeLimit}`, { signal });
    const data = await response.json();
    return data.ring; // [[lng, lat], ...]
  },
});
```

### Custom routing profiles

For a `routingProfile` other than `"foot"`, `"bike"`, or `"car"`, the handle falls back to a generic icon and the tooltip is hidden (a `IsochroneControl.Tooltip.<profile>` warning is logged) unless you provide both yourself:

```js
const map = new maplibregl.Map({
  container: "map",
  style,
  center,
  zoom,
  locale: {
    "IsochroneControl.Tooltip.scooter": "Drag me onto the map to show a {time}-min scooter area.",
  },
});
```

```css
.maplibre-isochrone-control-chronee-scooter {
  background-image: url("scooter-icon.svg");
}
```

## Methods

```js
const control = new IsochroneControl();
map.addControl(control);

control.addToMap({ lng: 11.4, lat: 47.27 });
control.removeFromMap();
```

| Method             | Description                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `addToMap(lngLat)` | Drops the marker at `lngLat` and requests/draws its isochrone, same as dragging the handle onto the map. |
| `removeFromMap()`  | Removes the marker and isochrone layer, same as clicking the remove button.                              |

## Styling

Appearance is controlled via CSS custom properties on `.maplibregl-map`, defined in `style.css`. That's the map container MapLibre itself creates, and an ancestor of both the toolbar handle and the dropped marker (which isn't nested inside `.maplibre-isochrone-control`), so overriding them there themes both consistently:

```css
.maplibregl-map {
  --isochrone-control-color-bg: #e2e7fd;
  --isochrone-control-color-accent: #0074d9;
}
```

See `src/style.css` for the full list of `--isochrone-control-*` variables.

## License

**maplibre-isochrone-control** is open-source under the [BSD 3-Clause License](LICENSE).
