import { Map, IControl, MapStyleLoadEvent, Listener } from "maplibre-gl";

import {
  FitBoundsOptions as maplibreFitBoundsOptions,
  LngLatLike as maplibreLngLatLike,
  ControlPosition as maplibreControlPosition,
  Marker as maplibreMarker,
  LngLatBounds as maplibreLngLatBounds,
  PointLike as maplibrePointLike,
} from "maplibre-gl";

/**
 * Parameters passed to a custom {@link IsochroneRequestFn}.
 */
export type IsochroneRequestParams = {
  routingProfile: string;
  timeLimit: number;
};

/**
 * A custom isochrone request function. Receives the marker position and the
 * resolved request params, and must resolve to the outer ring of the
 * isochrone polygon as `[lng, lat]` pairs.
 */
export type IsochroneRequestFn = (lngLat: { lng: number; lat: number }, params: IsochroneRequestParams, signal: AbortSignal) => Promise<[number, number][]>;

/**
 * Which routing backend to use for isochrone requests. Pass a function to
 * fully control request building and response parsing for a backend that
 * isn't built in.
 */
export type IsochroneProvider = "maptoolkit" | "graphhopper" | IsochroneRequestFn;

/**
 * Options for configuring the {@link IsochroneControl}.
 */
export type IsochroneControlOptions = {
  /**
   * Which routing backend to use for isochrone requests.
   * @defaultValue `"maptoolkit"`
   */
  provider?: IsochroneProvider;
  /**
   * Base URL of the isochrone routing API.
   * Required when `provider` is `"graphhopper"`; ignored when `provider` is a
   * custom function; falls back to the maptoolkit routing API when `provider`
   * is `"maptoolkit"`.
   */
  apiUrl?: string;
  /**
   * API key for the routing backend.
   */
  apiKey?: string;
  /**
   * Time used for isochrone calculation. Value in minutes.
   * @defaultValue `10` minutes
   */
  timeLimit?: number;
  /**
   * Routing profile used for isochrone request.
   * @defaultValue `"foot"`
   */
  routingProfile?: string;
  /**
   * Whether the map bounds should fit the isochrone area. Alternatively accepts {@link FitBoundsOptions} object.
   * @defaultValue `true`
   */
  fitBounds?: boolean | maplibreFitBoundsOptions;
};

/**
 * Default options for the {@link IsochroneControl}.
 */
export const defaultIsochroneControlOptions: IsochroneControlOptions = {
  provider: "maptoolkit",
  timeLimit: 10,
  routingProfile: "foot",
  fitBounds: true,
};

/** The maptoolkit routing API, used when `provider` is `maptoolkit` and no `apiUrl` is set. */
const MAPTOOLKIT_API_URL = "https://routing.maptoolkit.net/";

// `_locale`/`_getUIString` are undocumented on Map; cast here so `StyleControl.*`
// keys work with the same `new Map({ locale })` table as built-in controls.
function getMapLocale(map: Map): Record<string, string> {
  return (map as unknown as { _locale: Record<string, string> })._locale;
}

function getUIString(map: Map, key: string): string {
  return (map as unknown as { _getUIString(key: string): string })._getUIString(key);
}

function toLngLatObject(lngLat: maplibreLngLatLike): { lng: number; lat: number } | undefined {
  if (Array.isArray(lngLat)) {
    const [lng, lat] = lngLat;
    return { lng, lat };
  }
  if ("lat" in lngLat) {
    const lng = "lon" in lngLat ? lngLat.lon : lngLat.lng;
    return { lng, lat: lngLat.lat };
  }
  return undefined;
}

/**
 * Provides an draggable isochrone control.
 *
 * Used by the {@link NavigationControl} class.
 */
export class IsochroneControl implements IControl {
  options: IsochroneControlOptions;

  private _id: string;
  private _container: HTMLElement;
  private _tooltip: HTMLElement;
  private _onDrag: EventListener;
  private _onDrop: EventListener;
  private _onStyleChange: Listener<MapStyleLoadEvent>;

  private _map?: Map;
  private _marker?: maplibreMarker;
  private _abortController?: AbortController;

  /**
   * @param options - Options for configuring the isochrone control.
   */
  constructor(options?: IsochroneControlOptions) {
    this.options = Object.assign({}, defaultIsochroneControlOptions, options);

    if (this.options.provider === "graphhopper" && !this.options.apiUrl) {
      console.warn("IsochroneControl: `apiUrl` must be set when using the `graphhopper` provider.");
    }

    this._id = `maplibre-isochrone-control-${Math.random().toString(36).substring(2, 9)}`; // Used to distinguish between different isochrone controls

    this._container = document.createElement("div");
    this._container.classList.add("maplibregl-ctrl", "maplibregl-ctrl-group", "maplibre-isochrone-control");

    // Control
    const chronee = document.createElement("div");
    chronee.classList.add("maplibre-isochrone-control-chronee", `maplibre-isochrone-control-chronee-${this.options.routingProfile}`);
    chronee.setAttribute("draggable", "true");
    chronee.addEventListener("dragstart", (ev: Event) => {
      const dragEvent = ev as DragEvent;
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.setData("dragged", "true"); // make element draggable in firefox
        dragEvent.dataTransfer.setData("maplibre-isochrone-control", this._id);
      }
    });

