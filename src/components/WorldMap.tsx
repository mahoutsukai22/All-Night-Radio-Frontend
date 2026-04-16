import {
  memo,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Marker,
  Sphere,
} from 'react-simple-maps';
import type { RadioStation } from '../lib/radio';

const geoUrl =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const MIN_GLOBE_SCALE = 180;
const ZOOM_SENSITIVITY = 0.35;
const COUNTRY_CLICK_DELAY_MS = 180;

type Props = {
  activeStationId?: string;
  onClearSelection: () => void;
  onCountryClick: (country: string) => void;
  onStationSelect: (station: RadioStation) => void;
  selectedCountry: string;
  stations: RadioStation[];
};

type Rotation = [number, number, number];

type DragState = {
  pointerX: number;
  pointerY: number;
  rotation: Rotation;
};

type PointerPosition = {
  x: number;
  y: number;
};

type PinchState = {
  distance: number;
  scale: number;
};

const MAP_WIDTH = 960;
const MAP_HEIGHT = 620;
const clampLatitude = (value: number) => Math.max(-55, Math.min(55, value));
const clampScale = (value: number) => Math.max(MIN_GLOBE_SCALE, value);
const getDistance = (first: PointerPosition, second: PointerPosition) =>
  Math.hypot(second.x - first.x, second.y - first.y);
const toRadians = (value: number) => (value * Math.PI) / 180;
const isPointOnFrontHemisphere = (
  longitude: number,
  latitude: number,
  rotation: Rotation
) => {
  const centerLongitude = toRadians(-rotation[0]);
  const centerLatitude = toRadians(-rotation[1]);
  const pointLongitude = toRadians(longitude);
  const pointLatitude = toRadians(latitude);
  const visibility =
    Math.sin(pointLatitude) * Math.sin(centerLatitude) +
    Math.cos(pointLatitude) *
      Math.cos(centerLatitude) *
      Math.cos(pointLongitude - centerLongitude);

  return visibility > -0.025;
};
const geometryHasVisiblePoint = (
  coordinates: unknown,
  rotation: Rotation
): boolean => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return false;
  }

  if (
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number'
  ) {
    return isPointOnFrontHemisphere(
      coordinates[0] as number,
      coordinates[1] as number,
      rotation
    );
  }

  return coordinates.some((value) => geometryHasVisiblePoint(value, rotation));
};
const geographyIsVisible = (geo: any, rotation: Rotation) =>
  geometryHasVisiblePoint(geo?.geometry?.coordinates, rotation);

