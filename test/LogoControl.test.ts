import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { IsochroneControl } from "../src/IsochroneControl";

vi.mock("maplibre-gl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("maplibre-gl")>();

  class FakeMarker {
    element: HTMLElement;
    private _lngLat: unknown;
    _map: unknown;
    private _listeners: Record<string, Array<(ev: unknown) => void>> = {};

    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
    }

    setLngLat(lngLat: unknown) {
      this._lngLat = lngLat;
      return this;
    }

    getLngLat() {
      return this._lngLat;
    }

    addTo(map: unknown) {
      this._map = map;
      return this;
    }

    remove() {
      this._map = undefined;
      return this;
    }

    on(event: string, listener: (ev: unknown) => void) {
      (this._listeners[event] ??= []).push(listener);
      return this;
    }
  }

  return { ...actual, Marker: FakeMarker };
});

function createMockMap(): MaplibreMap & { addLayer: ReturnType<typeof vi.fn>; addSource: ReturnType<typeof vi.fn>; fitBounds: ReturnType<typeof vi.fn> } {
  const canvas = document.createElement("canvas");
  const locale: Record<string, string> = {};
  return {
    getCanvas: () => canvas,
    on: () => {},
    off: () => {},
    once: () => {},
    unproject: () => ({ lng: 0, lat: 0 }),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    setPaintProperty: vi.fn(),
    getLayer: () => true,
    getSource: () => true,
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    fitBounds: vi.fn(),
    _locale: locale,
    _getUIString: (key: string) => {
      const value = locale[key];
      if (value == null) throw new Error(`Missing UI string '${key}'`);
      return value;
    },
  } as unknown as MaplibreMap & { addLayer: ReturnType<typeof vi.fn>; addSource: ReturnType<typeof vi.fn>; fitBounds: ReturnType<typeof vi.fn> };
}

describe("IsochroneControl", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => [
          [1, 2],
          [3, 4],
          [1, 2],
        ],
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a container element on add", () => {
    const control = new IsochroneControl();
    const container = control.onAdd(createMockMap());

    expect(container).toBeInstanceOf(HTMLElement);
    expect(container.classList.contains("maplibregl-ctrl")).toBe(true);
    expect(container.classList.contains("maplibre-isochrone-control")).toBe(true);

    const chronee = container.querySelector(".maplibre-isochrone-control-chronee");
    expect(chronee?.classList.contains("maplibre-isochrone-control-chronee-foot")).toBe(true);
  });

  it("sets the tooltip text for the configured profile and time limit", () => {
    const control = new IsochroneControl({ routingProfile: "bike", timeLimit: 15 });
    const container = control.onAdd(createMockMap());

    const tooltip = container.querySelector<HTMLElement>(".maplibre-isochrone-control-tooltip");
    expect(tooltip?.innerText).toBe("Drag me onto the map to show a 15-min cycling area.");
  });

  it("defaults to the bottom-right position", () => {
    const control = new IsochroneControl();
    expect(control.getDefaultPosition()).toBe("bottom-right");
  });

  it("adds a marker and draws the isochrone polygon when added to the map", async () => {
    const map = createMockMap();
    const control = new IsochroneControl();
    control.onAdd(map);

    control.addToMap([11.4, 47.27]);

    await vi.waitFor(() => expect(map.addLayer).toHaveBeenCalled());

    const container = control.onAdd(map);
    expect(container.classList.contains("maplibre-isochrone-control-active")).toBe(true);
    expect(map.addSource).toHaveBeenCalledOnce();
    expect(map.fitBounds).toHaveBeenCalledOnce();
  });

  it("removes the marker and polygon on removeFromMap", async () => {
    const map = createMockMap();
    const control = new IsochroneControl();
    const container = control.onAdd(map);
    control.addToMap([11.4, 47.27]);
    await vi.waitFor(() => expect(map.addLayer).toHaveBeenCalled());

    control.removeFromMap();

    expect(container.classList.contains("maplibre-isochrone-control-active")).toBe(false);
    expect(map.removeLayer).toHaveBeenCalled();
    expect(map.removeSource).toHaveBeenCalled();
  });

  it("removes the container on remove", () => {
    const control = new IsochroneControl();
    const container = control.onAdd(createMockMap());
    document.body.appendChild(container);

    control.onRemove();

    expect(document.body.contains(container)).toBe(false);
  });
});