    const remove = document.createElement("button");
    remove.classList.add("maplibre-isochrone-control-chronee-remove");
    remove.addEventListener("click", () => {
      this.removeFromMap();
    });

    // Tooltip
    const tooltip = (this._tooltip = document.createElement("div"));
    this._tooltip.classList.add("maplibregl-ctrl-group", "maplibre-isochrone-control-tooltip");

    // Append children
    this._container.appendChild(remove);
    this._container.appendChild(chronee);
    this._container.appendChild(tooltip);

    this._onDrag = (ev: Event) => {
      ev.preventDefault();
    };

    this._onDrop = (ev: Event) => {
      ev.preventDefault();
      if (this._map && this._container) {
        const dragEvent = ev as DragEvent;
        const isIsochrone = dragEvent.dataTransfer?.getData("maplibre-isochrone-control") === this._id;
        if (isIsochrone) {
          const lngLat = this._map.unproject({ x: dragEvent.offsetX, y: dragEvent.offsetY } as maplibrePointLike);
          this.addToMap(lngLat);
        }
      }
    };

    this._onStyleChange = () => {
      if (this._map) {
        this._map.once("idle", () => {
          if (this._marker && this._marker._map === this._map) {
            this._addPolygon(this._marker.getLngLat());
          }
        });
      }
    };
  }

  getDefaultPosition(): maplibreControlPosition {
    return "bottom-right";
  }

  onAdd(map: Map) {
    if (this._map instanceof Map && this._map !== map) {
      this.onRemove();
    }

    this._map = map;

    const locale = getMapLocale(map);
    locale["IsochroneControl.Tooltip.foot"] ??= "Drag me onto the map to show a {time}-min walking area.";
    locale["IsochroneControl.Tooltip.bike"] ??= "Drag me onto the map to show a {time}-min cycling area.";
    locale["IsochroneControl.Tooltip.car"] ??= "Drag me onto the map to show a {time}-min driving area.";

    try {
      if (this.options.timeLimit) {
        this._tooltip.innerText = getUIString(map, `IsochroneControl.Tooltip.${this.options.routingProfile}`).replace(
          "{time}",
          this.options.timeLimit.toString(),
        );
      }
    } catch (err) {
      this._tooltip.remove();
      console.warn(err);
    }

    const mapCanvas = map.getCanvas();
    mapCanvas.addEventListener("dragover", this._onDrag);
    mapCanvas.addEventListener("dragenter", this._onDrag);
    mapCanvas.addEventListener("dragleave", this._onDrag);
    mapCanvas.addEventListener("drop", this._onDrop);
    map.on("style.load", this._onStyleChange);

    return this._container;
  }

  addToMap(lngLat: maplibreLngLatLike) {
    this._addMarker(lngLat);
    this._addPolygon(lngLat);

    if (this._container) {
      this._container.classList.add("maplibre-isochrone-control-active");
    }
  }

  removeFromMap() {
    this._removeMarker();
    this._removePolygon();
    if (this._container) {
      this._container.classList.remove("maplibre-isochrone-control-active");
    }
  }

  private _addMarker(lngLat: maplibreLngLatLike) {
    if (this._map) {
      this._removeMarker();
      if (lngLat) {
        const element = document.createElement("div");

        const chronee = document.createElement("div");
        chronee.classList.add("maplibre-isochrone-control-chronee", `maplibre-isochrone-control-chronee-${this.options.routingProfile}`);

        const remove = document.createElement("button");
        remove.classList.add("maplibre-isochrone-control-chronee-remove");
        remove.addEventListener("click", () => {
          this.removeFromMap();
        });

        element.appendChild(remove);
        element.appendChild(chronee);

        this._marker = new maplibreMarker({ element, anchor: "center", draggable: true });

        this._marker.on("dragend", (ev) => this._addPolygon(ev.target.getLngLat()));
        this._marker.on("click", (ev) => ev.originalEvent.preventDefault());

        this._marker.setLngLat(lngLat).addTo(this._map);
      }
    }
  }

  private _removeMarker() {
    if (this._marker) {
      this._marker.remove();
    }
  }

  private _addPolygon(lngLat: maplibreLngLatLike) {
    this._removePolygon();

    if (!this._map) {
      return;
    }
    const map = this._map;
    const point = toLngLatObject(lngLat);
    if (!point) {
      return;
    }

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();

    const request = this._resolveProvider();
    const params: IsochroneRequestParams = {
      routingProfile: this.options.routingProfile ?? "foot",
      timeLimit: this.options.timeLimit ?? 10,
    };

    request(point, params, this._abortController.signal)
      .then((ring) => {
        if (this._container.classList.contains("maplibre-isochrone-control-active")) {
          this._removePolygon();

          const coordinates = [ring];
          map.addSource(this._id, {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Polygon", coordinates },
                },
              ],
            },
          });

          map.addLayer({
            id: `${this._id}-fill`,
            type: "fill",
            source: this._id,
            paint: {
              "fill-color": "#9DACE7",
              "fill-opacity": 0,
            },
          });

          map.addLayer({
            id: `${this._id}-line`,
            type: "line",
            source: this._id,
            paint: {
              "line-color": "#9DACE7",
              "line-opacity": 0,
              "line-width": 1.4,
            },
          });

          // Set opacity after adding to map to let it fade in
          map.setPaintProperty(`${this._id}-fill`, "fill-opacity", 0.2);
          map.setPaintProperty(`${this._id}-line`, "line-opacity", 0.8);

          if (this.options.fitBounds) {
            const bounds = new maplibreLngLatBounds();
            const fitBoundsOptions = Object.assign({ padding: 100 }, this.options.fitBounds);
            coordinates.forEach((ring) => ring.forEach((ll) => bounds.extend(ll as maplibreLngLatLike)));
            map.fitBounds(bounds, fitBoundsOptions);
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error(err);
        }
      });
  }

  private _resolveProvider(): IsochroneRequestFn {
    const provider = this.options.provider ?? "maptoolkit";
    if (typeof provider === "function") {
      return provider;
    }
    return provider === "graphhopper" ? this._graphhopperRequest.bind(this) : this._maptoolkitRequest.bind(this);
  }

  private async _maptoolkitRequest(lngLat: { lng: number; lat: number }, params: IsochroneRequestParams, signal: AbortSignal): Promise<[number, number][]> {
    const url = new URL("isochrone", this.options.apiUrl || MAPTOOLKIT_API_URL);
    if (this.options.apiKey) {
      url.searchParams.set("api_key", this.options.apiKey);
    }
    url.searchParams.set("routeType", params.routingProfile);
    url.searchParams.set("time", params.timeLimit.toString());
    url.searchParams.set("point", `${lngLat.lat},${lngLat.lng}`);

    const response = await fetch(url.toString(), { signal });
    const pointList: number[][] = await response.json();
    return pointList.map((p) => [p[1], p[0]]);
  }

  private async _graphhopperRequest(lngLat: { lng: number; lat: number }, params: IsochroneRequestParams, signal: AbortSignal): Promise<[number, number][]> {
    if (!this.options.apiUrl) {
      throw new Error("IsochroneControl: `apiUrl` is required when using the `graphhopper` provider.");
    }
    const url = new URL("isochrone", this.options.apiUrl);
    if (this.options.apiKey) {
      url.searchParams.set("key", this.options.apiKey);
    }
    url.searchParams.set("profile", params.routingProfile);
    url.searchParams.set("time_limit", Math.round(params.timeLimit * 60).toString());
    url.searchParams.set("point", `${lngLat.lat},${lngLat.lng}`);

    const response = await fetch(url.toString(), { signal });
    const data: { polygons?: { geometry: { coordinates: [number, number][][] } }[] } = await response.json();
    const ring = data.polygons?.[0]?.geometry.coordinates[0];
    if (!ring) {
      throw new Error("IsochroneControl: graphhopper response did not contain a polygon.");
    }
    return ring;
  }

  private _removePolygon() {
    if (this._map && this._container) {
      if (this._map.getLayer(`${this._id}-fill`)) {
        this._map.removeLayer(`${this._id}-fill`);
      }

      if (this._map.getLayer(`${this._id}-line`)) {
        this._map.removeLayer(`${this._id}-line`);
      }

      if (this._map.getSource(this._id)) {
        this._map.removeSource(this._id);
      }
    }
  }

  onRemove() {
    this.removeFromMap();

    if (this._map) {
      const mapCanvas = this._map.getCanvas();
      mapCanvas.removeEventListener("dragover", this._onDrag);
      mapCanvas.removeEventListener("dragenter", this._onDrag);
      mapCanvas.removeEventListener("dragleave", this._onDrag);
      mapCanvas.removeEventListener("drop", this._onDrop);
      this._map.off("style.load", this._onStyleChange);
    }

    if (this._container?.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }

    this._map = undefined;
  }
}