function WorldMap({
  activeStationId,
  onClearSelection,
  onCountryClick,
  onStationSelect,
  selectedCountry,
  stations,
}: Props) {
  const [rotation, setRotation] = useState<Rotation>([8, -18, 0]);
  const [scale, setScale] = useState(265);
  const [isDragging, setIsDragging] = useState(false);
  const [isCursorVisible, setIsCursorVisible] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activePointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const pinchStateRef = useRef<PinchState | null>(null);
  const suppressClickRef = useRef(false);
  const countryClickTimeoutRef = useRef<number | null>(null);
  const rotationRef = useRef(rotation);
  const scaleRef = useRef(scale);

  const clearCountryClickTimeout = () => {
    if (countryClickTimeoutRef.current !== null) {
      window.clearTimeout(countryClickTimeoutRef.current);
      countryClickTimeoutRef.current = null;
    }
  };

  const updateCursorPosition = (clientX: number, clientY: number) => {
    const frame = frameRef.current;
    const cursor = cursorRef.current;

    if (!frame || !cursor) {
      return;
    }

    const bounds = frame.getBoundingClientRect();

    cursor.style.setProperty('--cursor-x', `${clientX - bounds.left}px`);
    cursor.style.setProperty('--cursor-y', `${clientY - bounds.top}px`);
  };

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const activePointers = activePointersRef.current;

      if (!activePointers.has(event.pointerId)) {
        return;
      }

      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (event.pointerType !== 'touch') {
        updateCursorPosition(event.clientX, event.clientY);
      }

      if (activePointers.size >= 2) {
        const [firstPointer, secondPointer] = Array.from(activePointers.values());
        const pinchState = pinchStateRef.current;

        if (!pinchState) {
          return;
        }

        const nextDistance = getDistance(firstPointer, secondPointer);

        if (Math.abs(nextDistance - pinchState.distance) > 2) {
          suppressClickRef.current = true;
        }

        setScale(clampScale(pinchState.scale * (nextDistance / pinchState.distance)));
        setIsDragging(false);
        return;
      }

      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.pointerX;
      const deltaY = event.clientY - dragState.pointerY;

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        suppressClickRef.current = true;
      }

      setRotation([
        dragState.rotation[0] + deltaX * 0.35,
        clampLatitude(dragState.rotation[1] - deltaY * 0.35),
        0,
      ]);
    };

    const handlePointerEnd = (event: globalThis.PointerEvent) => {
      const activePointers = activePointersRef.current;

      if (!activePointers.has(event.pointerId)) {
        return;
      }

      activePointers.delete(event.pointerId);

      if (activePointers.size >= 2) {
        const [firstPointer, secondPointer] = Array.from(activePointers.values());

        pinchStateRef.current = {
          distance: getDistance(firstPointer, secondPointer),
          scale: scaleRef.current,
        };
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }

      pinchStateRef.current = null;

      if (activePointers.size === 1) {
        const [remainingPointer] = Array.from(activePointers.values());

        dragStateRef.current = {
          pointerX: remainingPointer.x,
          pointerY: remainingPointer.y,
          rotation: rotationRef.current,
        };
        setIsDragging(true);
        return;
      }

      dragStateRef.current = null;
      setIsDragging(false);

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      clearCountryClickTimeout();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, []);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (event.pointerType !== 'touch') {
      updateCursorPosition(event.clientX, event.clientY);
      setIsCursorVisible(true);
    }

    if (activePointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(
        activePointersRef.current.values()
      );

      pinchStateRef.current = {
        distance: getDistance(firstPointer, secondPointer),
        scale: scaleRef.current,
      };
      dragStateRef.current = null;
      suppressClickRef.current = true;
      setIsDragging(false);
      return;
    }

    pinchStateRef.current = null;
    dragStateRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      rotation: rotationRef.current,
    };
    suppressClickRef.current = false;
    setIsDragging(true);
  };

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      return;
    }

    updateCursorPosition(event.clientX, event.clientY);
    setIsCursorVisible(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      return;
    }

    updateCursorPosition(event.clientX, event.clientY);
    setIsCursorVisible(true);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      return;
    }

    if (activePointersRef.current.size > 0) {
      return;
    }

    setIsCursorVisible(false);
  };

  const handleCountrySelect = (
    country: string,
    event: MouseEvent<SVGPathElement>
  ) => {
    if (suppressClickRef.current) {
      return;
    }

    clearCountryClickTimeout();

    if (event.detail > 1) {
      if (selectedCountry) {
        onClearSelection();
      }
      return;
    }

    countryClickTimeoutRef.current = window.setTimeout(() => {
      countryClickTimeoutRef.current = null;
      onCountryClick(country);
    }, COUNTRY_CLICK_DELAY_MS);
  };

  const handleStationSelect = (station: RadioStation) => {
    if (suppressClickRef.current) {
      return;
    }

    onStationSelect(station);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    setScale((current) => clampScale(current - event.deltaY * ZOOM_SENSITIVITY));
  };

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      return;
    }

    clearCountryClickTimeout();

    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest('.station-marker') || target.closest('.station-marker-hitarea')) {
      return;
    }

    if (!selectedCountry) {
      return;
    }

    onClearSelection();
  };

  return (
    <div
      className={
        isDragging
          ? 'world-map-frame world-map-frame-dragging'
          : 'world-map-frame'
      }
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      ref={frameRef}
    >
      <div
        aria-hidden="true"
        className={isCursorVisible ? 'radio-cursor radio-cursor-visible' : 'radio-cursor'}
        ref={cursorRef}
      >
        <span className="radio-cursor-dot" />
      </div>
      <ComposableMap
        className="world-map-svg"
        height={MAP_HEIGHT}
        projection="geoOrthographic"
        projectionConfig={{
          rotate: rotation,
          scale,
        }}
        width={MAP_WIDTH}
      >
        <Sphere
          className="map-sphere"
          fill="rgba(18, 48, 32, 0.97)"
          stroke="rgba(131, 255, 163, 0.22)"
          strokeWidth={1.5}
        />
        <Graticule
          className="map-graticule"
          stroke="rgba(144, 255, 172, 0.09)"
        />

        <Geographies geography={geoUrl}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo) => {
              if (!geographyIsVisible(geo, rotation)) {
                return null;
              }

              const countryName = geo.properties.name;
              const isSelected = selectedCountry === countryName;

              return (
                <Geography
                  className="map-country"
                  geography={geo}
                  key={geo.rsmKey}
                  onClick={(event: MouseEvent<SVGPathElement>) =>
                    handleCountrySelect(countryName, event)
                  }
                  style={{
                    default: {
                      fill: '#234f38',
                      outline: 'none',
                      stroke: isSelected
                        ? 'rgba(212, 255, 209, 0.92)'
                        : 'rgba(131, 255, 163, 0.18)',
                      strokeWidth: isSelected ? 1.2 : 0.5,
                    },
                    hover: {
                      fill: '#234f38',
                      outline: 'none',
                      stroke: 'rgba(212, 255, 209, 0.9)',
                      strokeWidth: 1.2,
                    },
                    pressed: {
                      fill: '#234f38',
                      stroke: 'rgba(212, 255, 209, 0.96)',
                      strokeWidth: 1.25,
                      outline: 'none',
                    },
                  }}
                />
              );
            })
          }
        </Geographies>

        {stations.map((station) => {
          if (
            typeof station.geo_lat !== 'number' ||
            typeof station.geo_long !== 'number' ||
            !isPointOnFrontHemisphere(station.geo_long, station.geo_lat, rotation)
          ) {
            return null;
          }

          const isActive = station.stationuuid === activeStationId;
          const radius = isActive
            ? 7
            : Math.max(
                2.5,
                Math.min(5, 2.5 + (station.clickcount ?? 0) / 800)
              );

          return (
            <Marker
              coordinates={[station.geo_long, station.geo_lat]}
              key={station.stationuuid}
              onClick={() => handleStationSelect(station)}
            >
              <circle
                className="station-marker-hitarea"
                cx={0}
                cy={0}
                r={radius + 8}
              />
              <circle
                className={
                  isActive
                    ? 'station-marker station-marker-active'
                    : 'station-marker'
                }
                cx={0}
                cy={0}
                r={radius}
              />
              {isActive && (
                <circle
                  className="station-marker-pulse"
                  cx={0}
                  cy={0}
                  r={radius + 6}
                />
              )}
            </Marker>
          );
        })}
      </ComposableMap>
    </div>
  );
}

const MemoizedWorldMap = memo(WorldMap);

MemoizedWorldMap.displayName = 'WorldMap';

export default MemoizedWorldMap;
